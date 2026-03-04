import { FlattenedOrderLine } from './types'
import { getShopifyCredentials, buildHeaders, shopifyFetch, parseFloatOrNull, parseDate, stringify } from './shared'

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
    const quantity = Number(item.current_quantity ?? item.quantity ?? 0)
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
      console.log(`Search by order_number=${orderNumber} returned ${dataByNumber.orders?.length || 0} orders`)
      if (dataByNumber.orders && dataByNumber.orders.length > 0) {
        // Find the exact match by order_number
        const exactMatch = dataByNumber.orders.find((o: any) =>
          String(o.order_number) === String(orderNumber) ||
          o.name === `#${orderNumber}` ||
          o.name === orderNumber
        )
        if (exactMatch) {
          console.log(`Found exact match: ID=${exactMatch.id}, Name=${exactMatch.name}, Order Number=${exactMatch.order_number}`)
          foundOrder = exactMatch
        } else {
          // Log what we found
          console.log(`No exact match found. Found orders:`, dataByNumber.orders.map((o: any) => ({
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
      console.log(`Search by name=#${orderNumber} returned ${dataByName.orders?.length || 0} orders`)

      if (dataByName.orders && dataByName.orders.length > 0) {
        // Find the exact match
        const exactMatch = dataByName.orders.find((o: any) =>
          String(o.order_number) === String(orderNumber) ||
          o.name === `#${orderNumber}` ||
          o.name === orderNumber
        )
        if (exactMatch) {
          console.log(`Found exact match by name: ID=${exactMatch.id}, Name=${exactMatch.name}, Order Number=${exactMatch.order_number}`)
          foundOrder = exactMatch
        } else {
          console.log(`No exact match found by name. Found orders:`, dataByName.orders.map((o: any) => ({
            id: o.id,
            name: o.name,
            order_number: o.order_number
          })))
        }
      }
    }

    // If we found an order, fetch the full order details by ID to ensure we have all fields including addresses and line item properties
    if (foundOrder && foundOrder.id) {
      console.log(`Found order by search: ID=${foundOrder.id}, Name=${foundOrder.name}, Order Number=${foundOrder.order_number}`)
      console.log(`Fetching full order details for ID ${foundOrder.id} to ensure all fields (including line item properties) are included...`)
      try {
        const fullOrderData = await shopifyFetch<{ order: any }>(`/orders/${foundOrder.id}.json`)
        if (fullOrderData.order) {
          // Log line item properties for debugging
          if (fullOrderData.order.line_items && fullOrderData.order.line_items.length > 0) {
            console.log(`Retrieved full order details for order ${foundOrder.id}`)
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
        console.warn(`Could not fetch full order details, using search result:`, error)
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
