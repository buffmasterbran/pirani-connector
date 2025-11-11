import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { flattenShopifyOrder } from '@/lib/shopify'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orders = Array.isArray(body.orders) ? body.orders : []

    if (!orders.length) {
      return NextResponse.json({ success: false, message: 'No orders provided.', orders: [] }, { status: 400 })
    }

    let imported = 0
    let updated = 0

    for (const rawOrder of orders) {
      const flattened = flattenShopifyOrder(rawOrder)
      const shopifyOrderId = flattened[0]?.shopifyOrderId
      let firstOrderLineId: number | null = null

      for (const line of flattened) {
        const { shopifyOrderId: lineShopifyOrderId, lineItemId, ...rest } = line

        const result = await prisma.orderLine.upsert({
          where: {
            shopifyOrderId_lineItemId: {
              shopifyOrderId: lineShopifyOrderId,
              lineItemId,
            },
          },
          create: {
            shopifyOrderId: lineShopifyOrderId,
            lineItemId,
            ...rest,
          },
          update: {
            ...rest,
            updatedAt: new Date(),
          },
        })

        // Store the first OrderLine ID for this order (for transaction backfilling)
        if (!firstOrderLineId) {
          firstOrderLineId = result.id
        }

        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
          imported += 1
        } else {
          updated += 1
        }
      }

      // Backfill orderLineId for existing PayoutTransactions that reference this order
      // Use the first OrderLine ID since transactions are at the order level
      if (shopifyOrderId && firstOrderLineId) {
        await prisma.payoutTransaction.updateMany({
          where: {
            shopifyOrderId,
            orderLineId: null,
          },
          data: {
            orderLineId: firstOrderLineId,
          },
        })
      }
    }

    return NextResponse.json({ success: true, imported, updated, orders })
  } catch (error) {
    console.error('❌ Error saving orders to database:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save orders to database' },
      { status: 500 },
    )
  }
}
