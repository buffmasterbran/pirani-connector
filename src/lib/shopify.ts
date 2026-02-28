import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { decrypt } from './encryption'
import { findNetSuiteCustomerByEmail, findNetSuiteAddressesByCustomerId, matchShopifyAddressToNetSuite } from './netsuite'

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'

/** Resolve Shopify credentials: first from a connected store (OAuth) in DB, then from env. */
export async function getShopifyCredentials(): Promise<{ baseUrl: string; accessToken: string } | null> {
  try {
    const store = await prisma.productSyncStoreConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { shopifyDomain: true, shopifyAccessTokenEncrypted: true, shopifyApiVersion: true },
    })
    if (store?.shopifyAccessTokenEncrypted) {
      const domain = store.shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const baseUrl = `https://${domain}/admin/api/${store.shopifyApiVersion || SHOPIFY_API_VERSION}`
      const accessToken = decrypt(store.shopifyAccessTokenEncrypted)
      return { baseUrl, accessToken }
    }
  } catch (e) {
    console.warn('getShopifyCredentials: could not load from DB', e)
  }
  const url = process.env.SHOPIFY_STORE_URL
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (url && token) {
    const baseUrl = `${url.replace(/\/$/, '')}/admin/api/${SHOPIFY_API_VERSION}`
    return { baseUrl, accessToken: token }
  }
  return null
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Shopify-Access-Token': accessToken,
  }
}

async function shopifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const creds = await getShopifyCredentials()
  if (!creds) throw new Error('Shopify credentials missing. Connect a store (OAuth) or set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.')
  const url = path.startsWith('http') ? path : `${creds.baseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(creds.accessToken), ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${message}`)
  }
  return res.json() as Promise<T>
}

async function shopifyFetchWithHeaders<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const creds = await getShopifyCredentials()
  if (!creds) throw new Error('Shopify credentials missing. Connect a store (OAuth) or set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.')
  const url = path.startsWith('http') ? path : `${creds.baseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(creds.accessToken), ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${message}`)
  }
  const data = (await res.json()) as T
  return { data, headers: res.headers }
}

function parseFloatOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: any): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function stringify(value: any): string | null {
  if (value === null || value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.warn('Failed to stringify value for storage', error)
    return null
  }
}

export type FlattenedOrderLine = Omit<Prisma.OrderLineUncheckedCreateInput, 'id'>

export function flattenShopifyOrder(order: any): FlattenedOrderLine[] {
  const shopifyOrderId = String(order.id)
  const base: Omit<FlattenedOrderLine, 'lineItemId' | 'lineItemName' | 'lineItemQuantity' | 'lineItemPrice' | 'lineItemTotal' | 'lineItemNet'> = {
    shopifyOrderId,
    shopifyOrderName: order.name ?? shopifyOrderId,
    shopifyOrderNumber: order.order_number ?? null,
    financialStatus: order.financial_status ?? 'unknown',
    fulfillmentStatus: order.fulfillment_status ?? null,
    currency: order.currency ?? 'USD',
    orderCreatedAt: parseDate(order.created_at) ?? new Date(),
    orderUpdatedAt: parseDate(order.updated_at),
    orderSubtotal: parseFloatOrNull(order.subtotal_price),
    orderTax: parseFloatOrNull(order.total_tax),
    orderShipping: parseFloatOrNull(
      order.total_shipping_price_set?.shop_money?.amount ??
        order.total_shipping_price_set?.presentment_money?.amount ??
        order.total_shipping_price_set?.amount,
    ),
    orderDiscount: parseFloatOrNull(order.total_discounts),
    orderTotal: parseFloatOrNull(order.total_price),
    netsuiteSalesOrderId: null,
    netsuiteSalesOrderName: null,
    netsuiteCashSaleId: null,
    netsuiteCashSaleName: null,
    netsuiteRefundId: null,
    netsuiteRefundName: null,
    netsuiteDepositId: null,
    shopifyPayoutId: null,
    shopifyPayoutStatus: null,
    expectedPayoutAmount: null,
    actualDepositAmount: null,
    varianceAmount: null,
    depositCreatedAt: null,
    syncedShopifyAt: new Date(),
    syncedNetsuiteAt: null,
    status: order.financial_status ?? 'unknown',
    reconciliationStatus: null,
    paymentGatewayNames: stringify(order.payment_gateway_names ?? []),
    shippingLines: stringify(order.shipping_lines ?? []),
    customerId: order.customer?.id ? String(order.customer.id) : null,
    customerEmail: order.customer?.email ?? null,
    customerFirstName: order.customer?.first_name ?? null,
    customerLastName: order.customer?.last_name ?? null,
    shippingAddress: stringify(order.shipping_address ?? null),
    sourceName: order.source_name ?? null,
    appId: order.app_id ? Number(order.app_id) : null,
    lineItemSku: null,
    lineItemMetadata: null,
    isDeleted: false,
  }

  const lineItems = Array.isArray(order.line_items) ? order.line_items : []

  if (lineItems.length === 0) {
    return [
      {
        ...base,
        lineItemId: `${shopifyOrderId}-line-0`,
        lineItemName: 'Unknown Item',
        lineItemQuantity: 0,
        lineItemPrice: 0,
        lineItemTotal: base.orderTotal ?? 0,
        lineItemNet: base.orderTotal ?? 0,
        lineItemMetadata: stringify({}),
      },
    ]
  }

  return lineItems.map((item: any, index: number) => {
    const quantity = Number(item.quantity ?? 0)
    const unitPrice =
      parseFloatOrNull(item.price) ?? parseFloatOrNull(item.price_set?.shop_money?.amount) ?? 0
    const total = parseFloatOrNull(item.total ?? item.line_price) ?? unitPrice * quantity
    const net = total - (parseFloatOrNull(item.total_discount) ?? 0)

    return {
      ...base,
      lineItemId: String(item.id ?? `${shopifyOrderId}-${index}`),
      lineItemSku: item.sku ?? null,
      lineItemName: item.name ?? item.title ?? 'Item',
      lineItemQuantity: quantity,
      lineItemPrice: unitPrice,
      lineItemTotal: total,
      lineItemNet: net,
      lineItemMetadata: stringify(item ?? {}),
    }
  })
}

export async function fetchShopifyOrders(limit = 50, status: 'any' | 'open' | 'closed' = 'any') {
  const creds = await getShopifyCredentials()
  if (!creds) return { orders: [] }
  const query = new URLSearchParams({ status, limit: String(limit) })
  const data = await shopifyFetch<{ orders: any[] }>(`/orders.json?${query.toString()}`)
  return { orders: data.orders ?? [] }
}

export async function fetchShopifyOrdersPaginated(maxOrders = 250, status: 'any' | 'open' | 'closed' = 'any') {
  const creds = await getShopifyCredentials()
  if (!creds) return { orders: [] }

  const target = Math.min(maxOrders, 4000)
  const allOrders: any[] = []
  let nextUrl: string | null = null

  while (allOrders.length < target) {
    const remaining = target - allOrders.length
    const limit = Math.min(remaining, 250)

    const requestUrl: string = nextUrl
      ? nextUrl
      : `${creds.baseUrl}/orders.json?${new URLSearchParams({
          status,
          limit: String(limit),
        }).toString()}`

    const response: Response = await fetch(requestUrl, {
      headers: buildHeaders(creds.accessToken),
      cache: 'no-store',
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${message}`)
    }

    const data = (await response.json()) as { orders?: any[] }
    const batch = data.orders ?? []

    if (!batch.length) {
      break
    }

    allOrders.push(...batch)

    if (allOrders.length >= target) {
      break
    }

    const linkHeader: string | null = response.headers.get('Link')
    if (!linkHeader) {
      break
    }

    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    if (!nextMatch) {
      break
    }

    nextUrl = nextMatch[1]
    if (!nextUrl) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  return { orders: allOrders.slice(0, target) }
}

export async function fetchShopifyPayouts(limit = 50) {
  const creds = await getShopifyCredentials()
  if (!creds) return { payouts: [] }
  const query = new URLSearchParams({ limit: String(limit) })
  const data = await shopifyFetch<{ payouts: any[] }>(`/shopify_payments/payouts.json?${query.toString()}`)
  return { payouts: data.payouts ?? [] }
}

export async function fetchShopifyPayoutTransactions(payoutId: string) {
  const creds = await getShopifyCredentials()
  if (!creds) return { transactions: [] }

  // Fetch all transactions with pagination using Shopify's Link header
  // Handles large payouts (5000+ transactions) by paginating through all pages
  const allTransactions: any[] = []
  let nextUrl: string | null = null
  let hasNextPage = true
  let pageCount = 0
  const maxPages = 100 // Safety limit: 100 pages * 250 = 25,000 transactions max

  while (hasNextPage && pageCount < maxPages) {
    pageCount++
    const url: string = nextUrl || `/shopify_payments/balance/transactions.json?payout_id=${payoutId}&limit=250`
    
    try {
      const { data, headers }: { data: { transactions: any[] }; headers: Headers } = await shopifyFetchWithHeaders<{ transactions: any[] }>(url)
      const transactions = data.transactions ?? []
      allTransactions.push(...transactions)

      // Log progress for large imports
      if (pageCount % 5 === 0 || transactions.length < 250) {
        console.log(`📦 Fetched page ${pageCount}: ${allTransactions.length} transactions so far...`)
      }

      // Parse Link header to get next page URL
      const linkHeader: string | null = headers.get('link')
      if (linkHeader) {
        // Parse Link header: <url>; rel="next" (can be full URL or relative)
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          let extractedUrl: string = nextMatch[1]
          // Handle both full URLs and relative paths
          if (extractedUrl.startsWith('http')) {
            // Full URL - extract just the path part
            try {
              const urlObj = new URL(extractedUrl)
              extractedUrl = urlObj.pathname + urlObj.search
              // Remove the base API path if present
              extractedUrl = extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
            } catch (e) {
              // If URL parsing fails, try to extract path manually
              const pathMatch = extractedUrl.match(/\/admin\/api\/[^/]+(\/.*)/)
              extractedUrl = pathMatch ? pathMatch[1] : extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
            }
          }
          nextUrl = extractedUrl
          hasNextPage = true
        } else {
          hasNextPage = false
        }
      } else {
        // If no Link header, we're done (got less than limit)
        hasNextPage = false
      }
    } catch (error) {
      console.error(`❌ Error fetching transactions page ${pageCount}:`, error)
      // If we have some transactions, return what we have rather than failing completely
      if (allTransactions.length > 0) {
        console.warn(`⚠️ Returning ${allTransactions.length} transactions despite error on page ${pageCount}`)
        break
      }
      throw error
    }
  }

  if (pageCount >= maxPages) {
    console.warn(`⚠️ Reached maximum page limit (${maxPages}). There may be more transactions.`)
  }

  console.log(`✅ Fetched ${allTransactions.length} transactions for payout ${payoutId} (${pageCount} pages)`)
  return { transactions: allTransactions }
}

export async function fetchShopifyPayoutTransactionsPage(
  payoutId: string,
  cursor?: string,
): Promise<{ transactions: any[]; nextCursor: string | null }> {
  const creds = await getShopifyCredentials()
  if (!creds) return { transactions: [], nextCursor: null }

  const url = cursor || `/shopify_payments/balance/transactions.json?payout_id=${payoutId}&limit=250`

  const { data, headers } = await shopifyFetchWithHeaders<{ transactions: any[] }>(url)
  const transactions = data.transactions ?? []

  let nextCursor: string | null = null
  const linkHeader = headers.get('link')
  if (linkHeader) {
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    if (nextMatch) {
      let extractedUrl = nextMatch[1]
      if (extractedUrl.startsWith('http')) {
        try {
          const urlObj = new URL(extractedUrl)
          extractedUrl = urlObj.pathname + urlObj.search
          extractedUrl = extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
        } catch {
          const pathMatch = extractedUrl.match(/\/admin\/api\/[^/]+(\/.*)/)
          extractedUrl = pathMatch ? pathMatch[1] : extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
        }
      }
      nextCursor = extractedUrl
    }
  }

  return { transactions, nextCursor }
}

/**
 * Fetches all saved addresses for a customer from Shopify
 */
export async function fetchCustomerAddresses(customerId: string): Promise<any[]> {
  const creds = await getShopifyCredentials()
  if (!creds) {
    console.warn('Shopify credentials not configured, skipping address fetch')
    return []
  }
  try {
    const response = await fetch(`${creds.baseUrl}/customers/${customerId}/addresses.json`, {
      headers: buildHeaders(creds.accessToken),
      cache: 'no-store',
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Customer ${customerId} not found or has no addresses`)
        return []
      }
      const errorText = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return data.addresses || []
  } catch (error) {
    console.error(`Error fetching addresses for customer ${customerId}:`, error)
    throw error
  }
}

/**
 * Saves customer and address data from a Shopify order to the database
 */
export async function saveCustomerAndAddresses(order: any): Promise<void> {
  const customer = order.customer
  if (!customer || !customer.id) {
    console.log(`⚠️ Order ${order.id} has no customer data, skipping customer save`)
    return // No customer data to save
  }
  
  console.log(`💾 Processing customer ${customer.id} (email: ${customer.email || 'none'}) for order ${order.id}`)

  const shopifyCustomerId = String(customer.id)
  
  // Step 1: Check if customer already exists in DB and has NetSuite ID
  const existingCustomer = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
    select: { netsuiteCustomerId: true },
  })

  let netsuiteCustomerId: string | null = existingCustomer?.netsuiteCustomerId ?? null

  // Step 1: Handle Customer Lookup - Only lookup if customer doesn't have NetSuite ID yet
  if (!netsuiteCustomerId && customer.email) {
    console.log(`🔍 Customer ${shopifyCustomerId} has no NetSuite ID. Looking up by email: ${customer.email}`)
    try {
      const netsuiteCustomer = await findNetSuiteCustomerByEmail(customer.email)
      if (netsuiteCustomer) {
        netsuiteCustomerId = netsuiteCustomer.id
        console.log(`✅ Found NetSuite customer ID: ${netsuiteCustomerId} for email: ${customer.email}`)
      } else {
        console.log(`ℹ️ No NetSuite customer found for email: ${customer.email}. Will proceed to Step 2: Customer Creation.`)
      }
    } catch (error) {
      console.warn(`⚠️ Could not look up NetSuite customer for ${customer.email}:`, error)
      // Continue without NetSuite ID - Step 2 will handle customer creation
    }
  } else if (netsuiteCustomerId) {
    console.log(`✓ Customer ${shopifyCustomerId} already has NetSuite ID: ${netsuiteCustomerId}`)
  }

  // Prepare customer data
  const customerData = {
    shopifyCustomerId,
    adminGraphqlApiId: customer.admin_graphql_api_id ?? null,
    createdAt: parseDate(customer.created_at) ?? new Date(),
    updatedAt: parseDate(customer.updated_at),
    firstName: customer.first_name ?? null,
    lastName: customer.last_name ?? null,
    state: customer.state ?? null,
    note: customer.note ?? null,
    verifiedEmail: customer.verified_email ?? false,
    multipassIdentifier: customer.multipass_identifier ?? null,
    taxExempt: customer.tax_exempt ?? false,
    emailMarketingConsent: stringify(customer.email_marketing_consent ?? null),
    smsMarketingConsent: stringify(customer.sms_marketing_consent ?? null),
    tags: customer.tags ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    currency: customer.currency ?? null,
    taxExemptions: stringify(customer.tax_exemptions ?? []),
    netsuiteCustomerId,
  }

  // Upsert customer
  await prisma.customer.upsert({
    where: { shopifyCustomerId },
    create: customerData,
    update: customerData,
  })

  // Step 1: Fetch all saved customer addresses from Shopify
  let savedAddresses: any[] = []
  try {
    console.log(`📥 Fetching saved addresses for customer ${shopifyCustomerId} from Shopify...`)
    savedAddresses = await fetchCustomerAddresses(shopifyCustomerId)
    console.log(`✅ Fetched ${savedAddresses.length} saved addresses for customer ${shopifyCustomerId}`)
  } catch (error) {
    console.warn(`⚠️ Could not fetch customer addresses for ${shopifyCustomerId}:`, error)
    // Continue with order addresses even if fetch fails
  }

  // Prepare addresses to save: saved addresses + billing + shipping + default
  const addressesToSave: Array<{ address: any; type: string }> = []

  // Add all saved addresses from Shopify
  for (const savedAddress of savedAddresses) {
    addressesToSave.push({ address: savedAddress, type: 'saved' })
  }

  // Add billing address from order
  if (order.billing_address) {
    console.log(`   📍 Found billing_address for order ${order.id}:`, {
      address1: order.billing_address.address1,
      city: order.billing_address.city,
      zip: order.billing_address.zip,
      hasAllFields: !!(order.billing_address.address1 && order.billing_address.city)
    })
    addressesToSave.push({ address: order.billing_address, type: 'billing' })
  } else {
    console.log(`   ⚠️ Order ${order.id} has no billing_address`)
    console.log(`   🔍 Order keys:`, Object.keys(order))
  }

  // Add shipping address from order
  if (order.shipping_address) {
    console.log(`   📍 Found shipping_address for order ${order.id}:`, {
      address1: order.shipping_address.address1,
      city: order.shipping_address.city,
      zip: order.shipping_address.zip,
      hasAllFields: !!(order.shipping_address.address1 && order.shipping_address.city)
    })
    addressesToSave.push({ address: order.shipping_address, type: 'shipping' })
  } else {
    console.log(`   ⚠️ Order ${order.id} has no shipping_address`)
  }

  // Add default address (if not already in saved addresses)
  if (customer.default_address) {
    const isAlreadySaved = savedAddresses.some(
      (addr) => addr.id && addr.id === customer.default_address.id
    )
    if (!isAlreadySaved) {
      addressesToSave.push({ address: customer.default_address, type: 'default' })
      console.log(`   📍 Added default address for customer ${shopifyCustomerId}`)
    }
  }

  console.log(`   📦 Total addresses to save: ${addressesToSave.length}`)

  // Get the customer record ID for foreign key
  const customerRecord = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
  })

  if (!customerRecord) {
    console.warn(`⚠️ Customer record not found after creation for ${shopifyCustomerId}`)
    return
  }

  // Step 2: If customer has NetSuite ID, fetch NetSuite addresses for matching
  let netsuiteAddresses: any[] = []
  if (netsuiteCustomerId) {
    try {
      console.log(`\n   🔍 Customer has NetSuite ID ${netsuiteCustomerId}. Fetching NetSuite addresses for matching...`)
      netsuiteAddresses = await findNetSuiteAddressesByCustomerId(netsuiteCustomerId)
      console.log(`   ✅ Found ${netsuiteAddresses.length} NetSuite address(es) for customer ${netsuiteCustomerId}`)
    } catch (error) {
      console.warn(`   ⚠️ Could not fetch NetSuite addresses for customer ${netsuiteCustomerId}:`, error)
      // Continue without NetSuite address matching - addresses will be saved without IDs
    }
  } else {
    console.log(`   ℹ️ Customer has no NetSuite ID. Addresses will be saved without NetSuite address IDs.`)
  }

  // Save each address
  console.log(`\n   💾 Saving ${addressesToSave.length} address(es)...`)
  let savedCount = 0
  let skippedCount = 0
  let errorCount = 0
  let matchedCount = 0
  
  for (const { address, type } of addressesToSave) {
    try {
      if (!address) {
        console.log(`   ⚠️ Skipping null address for type '${type}'`)
        skippedCount++
        continue
      }

      // Map address type to boolean flags
      const isSavedAddress = type === 'saved'
      const isDefaultBilling = type === 'billing' || type === 'default'
      const isDefaultShipping = type === 'shipping' || type === 'default'

      // Try to match this address to a NetSuite address if we have NetSuite addresses
      let netsuiteAddressId: string | null = null
      if (netsuiteAddresses.length > 0) {
        const matchedId = matchShopifyAddressToNetSuite(
          {
            address1: address.address1,
            city: address.city,
            zip: address.zip,
            province: address.province,
            country: address.country,
          },
          netsuiteAddresses
        )
        if (matchedId) {
          netsuiteAddressId = matchedId
          matchedCount++
          console.log(`   ✅ Matched address (type: ${type}) to NetSuite address ID: ${matchedId}`)
        }
      }

    const addressData = {
      customerId: customerRecord.id,
      shopifyAddressId: address.id ? String(address.id) : null,
        isSavedAddress,
        isDefaultBilling,
        isDefaultShipping,
      firstName: address.first_name ?? null,
      lastName: address.last_name ?? null,
      company: address.company ?? null,
      address1: address.address1 ?? null,
      address2: address.address2 ?? null,
      city: address.city ?? null,
      zip: address.zip ?? null,
      province: address.province ?? null,
      country: address.country ?? null,
      provinceCode: address.province_code ?? null,
      countryCode: address.country_code ?? null,
      countryName: address.country_name ?? null,
      phone: address.phone ?? null,
      name: address.name ?? null,
      latitude: parseFloatOrNull(address.latitude),
      longitude: parseFloatOrNull(address.longitude),
      isDefault: address.default ?? type === 'default',
        netsuiteAddressId, // Will be null if no match found, or the matched NetSuite address ID
    }

      // Skip addresses that are completely empty (no address1 and no city)
      if (!addressData.address1 && !addressData.city) {
        console.log(`   ⚠️ Skipping address with type '${type}' - missing address1 and city`)
        skippedCount++
        continue
      }

      // Improved deduplication logic:
      // 1. For saved addresses with shopifyAddressId, match by that first (most reliable)
      // 2. Then check for any existing address with same physical location (address1, city, zip)
      // 3. This prevents duplicate physical addresses while merging address type flags
      
      let existingAddress = null
      
      // First, try to match saved addresses by shopifyAddressId
      if (addressData.shopifyAddressId && type === 'saved') {
        existingAddress = await prisma.customerAddress.findFirst({
      where: {
        customerId: customerRecord.id,
            shopifyAddressId: addressData.shopifyAddressId,
          },
        })
      }
      
      // If no match by shopifyAddressId, check for physical address match
      // Only check if we have the required fields (at least address1 and city)
      if (!existingAddress && addressData.address1 && addressData.city) {
        const whereClause: any = {
          customerId: customerRecord.id,
              address1: addressData.address1,
              city: addressData.city,
        }
        // Add zip to match if available
        if (addressData.zip) {
          whereClause.zip = addressData.zip
        }
        
        existingAddress = await prisma.customerAddress.findFirst({
          where: whereClause,
    })
      }

    if (existingAddress) {
        // Update existing address, merging boolean flags (OR them together)
        const updateData = {
          ...addressData,
          // Merge flags: if existing address has a flag set, keep it; otherwise use new value
          isSavedAddress: existingAddress.isSavedAddress || addressData.isSavedAddress,
          isDefaultBilling: existingAddress.isDefaultBilling || addressData.isDefaultBilling,
          isDefaultShipping: existingAddress.isDefaultShipping || addressData.isDefaultShipping,
        }
        
        // Preserve shopifyAddressId if it already exists and new one is null
        if (existingAddress.shopifyAddressId && !updateData.shopifyAddressId) {
          updateData.shopifyAddressId = existingAddress.shopifyAddressId
        }
        
        // Preserve netsuiteAddressId if it exists
        if (existingAddress.netsuiteAddressId && !updateData.netsuiteAddressId) {
          updateData.netsuiteAddressId = existingAddress.netsuiteAddressId
        }
        
      await prisma.customerAddress.update({
        where: { id: existingAddress.id },
          data: updateData,
      })
        console.log(`   ✅ Updated existing address ID ${existingAddress.id} (type: ${type})`)
        savedCount++
    } else {
        console.log(`   🔨 Creating new address (type: ${type}, address1: ${addressData.address1}, city: ${addressData.city})`)
        const created = await prisma.customerAddress.create({
        data: addressData,
      })
        console.log(`   ✅ Created new address ID ${created.id} (type: ${type}, address: ${addressData.address1 || 'N/A'}, ${addressData.city || 'N/A'})`)
        savedCount++
      }
    } catch (error) {
      errorCount++
      console.error(`   ❌ Error saving address (type: ${type}):`, error)
      if (error instanceof Error) {
        console.error(`   Error message: ${error.message}`)
        console.error(`   Error stack: ${error.stack}`)
      }
      // Continue with next address even if one fails
    }
  }
  
  console.log(`\n   📊 Address save summary: ${savedCount} saved, ${skippedCount} skipped, ${errorCount} errors, ${matchedCount} matched to NetSuite out of ${addressesToSave.length} total`)
  
  if (errorCount > 0) {
    console.error(`\n   ⚠️ WARNING: ${errorCount} address(es) failed to save! Check errors above.`)
  }
  
  if (netsuiteCustomerId && matchedCount < addressesToSave.length - skippedCount) {
    console.log(`   ℹ️ Note: ${addressesToSave.length - skippedCount - matchedCount} address(es) were saved without NetSuite IDs. They may need to be created in NetSuite.`)
  }
}

export async function getOrderByNameFromShopify(orderName: string) {
  const creds = await getShopifyCredentials()
  if (!creds) return null
  try {
    // Remove # if present to get the order number
    const orderNumber = orderName.replace(/^#/, '')
    let foundOrder: any = null
    
    // Try searching by order_number first (more reliable)
    const queryByNumber = new URLSearchParams({ 
      order_number: orderNumber,
      limit: '10' // Get more results to find the exact match
    })
    
    try {
      const dataByNumber = await shopifyFetch<{ orders: any[] }>(`/orders.json?${queryByNumber.toString()}`)
      console.log(`🔍 Search by order_number=${orderNumber} returned ${dataByNumber.orders?.length || 0} orders`)
      if (dataByNumber.orders && dataByNumber.orders.length > 0) {
        // Find the exact match by order_number
        const exactMatch = dataByNumber.orders.find((o: any) => 
          String(o.order_number) === String(orderNumber) || 
          o.name === `#${orderNumber}` ||
          o.name === orderNumber
        )
        if (exactMatch) {
          console.log(`✅ Found exact match: ID=${exactMatch.id}, Name=${exactMatch.name}, Order Number=${exactMatch.order_number}`)
          foundOrder = exactMatch
        } else {
          // Log what we found
          console.log(`⚠️ No exact match found. Found orders:`, dataByNumber.orders.map((o: any) => ({
            id: o.id,
            name: o.name,
            order_number: o.order_number
          })))
        }
      }
    } catch (error) {
      // If order_number doesn't work, try name parameter
      console.log('Search by order_number failed, trying name parameter...', error)
    }
    
    // Fallback: Try searching by name parameter
    if (!foundOrder) {
      const queryByName = new URLSearchParams({ 
        name: `#${orderNumber}`, // Include # in the search
        limit: '10'
      })
      
      const dataByName = await shopifyFetch<{ orders: any[] }>(`/orders.json?${queryByName.toString()}`)
      console.log(`🔍 Search by name=#${orderNumber} returned ${dataByName.orders?.length || 0} orders`)
      
      if (dataByName.orders && dataByName.orders.length > 0) {
        // Find the exact match
        const exactMatch = dataByName.orders.find((o: any) => 
          String(o.order_number) === String(orderNumber) || 
          o.name === `#${orderNumber}` ||
          o.name === orderNumber
        )
        if (exactMatch) {
          console.log(`✅ Found exact match by name: ID=${exactMatch.id}, Name=${exactMatch.name}, Order Number=${exactMatch.order_number}`)
          foundOrder = exactMatch
        } else {
          console.log(`⚠️ No exact match found by name. Found orders:`, dataByName.orders.map((o: any) => ({
            id: o.id,
            name: o.name,
            order_number: o.order_number
          })))
        }
      }
    }
    
    // If we found an order, fetch the full order details by ID to ensure we have all fields including addresses and line item properties
    if (foundOrder && foundOrder.id) {
      console.log(`📥 Found order by search: ID=${foundOrder.id}, Name=${foundOrder.name}, Order Number=${foundOrder.order_number}`)
      console.log(`📥 Fetching full order details for ID ${foundOrder.id} to ensure all fields (including line item properties) are included...`)
      try {
        const fullOrderData = await shopifyFetch<{ order: any }>(`/orders/${foundOrder.id}.json`)
        if (fullOrderData.order) {
          // Log line item properties for debugging
          if (fullOrderData.order.line_items && fullOrderData.order.line_items.length > 0) {
            console.log(`✅ Retrieved full order details for order ${foundOrder.id}`)
            console.log(`   Line items count: ${fullOrderData.order.line_items.length}`)
            fullOrderData.order.line_items.forEach((item: any, idx: number) => {
              console.log(`   Line item ${idx} (${item.name || item.title}):`)
              console.log(`     - Has properties field: ${!!item.properties}`)
              console.log(`     - Properties type: ${typeof item.properties}`)
              console.log(`     - Is array: ${Array.isArray(item.properties)}`)
              console.log(`     - Properties length: ${item.properties?.length || 0}`)
              if (item.properties && Array.isArray(item.properties) && item.properties.length > 0) {
                console.log(`     - Properties:`, JSON.stringify(item.properties, null, 2))
              } else {
                console.log(`     - Properties value:`, item.properties)
              }
              // Log ALL keys to see if properties are under a different name
              console.log(`     - All keys:`, Object.keys(item))
            })
          }
          return fullOrderData.order
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch full order details, using search result:`, error)
        // Return the order from search if full fetch fails
        return foundOrder
      }
    }
    
    return foundOrder || null
  } catch (error) {
    console.error('Error fetching order by name from Shopify:', error)
    throw error
  }
}
