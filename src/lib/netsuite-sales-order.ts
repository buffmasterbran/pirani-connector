import { prisma } from './prisma'
import { findNetSuiteAddressesByCustomerId, matchShopifyAddressToNetSuite } from './netsuite'

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
  orderStatus?: {
    id: string // Order Status ID (e.g., "B" for Pending Billing)
  }
  billAddressList?: {
    id: string // NetSuite Billing Address Internal ID (NetSuite accepts both "billAddressList" and "billaddresslist")
  }
  shipAddressList?: {
    id: string // NetSuite Shipping Address Internal ID (NetSuite accepts both "shipAddressList" and "shipaddresslist")
  }
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
    id?: string // Currency code (e.g., "USD")
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
): Promise<{ payload: NetSuiteSalesOrderPayload; errors: string[] }> {
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

  // Fetch customer data
  // Note: OrderLine.customerId is the Shopify customer ID string
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

  if (!customer) {
    errors.push(`Customer not found for Shopify customer ID: ${firstLine.customerId || 'unknown'}`)
  }

  if (!customer?.netsuiteCustomerId) {
    errors.push(`Customer ${customer?.email || firstLine.customerId} does not have a NetSuite customer ID`)
  }

  // Find billing and shipping addresses
  let billingAddress = customer?.addresses.find((addr) => addr.isDefaultBilling)
  let shippingAddress = customer?.addresses.find((addr) => addr.isDefaultShipping)

  // If customer has NetSuite ID but addresses are missing NetSuite IDs, try to look them up
  if (customer?.netsuiteCustomerId) {
    // Check if we need to look up addresses
    const needsBillingLookup = billingAddress && !billingAddress.netsuiteAddressId
    const needsShippingLookup = shippingAddress && !shippingAddress.netsuiteAddressId

    if (needsBillingLookup || needsShippingLookup) {
      try {
        console.log(`🔍 Looking up NetSuite addresses for customer ${customer.netsuiteCustomerId}...`)
        const netsuiteAddresses = await findNetSuiteAddressesByCustomerId(customer.netsuiteCustomerId)
        console.log(`✅ Found ${netsuiteAddresses.length} NetSuite address(es) for customer ${customer.netsuiteCustomerId}`)

        // Try to match billing address
        if (needsBillingLookup && billingAddress) {
          const matchedId = matchShopifyAddressToNetSuite(
            {
              address1: billingAddress.address1,
              city: billingAddress.city,
              zip: billingAddress.zip,
              province: billingAddress.province,
              country: billingAddress.country,
            },
            netsuiteAddresses
          )
          if (matchedId) {
            console.log(`✅ Matched billing address to NetSuite address ID: ${matchedId}`)
            // Update the address in database
            await prisma.customerAddress.update({
              where: { id: billingAddress.id },
              data: { netsuiteAddressId: matchedId },
            })
            // Update local reference
            billingAddress.netsuiteAddressId = matchedId
          } else {
            console.log(`⚠️ Could not match billing address to NetSuite address`)
          }
        }

        // Try to match shipping address
        if (needsShippingLookup && shippingAddress) {
          const matchedId = matchShopifyAddressToNetSuite(
            {
              address1: shippingAddress.address1,
              city: shippingAddress.city,
              zip: shippingAddress.zip,
              province: shippingAddress.province,
              country: shippingAddress.country,
            },
            netsuiteAddresses
          )
          if (matchedId) {
            console.log(`✅ Matched shipping address to NetSuite address ID: ${matchedId}`)
            // Update the address in database
            await prisma.customerAddress.update({
              where: { id: shippingAddress.id },
              data: { netsuiteAddressId: matchedId },
            })
            // Update local reference
            shippingAddress.netsuiteAddressId = matchedId
          } else {
            console.log(`⚠️ Could not match shipping address to NetSuite address`)
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not look up NetSuite addresses:`, error)
        errors.push(`Could not look up NetSuite addresses: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  // Build items array using refName (SKU or item name)
  const items = orderLines
    .filter((line) => {
      // Filter out lines without SKU or name
      if (!line.lineItemSku && !line.lineItemName) {
        errors.push(`Line item "${line.lineItemId}" has no SKU or name - skipping`)
        return false
      }
      return true
    })
    .map((line) => {
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
      
      return {
        item: itemObj,
        quantity: line.lineItemQuantity || 1,
        rate: line.lineItemPrice || undefined, // Make rate optional as in user's example
        description: line.lineItemName || undefined,
      }
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
  })

  // Fetch Shopify order data if needed for Order Header mappings
  let shopifyOrderData: any = null
  const needsShopifyOrderData = orderFieldMappings.some(
    (m) => m.mappingType === 'Order Header' || m.mappingType === 'Order Header with Translation'
  )
  
  if (needsShopifyOrderData) {
    try {
      const { getOrderByNameFromShopify } = await import('./shopify')
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

        // For Order Header with Translation, apply translation logic (placeholder for future implementation)
        // For now, just return the value as-is
        if (mapping.mappingType === 'Order Header with Translation') {
          // TODO: Implement translation logic here
          // For now, use the value directly
        }

        return value

      default:
        return null
    }
  }

  // Build the payload
  const payload: NetSuiteSalesOrderPayload = {
    entity: {
      id: customer?.netsuiteCustomerId || '',
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
    if (netsuiteFieldName === 'subsidiary') {
      payload.subsidiary = { id: value }
    } else if (netsuiteFieldName === 'class') {
      payload.class = { id: value }
    } else if (netsuiteFieldName === 'location') {
      payload.location = { id: value }
    } else if (netsuiteFieldName === 'orderStatus') {
      payload.orderStatus = { id: value }
    } else if (netsuiteFieldName === 'currency') {
      payload.currency = { id: value.toUpperCase() }
    } else if (netsuiteFieldName === 'terms') {
      payload.terms = { id: value }
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
    } else {
      // Custom fields or other fields - check if it's a custom field (starts with custbody_ or custcol_)
      if (netsuiteFieldName.startsWith('custbody_') || netsuiteFieldName.startsWith('custcol_')) {
        // Custom fields typically need { id: value } structure for select fields
        // For text/date fields, they might need direct value assignment
        // We'll use { id: value } structure as default, which works for most custom field types
        ;(payload as any)[netsuiteFieldName] = { id: value }
      } else {
        // For other fields, try to assign directly
        ;(payload as any)[netsuiteFieldName] = value
      }
    }
  }

  // Add billing address if available
  // Note: NetSuite will use customer's default billing address if not specified
  if (billingAddress?.netsuiteAddressId) {
    payload.billAddressList = {
      id: billingAddress.netsuiteAddressId,
    }
  } else if (billingAddress) {
    // Address exists but no NetSuite ID - NetSuite will use customer default
    console.warn(`⚠️ Billing address found but missing NetSuite address ID. NetSuite will use customer's default billing address.`)
    errors.push(`Billing address found but missing NetSuite address ID - will use customer default`)
  }

  // Add shipping address if available
  // Note: NetSuite will use customer's default shipping address if not specified
  if (shippingAddress?.netsuiteAddressId) {
    payload.shipAddressList = {
      id: shippingAddress.netsuiteAddressId,
    }
  } else if (shippingAddress) {
    // Address exists but no NetSuite ID - NetSuite will use customer default
    console.warn(`⚠️ Shipping address found but missing NetSuite address ID. NetSuite will use customer's default shipping address.`)
    errors.push(`Shipping address found but missing NetSuite address ID - will use customer default`)
  }

  // Add currency if available
  if (firstLine.currency) {
    payload.currency = {
      id: firstLine.currency.toUpperCase(), // NetSuite expects uppercase (e.g., "USD")
    }
  }

  return { payload, errors }
}

/**
 * Creates a sales order in NetSuite using the REST API
 */
export async function createNetSuiteSalesOrder(
  payload: NetSuiteSalesOrderPayload
): Promise<{ success: boolean; salesOrderId?: string; salesOrderName?: string; error?: string }> {
  const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
  const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/salesOrder`

  // Import generateOAuthHeader from netsuite.ts
  const { generateOAuthHeader } = await import('./netsuite')

  const authorization = generateOAuthHeader('POST', NETSUITE_API_URL)

  try {
    const response = await fetch(NETSUITE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
        Prefer: 'respond-async', // Use async for better performance
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ NetSuite API Error:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText,
        payload: JSON.stringify(payload, null, 2),
      })
      return {
        success: false,
        error: `NetSuite API error ${response.status}: ${errorText}`,
      }
    }

    // Get the sales order ID from Location header or response body
    const location = response.headers.get('Location')
    const responseText = await response.text()

    let salesOrderId: string | undefined
    let salesOrderName: string | undefined

    if (location) {
      // Extract ID from Location header: /record/v1/salesOrder/{id}
      const match = location.match(/\/salesOrder\/(\d+)/)
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
        if (responseData.tranid) {
          salesOrderName = responseData.tranid
        }
      } catch {
        // Response might not be JSON, that's okay
      }
    }

    return {
      success: true,
      salesOrderId,
      salesOrderName,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating sales order',
    }
  }
}

