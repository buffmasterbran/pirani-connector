import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { flattenShopifyOrder, saveCustomerAndAddresses } from '@/lib/shopify'

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
      // Save customer and addresses first
      try {
        console.log(`💾 Saving customer/addresses for order ${rawOrder.id}...`)
        await saveCustomerAndAddresses(rawOrder)
        console.log(`✅ Successfully saved customer/addresses for order ${rawOrder.id}`)
      } catch (error) {
        console.error(`❌ Error saving customer/addresses for order ${rawOrder.id}:`, error)
        if (error instanceof Error) {
          console.error(`Error details: ${error.message}`)
          console.error(`Stack: ${error.stack}`)
        }
        // Continue with order import even if customer save fails
      }

      const flattened = flattenShopifyOrder(rawOrder)
      const shopifyOrderId = flattened[0]?.shopifyOrderId
      let firstOrderLineId: number | null = null

      for (const line of flattened) {
        const { shopifyOrderId: lineShopifyOrderId, lineItemId, sourceName, appId, ...rest } = line

        // Try to include sourceName and appId if Prisma client supports them, otherwise exclude them
        const createData: any = {
          shopifyOrderId: lineShopifyOrderId,
          lineItemId,
          ...rest,
        }
        
        // Only include sourceName and appId if they exist (Prisma client may not have been regenerated)
        if (sourceName !== undefined && sourceName !== null) {
          createData.sourceName = sourceName
        }
        if (appId !== undefined && appId !== null) {
          createData.appId = appId
        }

        let result
        try {
          result = await prisma.orderLine.upsert({
            where: {
              shopifyOrderId_lineItemId: {
                shopifyOrderId: lineShopifyOrderId,
                lineItemId,
              },
            },
            create: createData,
            update: {
              ...rest,
              ...(sourceName !== undefined && sourceName !== null ? { sourceName } : {}),
              ...(appId !== undefined && appId !== null ? { appId } : {}),
              updatedAt: new Date(),
            },
          })
        } catch (error: any) {
          // If error is about unknown fields, retry without sourceName/appId
          if (error.message?.includes('sourceName') || error.message?.includes('appId') || error.message?.includes('Unknown arg')) {
            console.warn(`⚠️ Prisma client not regenerated with new fields, saving without sourceName/appId for order ${lineShopifyOrderId}`)
            const { sourceName: _, appId: __, ...restWithoutNewFields } = line
            result = await prisma.orderLine.upsert({
              where: {
                shopifyOrderId_lineItemId: {
                  shopifyOrderId: lineShopifyOrderId,
                  lineItemId,
                },
              },
              create: {
                shopifyOrderId: lineShopifyOrderId,
                lineItemId,
                ...restWithoutNewFields,
              },
              update: {
                ...restWithoutNewFields,
                updatedAt: new Date(),
              },
            })
          } else {
            throw error
          }
        }

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
