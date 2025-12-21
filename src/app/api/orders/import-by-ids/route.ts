import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { flattenShopifyOrder, saveCustomerAndAddresses } from '@/lib/shopify'

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'https://pirani-life.myshopify.com'
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds : []

    if (!orderIds.length) {
      return NextResponse.json(
        { success: false, message: 'No order IDs provided.', imported: 0, updated: 0 },
        { status: 400 }
      )
    }

    let imported = 0
    let updated = 0
    const errors: string[] = []
    let processedOrderCount = 0

    console.log(`🚀 Starting import of ${orderIds.length} order(s)...`)

    // Fetch orders from Shopify and save them
    for (const orderId of orderIds) {
      try {
        processedOrderCount++
        console.log(`📦 Processing order ${processedOrderCount}/${orderIds.length}: ${orderId}`)
        // Fetch order from Shopify
        const response = await fetch(
          `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          }
        )

        if (!response.ok) {
          errors.push(`Order ${orderId}: ${response.status} ${response.statusText}`)
          continue
        }

        const data = await response.json()
        const rawOrder = data.order

        if (!rawOrder) {
          errors.push(`Order ${orderId}: Order not found in response`)
          continue
        }

        // Save customer and addresses first
        try {
          await saveCustomerAndAddresses(rawOrder)
        } catch (error) {
          console.warn(`⚠️ Error saving customer/addresses for order ${orderId}:`, error)
          // Continue with order import even if customer save fails
        }

        // Save order using existing logic
        const flattened = flattenShopifyOrder(rawOrder)
        const shopifyOrderId = flattened[0]?.shopifyOrderId
        let firstOrderLineId: number | null = null
        let orderImportedCount = 0
        let orderUpdatedCount = 0

        for (const line of flattened) {
          const { shopifyOrderId: lineShopifyOrderId, lineItemId, sourceName, appId, ...rest } = line

          // Try to include sourceName and appId if Prisma client supports them, otherwise exclude them
          const createData: any = {
            shopifyOrderId: lineShopifyOrderId,
            lineItemId,
            ...rest,
          }
          
          // Only include sourceName and appId if they exist (Prisma client may not have been regenerated)
          // We'll use a try-catch approach: try with fields first, fallback without them
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
            orderImportedCount += 1
          } else {
            updated += 1
            orderUpdatedCount += 1
          }
        }

        // Backfill orderLineId for existing PayoutTransactions that reference this order
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

        console.log(`✅ Successfully processed order ${orderId} (${flattened.length} line items: ${orderImportedCount} imported, ${orderUpdatedCount} updated)`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`Order ${orderId}: ${errorMessage}`)
        console.error(`❌ Error importing order ${orderId}:`, error)
      }
    }

    console.log(`🏁 Import complete: ${processedOrderCount} orders processed, ${imported} line items imported, ${updated} line items updated, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('❌ Error importing orders by IDs:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to import orders' },
      { status: 500 }
    )
  }
}

