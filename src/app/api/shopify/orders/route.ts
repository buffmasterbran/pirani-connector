import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchShopifyOrdersPaginated, flattenShopifyOrder, saveCustomerAndAddresses } from '@/lib/shopify'

const MAX_ORDERS = 4000

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const statusParam = searchParams.get('status')

    const limit = limitParam ? Math.min(Number(limitParam), MAX_ORDERS) : 50
    const status = (statusParam as 'any' | 'open' | 'closed') ?? 'any'

    const { orders } = await fetchShopifyOrdersPaginated(limit, status)

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('❌ Failed to fetch Shopify orders', error)
    return NextResponse.json({ error: 'Failed to fetch orders from Shopify' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number
      status?: 'any' | 'open' | 'closed'
    }
    const limit = body.limit ? Math.min(body.limit, MAX_ORDERS) : 50
    const status = body.status ?? 'any'

    const { orders } = await fetchShopifyOrdersPaginated(limit, status)

    if (!orders.length) {
      return NextResponse.json({ imported: 0, updated: 0, message: 'No orders retrieved from Shopify.' })
    }

    let imported = 0
    let updated = 0

    for (const order of orders) {
      // Save customer and addresses first
      try {
        await saveCustomerAndAddresses(order)
      } catch (error) {
        console.warn(`⚠️ Error saving customer/addresses for order ${order.id}:`, error)
        // Continue with order import even if customer save fails
      }

      const flattenedLines = flattenShopifyOrder(order)

      for (const line of flattenedLines) {
        const { shopifyOrderId, lineItemId, ...rest } = line

        const result = await prisma.orderLine.upsert({
          where: {
            shopifyOrderId_lineItemId: {
              shopifyOrderId,
              lineItemId,
            },
          },
          create: {
            shopifyOrderId,
            lineItemId,
            ...rest,
          },
          update: {
            ...rest,
            updatedAt: new Date(),
          },
        })

        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          imported += 1
        } else {
          updated += 1
        }
      }
    }

    return NextResponse.json({ imported, updated })
  } catch (error) {
    console.error('❌ Failed to import Shopify orders', error)
    return NextResponse.json({ error: 'Failed to import Shopify orders' }, { status: 500 })
  }
}
