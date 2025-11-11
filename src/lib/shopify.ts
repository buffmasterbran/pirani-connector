import { Prisma } from '@prisma/client'

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07'

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.warn('SHOPIFY credentials are not fully configured. Import routes will use mock responses.')
}

const SHOPIFY_BASE_URL = SHOPIFY_STORE_URL
  ? `${SHOPIFY_STORE_URL.replace(/\/$/, '')}/admin/api/${SHOPIFY_API_VERSION}`
  : ''

const SHOPIFY_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(SHOPIFY_ACCESS_TOKEN ? { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } : {}),
}

async function shopifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SHOPIFY_BASE_URL) {
    throw new Error('Shopify credentials missing')
  }

  const res = await fetch(`${SHOPIFY_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...SHOPIFY_HEADERS,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${message}`)
  }

  return res.json() as Promise<T>
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
    lineItemSku: null,
    lineItemName: null,
    lineItemQuantity: null,
    lineItemPrice: null,
    lineItemTotal: null,
    lineItemNet: null,
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
  if (!SHOPIFY_BASE_URL) {
    return { orders: [] }
  }

  const query = new URLSearchParams({
    status,
    limit: String(limit),
  })

  const data = await shopifyFetch<{ orders: any[] }>(`/orders.json?${query.toString()}`)
  return { orders: data.orders ?? [] }
}

export async function fetchShopifyOrdersPaginated(maxOrders = 250, status: 'any' | 'open' | 'closed' = 'any') {
  if (!SHOPIFY_BASE_URL) {
    return { orders: [] }
  }

  const target = Math.min(maxOrders, 4000)
  const allOrders: any[] = []
  let nextUrl: string | null = null

  while (allOrders.length < target) {
    const remaining = target - allOrders.length
    const limit = Math.min(remaining, 250)

    const requestUrl = nextUrl
      ? nextUrl
      : `${SHOPIFY_BASE_URL}/orders.json?${new URLSearchParams({
          status,
          limit: String(limit),
        }).toString()}`

    const response = await fetch(requestUrl, {
      headers: SHOPIFY_HEADERS,
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

    const linkHeader = response.headers.get('Link')
    if (!linkHeader) {
      break
    }

    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
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
  if (!SHOPIFY_BASE_URL) {
    return { payouts: [] }
  }

  const query = new URLSearchParams({ limit: String(limit) })
  const data = await shopifyFetch<{ payouts: any[] }>(`/shopify_payments/payouts.json?${query.toString()}`)
  return { payouts: data.payouts ?? [] }
}

export async function fetchShopifyPayoutTransactions(payoutId: string) {
  if (!SHOPIFY_BASE_URL) {
    return { transactions: [] }
  }

  const query = new URLSearchParams({ payout_id: payoutId, limit: '250' })
  const data = await shopifyFetch<{ transactions: any[] }>(
    `/shopify_payments/balance/transactions.json?${query.toString()}`,
  )
  return { transactions: data.transactions ?? [] }
}

export async function getOrderByNameFromShopify(orderName: string) {
  if (!SHOPIFY_BASE_URL) {
    return null
  }

  try {
    // Remove # if present to get the order number
    const orderNumber = orderName.replace(/^#/, '')
    
    // Try searching by order_number first (more reliable)
    const queryByNumber = new URLSearchParams({ 
      order_number: orderNumber,
      limit: '1'
    })
    
    try {
      const dataByNumber = await shopifyFetch<{ orders: any[] }>(`/orders.json?${queryByNumber.toString()}`)
      if (dataByNumber.orders && dataByNumber.orders.length > 0) {
        return dataByNumber.orders[0]
      }
    } catch (error) {
      // If order_number doesn't work, try name parameter
      console.log('Search by order_number failed, trying name parameter...')
    }
    
    // Fallback: Try searching by name parameter
    const queryByName = new URLSearchParams({ 
      name: `#${orderNumber}`, // Include # in the search
      limit: '1'
    })
    
    const dataByName = await shopifyFetch<{ orders: any[] }>(`/orders.json?${queryByName.toString()}`)
    
    if (dataByName.orders && dataByName.orders.length > 0) {
      return dataByName.orders[0]
    }
    
    return null
  } catch (error) {
    console.error('Error fetching order by name from Shopify:', error)
    throw error
  }
}
