import { prisma } from '../prisma'
import { resolveCustomer } from './customer'
import { generateOAuthHeader } from './oauth'
import { buildRecordUrl } from './constants'
import type { NetSuiteInlineAddress } from './types'

/**
 * Extracts a numeric ID from strings like:
 *   "Online Sales (IID: 11)" → "11"
 *   "Direct to Consumer (28)" → "28"
 *   "Direct to Consumer (Value: 28)" → "28"
 *   "11" → "11"
 * Returns just the numeric ID as a string, or the original value if no pattern matches
 */
function extractNetSuiteId(value: string): string {
  if (!value) return value
  // Pattern 1: "Something (IID: 123)" → "123"
  const iidMatch = value.match(/\(IID:\s*(\d+)\)/i)
  if (iidMatch) return iidMatch[1]
  // Pattern 2: "Something (Value: 123)" → "123" (Custom field select format)
  const valueMatch = value.match(/\(Value:\s*(\d+)\)/i)
  if (valueMatch) return valueMatch[1]
  // Pattern 3: "Something (123)" → "123" (Custom mapping format)
  const parenMatch = value.match(/\((\d+)\)\s*$/)
  if (parenMatch) return parenMatch[1]
  // Pattern 4: Already just a number
  if (/^\d+$/.test(value.trim())) return value.trim()
  return value
}

/**
 * Interface for NetSuite Sales Order payload
 */
export interface NetSuiteSalesOrderPayload {
  entity: {
    id: string // NetSuite Customer Internal ID
  }
  subsidiary?: {
    id: string // Subsidiary ID
  }
  tranDate: string // Order date (YYYY-MM-DD) - NetSuite accepts both "tranDate" and "trandate"
  tranId?: string // Order number (optional, NetSuite will auto-generate if not provided)
  otherRefNum?: string // PO/Check Number - using Shopify order name (NetSuite accepts both "otherRefNum" and "otherrefnum")
  externalId?: string // External ID - using Shopify order ID
  memo?: string // Memo field
  custbody_sales_order_urgency?: {
    id: string // Custom field: Sales Order Urgency
  }
  custbody_sales_channel?: {
    id: string // Custom field: Sales Channel
  }
  class?: {
    id: string // Class ID
  }
  location?: {
    id: string // Location ID
  }
  orderStatus?: string // Order Status code (A=Pending Approval, B=Pending Fulfillment, etc.)
  billingAddress?: NetSuiteInlineAddress // Inline billing address on the transaction
  shippingAddress?: NetSuiteInlineAddress // Inline shipping address on the transaction
  item: {
    items: Array<{
      item: {
        refName?: string // Item reference name (SKU or item name) - preferred method
        itemid?: string // SKU (Stock Keeping Unit) - fallback if refName not available
      }
      quantity: number
      rate?: number // Price per unit (optional)
      description?: string // Item description/name
    }>
  }
  subtotal?: number
  taxTotal?: number
  shippingCost?: number
  total?: number
  currency?: {
    id?: string // Currency internal ID (numeric)
    refName?: string // Currency ISO code (e.g., "USD")
  }
  // Additional optional fields from NetSuite API
  shipDate?: string // Ship Date (YYYY-MM-DD)
  terms?: {
    id?: string // Payment terms ID
  }
  // Allow dynamic custom fields and other fields from mappings
  [key: string]: any
}

/**
 * Builds a NetSuite Sales Order JSON payload from database order data
 * Uses NetSuite IDs for customers and addresses, SKUs for products
 */
export async function buildNetSuiteSalesOrderPayload(
  shopifyOrderId: string
): Promise<{ payload: NetSuiteSalesOrderPayload; errors: string[]; customerWasCreated: boolean }> {
  const errors: string[] = []

  // Fetch all order lines for this order
  const orderLines = await prisma.orderLine.findMany({
    where: {
      shopifyOrderId,
      isDeleted: false,
    },
    orderBy: {
      lineItemId: 'asc',
    },
  })

  if (orderLines.length === 0) {
    throw new Error(`No order lines found for Shopify order ID: ${shopifyOrderId}`)
  }

  // Get order data from first line (all lines share the same order-level data)
  const firstLine = orderLines[0]

  // Resolve customer: 3-tier lookup (local DB → SuiteQL email → create in NetSuite)
  let netsuiteCustomerId: string | null = null
  let customerWasCreated = false

  // Fetch customer from local DB for address data
  let customer = null
  if (firstLine.customerId) {
    customer = await prisma.customer.findUnique({
      where: {
        shopifyCustomerId: firstLine.customerId,
      },
      include: {
        addresses: {
          where: {
            OR: [
              { isDefaultBilling: true },
              { isDefaultShipping: true },
            ],
          },
        },
      },
    })
  }

  if (!firstLine.customerId) {
    errors.push(`Order has no customer ID`)
  } else {
    try {
      const result = await resolveCustomer(
        firstLine.customerId,
        firstLine.customerEmail,
        {
          firstName: customer?.firstName,
          lastName: customer?.lastName,
          phone: customer?.phone,
        }
      )
      netsuiteCustomerId = result.netsuiteCustomerId
      customerWasCreated = result.wasCreated
    } catch (error) {
      errors.push(`Could not resolve NetSuite customer: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Get billing and shipping addresses from local DB
  const billingAddress = customer?.addresses.find((addr) => addr.isDefaultBilling)
  const shippingAddress = customer?.addresses.find((addr) => addr.isDefaultShipping)

  // Fetch PaymentMethodMapping for payment method
  const paymentMethodMappings = await prisma.paymentMethodMapping.findMany({
    where: {
      isActive: true,
    },
  })

  // Fetch default payment method setting
  let defaultPaymentMethod: string | null = null
  try {
    const defaultSetting = await prisma.mappingDefaults.findUnique({
      where: { settingKey: 'default_payment_method' },
    })
    if (defaultSetting && defaultSetting.isActive) {
      defaultPaymentMethod = defaultSetting.settingValue
    }
  } catch (error) {
    console.warn('Could not fetch default payment method setting:', error)
  }

  // Fetch ShipmentMethodMapping for shipping method
  const shipmentMethodMappings = await prisma.shipmentMethodMapping.findMany({
    where: {
      isActive: true,
    },
  })

  // Fetch OrderItemFieldMapping for line item fields
  const orderItemMappings = await prisma.orderItemFieldMapping.findMany({
    where: {
      isActive: true,
    },
  })

  // Fetch discount item setting
  const discountItemSetting = await prisma.mappingDefaults.findUnique({
    where: { settingKey: 'default_discount_item' },
  })
  const discountItemId = discountItemSetting?.settingValue || null

  // Fetch Shopify order data if needed for Order Line mappings
  let shopifyOrderDataForLineItems: any = null
  const needsShopifyOrderDataForLineItems = orderItemMappings.some(
    (m) => m.mappingType === 'Order Line'
  )

  if (needsShopifyOrderDataForLineItems) {
    try {
      const { getOrderByNameFromShopify } = await import('../shopify')
      shopifyOrderDataForLineItems = await getOrderByNameFromShopify(firstLine.shopifyOrderName)
      if (!shopifyOrderDataForLineItems) {
        console.warn(`⚠️ Could not fetch Shopify order data for line item mappings`)
        errors.push(`Could not fetch Shopify order data for Order Line mappings`)
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching Shopify order data for line items:`, error)
      errors.push(`Error fetching Shopify order data for line items: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Helper function to get nested value from Shopify line item using dot notation
  const getLineItemValue = (shopifyLineItem: any, path: string): any => {
    if (!shopifyLineItem) return null

    // Special handling for properties array (e.g., "properties.__pca_barcode")
    if (path.startsWith('properties.')) {
      const propName = path.substring('properties.'.length)
      if (shopifyLineItem.properties && Array.isArray(shopifyLineItem.properties)) {
        const property = shopifyLineItem.properties.find((p: any) => p.name === propName)
        return property?.value || null
      }
      return null
    }

    // Standard dot notation traversal for other fields
    const keys = path.split('.')
    let current = shopifyLineItem
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return null
      }
      current = current[key]
    }
    return current
  }

  // Helper function to get order item mapping value
  const getOrderItemMappingValue = (mapping: typeof orderItemMappings[0], shopifyLineItem: any): string | null => {
    switch (mapping.mappingType) {
      case 'Fixed':
        // For Fixed mappings, use shopifyValue (the fixed NetSuite ID/value)
        return mapping.shopifyValue || mapping.netsuiteId

      case 'Custom':
        // For Custom mappings, use shopifyValue (the value selected/entered when creating the mapping)
        return mapping.shopifyValue || null

      case 'Order Line':
        // For Order Line mappings, extract value from Shopify line item using shopifyCode
        if (!mapping.shopifyCode || !shopifyLineItem) {
          return null
        }
        // Remove "Custom: " prefix if present
        const fieldPath = mapping.shopifyCode.replace(/^Custom: /, '')
        const value = getLineItemValue(shopifyLineItem, fieldPath)
        return value != null ? String(value) : null

      default:
        return null
    }
  }

  // Build items array using refName (SKU or item name) and apply order item mappings
  // Uses flatMap to insert discount lines after each discounted item
  let perLineDiscountTotal = 0
  const items = orderLines
    .filter((line) => {
      // Filter out removed/cancelled items (current_quantity = 0)
      let effectiveQuantity = line.lineItemQuantity
      if (line.lineItemMetadata) {
        try {
          const meta = JSON.parse(line.lineItemMetadata)
          if (meta.current_quantity !== undefined) {
            effectiveQuantity = Number(meta.current_quantity)
          }
        } catch { /* use stored quantity */ }
      }
      if (effectiveQuantity === 0) {
        errors.push(`Line item "${line.lineItemSku || line.lineItemName}" has quantity 0 (removed/cancelled) - skipping`)
        return false
      }
      // Filter out lines without SKU or name
      if (!line.lineItemSku && !line.lineItemName) {
        errors.push(`Line item "${line.lineItemId}" has no SKU or name - skipping`)
        return false
      }
      return true
    })
    .flatMap((line, lineIndex) => {
      const itemObj: { refName?: string; itemid?: string } = {}

      // Prefer refName (SKU), fallback to item name if SKU not available
      if (line.lineItemSku) {
        itemObj.refName = line.lineItemSku
      } else if (line.lineItemName) {
        itemObj.refName = line.lineItemName
      }

      // Fallback to itemid if refName not available (for backward compatibility)
      if (!itemObj.refName && line.lineItemSku) {
        itemObj.itemid = line.lineItemSku
      }

      // Use current_quantity from metadata if available (handles order edits)
      let lineQuantity = line.lineItemQuantity || 1
      if (line.lineItemMetadata) {
        try {
          const meta = JSON.parse(line.lineItemMetadata)
          if (meta.current_quantity !== undefined && meta.current_quantity > 0) {
            lineQuantity = Number(meta.current_quantity)
          }
        } catch { /* use stored quantity */ }
      }

      // Build the base line item
      const lineItem: any = {
        item: itemObj,
        quantity: lineQuantity,
        rate: line.lineItemPrice || undefined,
        description: line.lineItemName || undefined,
      }

      // Find the corresponding Shopify line item for this order line
      let shopifyLineItem: any = null
      if (shopifyOrderDataForLineItems?.line_items && Array.isArray(shopifyOrderDataForLineItems.line_items)) {
        // Try to match by line item ID or by index
        shopifyLineItem = shopifyOrderDataForLineItems.line_items.find(
          (li: any) => String(li.id) === String(line.lineItemId)
        ) || shopifyOrderDataForLineItems.line_items[lineIndex]
      }

      // Apply order item mappings to this line item
      for (const mapping of orderItemMappings) {
        const mappingValue = getOrderItemMappingValue(mapping, shopifyLineItem)
        if (mappingValue !== null) {
          // Extract numeric ID if needed (for fields like class, location, etc.)
          const finalValue = extractNetSuiteId(mappingValue)

          // Handle custom fields (custcol_)
          if (mapping.netsuiteId.startsWith('custcol_')) {
            lineItem[mapping.netsuiteId] = finalValue
          } else {
            // Handle standard NetSuite fields
            // For fields that need object format (like class, location), wrap in object
            const fieldsNeedingObjectFormat = ['class', 'location', 'department', 'priceLevel', 'purchaseOrderVendor', 'unitsOfMeasure']
            if (fieldsNeedingObjectFormat.includes(mapping.netsuiteId)) {
              lineItem[mapping.netsuiteId] = { id: finalValue }
            } else {
              lineItem[mapping.netsuiteId] = finalValue
            }
          }
        }
      }

      const result: any[] = [lineItem]

      // Add per-line discount item if this line has discount_allocations
      if (discountItemId) {
        let lineDiscount = 0

        // Try to get discount from lineItemMetadata (has discount_allocations)
        if (line.lineItemMetadata) {
          try {
            const metadata = JSON.parse(line.lineItemMetadata)
            if (metadata.discount_allocations && Array.isArray(metadata.discount_allocations)) {
              lineDiscount = metadata.discount_allocations.reduce(
                (sum: number, alloc: any) => sum + (parseFloat(alloc.amount) || 0),
                0
              )
            } else if (metadata.total_discount) {
              lineDiscount = parseFloat(metadata.total_discount) || 0
            }
          } catch {
            // Fallback: use lineItemTotal - lineItemNet if available
            if (line.lineItemTotal && line.lineItemNet && line.lineItemTotal > line.lineItemNet) {
              lineDiscount = line.lineItemTotal - line.lineItemNet
            }
          }
        } else if (line.lineItemTotal && line.lineItemNet && line.lineItemTotal > line.lineItemNet) {
          lineDiscount = line.lineItemTotal - line.lineItemNet
        }

        if (lineDiscount > 0) {
          perLineDiscountTotal += lineDiscount
          result.push({
            item: { id: discountItemId },
            rate: -lineDiscount,
            description: `Discount on ${line.lineItemName || line.lineItemSku || 'item'}`,
          })
        }
      }

      return result
    })

  if (items.length === 0) {
    errors.push('No valid line items found (all items missing SKUs)')
  }

  // Format date (NetSuite expects YYYY-MM-DD)
  const orderDate = new Date(firstLine.orderCreatedAt)
  const formattedDate = orderDate.toISOString().split('T')[0]

  // Fetch OrderFieldMapping for additional NetSuite fields
  const orderFieldMappings = await prisma.orderFieldMapping.findMany({
    where: {
      isActive: true,
    },
    include: {
      translationMappings: {
        where: {
          isActive: true,
        },
      },
    },
  })

  // Fetch Shopify order data if needed for Order Header mappings
  let shopifyOrderData: any = null
  const needsShopifyOrderData = orderFieldMappings.some(
    (m) => m.mappingType === 'Order Header' || m.mappingType === 'Order Header with Translation'
  )

  if (needsShopifyOrderData) {
    try {
      const { getOrderByNameFromShopify } = await import('../shopify')
      shopifyOrderData = await getOrderByNameFromShopify(firstLine.shopifyOrderName)
      if (!shopifyOrderData) {
        console.warn(`⚠️ Could not fetch Shopify order data for ${firstLine.shopifyOrderName}`)
        errors.push(`Could not fetch Shopify order data for Order Header mappings`)
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching Shopify order data:`, error)
      errors.push(`Error fetching Shopify order data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Helper function to get nested value from object using dot notation (e.g., "payment_gateway_names")
  const getNestedValue = (obj: any, path: string): any => {
    const keys = path.split('.')
    let current = obj
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return null
      }
      current = current[key]
    }
    return current
  }

  // Helper function to get mapping value based on mapping type
  const getMappingValue = (mapping: typeof orderFieldMappings[0]): string | null => {
    switch (mapping.mappingType) {
      case 'Fixed':
        // For Fixed mappings, use shopifyValue (the fixed NetSuite ID/value)
        return mapping.shopifyValue || mapping.netsuiteId

      case 'Custom':
        // For Custom mappings, use shopifyValue (the value selected/entered when creating the mapping)
        return mapping.shopifyValue || null

      case 'Order Header':
      case 'Order Header with Translation':
        // For Order Header mappings, extract value from Shopify order data
        if (!shopifyOrderData || !mapping.shopifyCode) {
          return null
        }
        const shopifyValue = getNestedValue(shopifyOrderData, mapping.shopifyCode)

        // Convert to string if needed
        let value = shopifyValue
        if (Array.isArray(value)) {
          // Handle arrays (e.g., payment_gateway_names)
          value = value.join(', ')
        } else if (value != null) {
          value = String(value)
        } else {
          return null
        }

        // For Order Header with Translation, apply translation logic
        if (mapping.mappingType === 'Order Header with Translation') {
          // Look up translation mapping
          const translation = mapping.translationMappings?.find(
            (tm) => tm.shopifyValue === value
          )

          if (translation) {
            // Use translated value
            return translation.netsuiteValue
          } else if (mapping.translationDefaultValue) {
            // Use default value if no translation found
            return mapping.translationDefaultValue
          } else {
            // No translation and no default - return null (field won't be set)
            return null
          }
        }

        return value

      default:
        return null
    }
  }

  // Build the payload
  const payload: NetSuiteSalesOrderPayload = {
    entity: {
      id: netsuiteCustomerId || '',
    },
    tranDate: formattedDate,
    tranId: firstLine.shopifyOrderName.replace('#', ''), // Remove # from order name
    otherRefNum: firstLine.shopifyOrderName, // Shopify order name (e.g., "#42256")
    externalId: firstLine.shopifyOrderId, // Shopify order ID
    memo: `Shopify Order: ${firstLine.shopifyOrderName}`,
    item: {
      items,
    },
    subtotal: firstLine.orderSubtotal || undefined,
    taxTotal: firstLine.orderTax || undefined,
    shippingCost: firstLine.orderShipping || undefined,
    total: firstLine.orderTotal || undefined,
  }

  // Apply all active order field mappings dynamically
  for (const mapping of orderFieldMappings) {
    const value = getMappingValue(mapping)
    if (!value) {
      continue // Skip mappings without values
    }

    // Determine the NetSuite field name (use customFieldId if available, otherwise netsuiteId)
    const netsuiteFieldName = mapping.customFieldId || mapping.netsuiteId

    // Handle standard NetSuite fields that need special structure
    // Record-reference fields need { id: value } structure
    const recordReferenceFields = [
      'subsidiary', 'class', 'location', 'terms',
      'partner', 'salesRep', 'department', 'leadSource', 'priceLevel',
      'territory', 'taxItem', 'account', 'customForm', 'discountItem',
    ]

    if (netsuiteFieldName === 'orderStatus') {
      // Order status uses letter codes directly (A=Pending Approval, B=Pending Fulfillment, etc.)
      payload.orderStatus = value
    } else if (netsuiteFieldName === 'currency') {
      // Currency accepts ISO code via refName, or numeric internal ID via id
      const extracted = extractNetSuiteId(value)
      if (/^\d+$/.test(extracted)) {
        payload.currency = { id: extracted }
      } else {
        payload.currency = { refName: extracted.toUpperCase() }
      }
    } else if (recordReferenceFields.includes(netsuiteFieldName)) {
      ;(payload as any)[netsuiteFieldName] = { id: extractNetSuiteId(value) }
    } else if (netsuiteFieldName === 'shipDate') {
      payload.shipDate = value
    } else if (netsuiteFieldName === 'memo') {
      payload.memo = value
    } else if (netsuiteFieldName === 'tranDate') {
      payload.tranDate = value
    } else if (netsuiteFieldName === 'tranId') {
      payload.tranId = value
    } else if (netsuiteFieldName === 'otherRefNum') {
      payload.otherRefNum = value
    } else if (netsuiteFieldName === 'externalId') {
      payload.externalId = value
    } else if (netsuiteFieldName === 'subtotal') {
      payload.subtotal = parseFloat(value) || undefined
    } else if (netsuiteFieldName === 'taxTotal') {
      payload.taxTotal = parseFloat(value) || undefined
    } else if (netsuiteFieldName === 'shippingCost') {
      payload.shippingCost = parseFloat(value) || undefined
    } else if (netsuiteFieldName === 'total') {
      payload.total = parseFloat(value) || undefined
    } else if (netsuiteFieldName.startsWith('custbody_') || netsuiteFieldName.startsWith('custcol_')) {
      // Custom fields — use { id: value } for select fields
      ;(payload as any)[netsuiteFieldName] = { id: extractNetSuiteId(value) }
    } else {
      // Other fields — assign directly
      ;(payload as any)[netsuiteFieldName] = value
    }
  }

  // Add inline billing address (transaction-level, doesn't modify customer's address book)
  if (billingAddress) {
    payload.billingAddress = {
      addr1: billingAddress.address1,
      addr2: billingAddress.address2,
      city: billingAddress.city,
      state: billingAddress.province,
      zip: billingAddress.zip,
      country: billingAddress.countryCode || billingAddress.country, // NetSuite REST API accepts ISO 2-letter codes
      addressee: `${billingAddress.firstName || ''} ${billingAddress.lastName || ''}`.trim() || undefined,
      addrPhone: billingAddress.phone,
    }
  } else {
    console.warn(`⚠️ No billing address found for this order`)
    errors.push(`No billing address found - NetSuite will use customer default`)
  }

  // Add inline shipping address (transaction-level, doesn't modify customer's address book)
  if (shippingAddress) {
    payload.shippingAddress = {
      addr1: shippingAddress.address1,
      addr2: shippingAddress.address2,
      city: shippingAddress.city,
      state: shippingAddress.province,
      zip: shippingAddress.zip,
      country: shippingAddress.countryCode || shippingAddress.country, // NetSuite REST API accepts ISO 2-letter codes
      addressee: `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim() || undefined,
      addrPhone: shippingAddress.phone,
    }
  } else {
    console.warn(`⚠️ No shipping address found for this order`)
    errors.push(`No shipping address found - NetSuite will use customer default`)
  }

  // Add currency if available (use refName for ISO code like "USD", not id which needs a numeric internal ID)
  if (firstLine.currency && !payload.currency) {
    payload.currency = {
      refName: firstLine.currency.toUpperCase(),
    }
  }

  // Add payment method if available
  if (firstLine.paymentGatewayNames) {
    try {
      // Parse payment gateway names (stored as JSON string)
      const paymentGateways = JSON.parse(firstLine.paymentGatewayNames) as string[]
      const paymentMethod = paymentGateways?.[0] || 'unknown'

      // Find mapping for this payment method
      const paymentMapping = paymentMethodMappings.find(
        (m) => m.shopifyCode === paymentMethod && m.isActive
      )

      if (paymentMapping) {
        // Use mapped payment method
        payload.paymentMethod = {
          id: paymentMapping.netsuiteId,
        }
      } else if (defaultPaymentMethod) {
        // Use default payment method if no mapping found
        payload.paymentMethod = {
          id: defaultPaymentMethod,
        }
        errors.push(`Payment method "${paymentMethod}" not mapped, using default payment method`)
      } else {
        // No mapping and no default - blocking error
        errors.push(`BLOCKING: Payment method "${paymentMethod}" is not mapped and no default is set. Add a Payment Method mapping for "${paymentMethod}".`)
      }
    } catch (error) {
      console.warn('Could not parse payment gateway names:', error)
      errors.push(`Could not parse payment gateway names: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } else {
    // No payment method in order - use default if available
    if (defaultPaymentMethod) {
      payload.paymentMethod = {
        id: defaultPaymentMethod,
      }
      errors.push('No payment method found in order, using default payment method')
    } else {
      errors.push('BLOCKING: No payment method found in order and no default is set. Configure a default payment method in settings.')
    }
  }

  // Add shipping method if available
  if (firstLine.shippingLines) {
    try {
      const shippingLines = JSON.parse(firstLine.shippingLines) as Array<{ code?: string; title?: string; price?: string }>
      const shippingLine = shippingLines?.[0]
      const shippingCode = shippingLine?.code || shippingLine?.title

      if (shippingCode) {
        const shipmentMapping = shipmentMethodMappings.find(
          (m) => m.shopifyCode === shippingCode
        )

        if (shipmentMapping) {
          payload.shipMethod = { id: shipmentMapping.netsuiteId }
        } else {
          errors.push(`BLOCKING: Shipping method "${shippingCode}" is not mapped. This order cannot be pushed. Add a Shipment Method mapping for "${shippingCode}".`)
        }
      }
    } catch (error) {
      console.warn('Could not parse shipping lines:', error)
      errors.push(`Could not parse shipping lines: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle remaining order-level discount not covered by per-line discounts
  if (firstLine.orderDiscount && firstLine.orderDiscount > 0) {
    const orderDiscount = firstLine.orderDiscount
    const remainingDiscount = Math.round((orderDiscount - perLineDiscountTotal) * 100) / 100

    if (discountItemId) {
      // If per-line discounts didn't cover the full order discount, add a remainder line
      if (remainingDiscount > 0.01) {
        items.push({
          item: { id: discountItemId },
          rate: -remainingDiscount,
          description: 'Shopify Order Discount (remainder)',
        })
      }
    } else {
      // No discount item configured — warn but don't block
      errors.push(`Order has a discount of $${orderDiscount.toFixed(2)} but no Discount Item is configured. Set a Default Discount Item in Order Mappings > Order tab.`)
    }
  }

  // Check for blocking errors (missing mappings) — prevent push
  const blockingErrors = errors.filter((e) => e.startsWith('BLOCKING:'))
  if (blockingErrors.length > 0) {
    // Still return the payload for preview, but the POST handler should check for blocking errors
  }

  return { payload, errors, customerWasCreated }
}

/**
 * Creates a sales order in NetSuite using the REST API
 */
export async function createNetSuiteSalesOrder(
  payload: NetSuiteSalesOrderPayload
): Promise<{
  success: boolean
  salesOrderId?: string
  salesOrderName?: string
  error?: string
  responseDebug?: { status: number; location: string | null; body: string }
}> {
  const NETSUITE_API_URL = buildRecordUrl('salesOrder')

  const authorization = generateOAuthHeader('POST', NETSUITE_API_URL)

  try {
    const response = await fetch(NETSUITE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    // Read response data
    const location = response.headers.get('Location') || response.headers.get('location')
    const responseText = await response.text()
    const allHeaders = Object.fromEntries(response.headers.entries())

    console.log(`📋 NetSuite response status: ${response.status}`)
    console.log(`📋 All headers:`, JSON.stringify(allHeaders))
    console.log(`📋 Location header: ${location}`)
    console.log(`📋 Response body: ${responseText?.substring(0, 500)}`)

    if (!response.ok) {
      console.error('❌ NetSuite API Error:', {
        status: response.status,
        body: responseText,
      })
      return {
        success: false,
        error: `NetSuite API error ${response.status}: ${responseText}`,
        responseDebug: { status: response.status, location, body: responseText?.substring(0, 500) || '' },
      }
    }

    let salesOrderId: string | undefined
    let salesOrderName: string | undefined

    // Extract ID from Location header: .../salesOrder/{id} or .../salesorder/{id}
    if (location) {
      const match = location.match(/\/salesorder\/(\d+)/i)
      if (match) {
        salesOrderId = match[1]
      }
    }

    // Try to parse response body for additional info
    if (responseText) {
      try {
        const responseData = JSON.parse(responseText)
        if (responseData.id) {
          salesOrderId = String(responseData.id)
        }
        if (responseData.tranId || responseData.tranid) {
          salesOrderName = responseData.tranId || responseData.tranid
        }
      } catch {
        // Response might not be JSON (204 No Content), that's okay
      }
    }

    // If we got the ID but not the name (204 response), look it up via SuiteQL
    if (salesOrderId && !salesOrderName) {
      try {
        const { executeSuiteQL } = await import('./suiteql')
        const result = await executeSuiteQL<{ tranid: string }>(
          `SELECT tranid FROM transaction WHERE id = ${salesOrderId}`
        )
        if (result.items?.length > 0) {
          salesOrderName = result.items[0].tranid
        }
      } catch {
        // Non-critical — we have the ID at least
      }
    }

    return {
      success: true,
      salesOrderId,
      salesOrderName,
      responseDebug: { status: response.status, location, body: responseText?.substring(0, 500) || '' },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating sales order',
    }
  }
}
