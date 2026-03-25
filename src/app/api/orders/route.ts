import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toISO } from '@/lib/api-helpers'

const parseStringArray = (value?: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry ?? '')) : []
  } catch {
    return []
  }
}

const parseShippingLines = (
  value?: string | null,
): Array<{ title: string; price: string }> => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const title = 'title' in entry ? String((entry as any).title ?? '') : ''
        const price = 'price' in entry ? String((entry as any).price ?? '') : ''
        return { title, price }
      })
      .filter(Boolean) as Array<{ title: string; price: string }>
  } catch {
    return []
  }
}

const parseObject = (value?: string | null): Record<string, unknown> | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const searchTerm = searchParams.get('search')?.trim().toLowerCase() || ''
    
    // Build where clause with optional search
    const whereClause: any = { isDeleted: false }
    
    if (searchTerm) {
      // SQLite doesn't support case-insensitive mode, so we'll use contains
      // and handle case-insensitivity in the application layer if needed
      const searchLower = searchTerm.toLowerCase()
      whereClause.OR = [
        { shopifyOrderName: { contains: searchTerm } },
        { shopifyOrderId: { contains: searchTerm } },
        { currency: { contains: searchTerm } },
      ]
      
      // For numeric search, try to parse as number and search orderTotal
      const numericSearch = parseFloat(searchTerm)
      if (!isNaN(numericSearch)) {
        whereClause.OR.push({
          orderTotal: { equals: numericSearch }
        })
      }
    }
    
    const lines = await prisma.orderLine.findMany({
      where: whereClause,
      orderBy: [{ orderCreatedAt: 'desc' }, { lineItemName: 'asc' }],
    })

    const ordersMap = new Map<string, any>()

    for (const line of lines) {
      const existing = ordersMap.get(line.shopifyOrderId)

      const baseOrder = existing ?? {
        id: line.shopifyOrderId,
        shopifyId: line.shopifyOrderId,
        name: line.shopifyOrderName,
        financial_status: line.financialStatus,
        fulfillment_status: line.fulfillmentStatus,
        total_price: line.orderTotal ?? 0,
        currency: line.currency,
        created_at: toISO(line.orderCreatedAt),
        netsuiteDepositNumber: line.netsuiteDepositId,
        netsuiteSalesOrderId: line.netsuiteSalesOrderId,
        netsuiteSalesOrderName: line.netsuiteSalesOrderName,
        netsuiteCashSaleId: line.netsuiteCashSaleId,
        netsuiteCashSaleName: line.netsuiteCashSaleName,
        netsuiteRefundId: line.netsuiteRefundId,
        netsuiteRefundName: line.netsuiteRefundName,
        payoutId: line.shopifyPayoutId,
        payoutStatus: line.shopifyPayoutStatus,
        variance_amount: line.varianceAmount ?? 0,
        synced_shopify_at: toISO(line.syncedShopifyAt),
        synced_netsuite_at: toISO(line.syncedNetsuiteAt),
        payment_gateway_names: parseStringArray(line.paymentGatewayNames),
        shipping_lines: parseShippingLines(line.shippingLines),
        customer: {
          first_name: line.customerFirstName,
          last_name: line.customerLastName,
          email: line.customerEmail,
        },
        shipping_address: parseObject(line.shippingAddress),
        subtotal_price: line.orderSubtotal ?? 0,
        total_tax: line.orderTax ?? 0,
        shipping_cost: line.orderShipping ?? 0,
        discount_amount: line.orderDiscount ?? 0,
        inDatabase: true, // Orders from database are always in database
        original: {},
        line_items: [] as Array<{ title: string; sku?: string; quantity: number; price: number }>,
      }

      baseOrder.line_items.push({
        title: line.lineItemName ?? 'Item',
        sku: line.lineItemSku ?? undefined,
        quantity: line.lineItemQuantity ?? 0,
        price: line.lineItemPrice ?? 0,
      })

      ordersMap.set(line.shopifyOrderId, baseOrder)
    }

    return NextResponse.json({ orders: Array.from(ordersMap.values()) })
  } catch (error) {
    console.error('❌ Failed to load orders', error)
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
  }
}
