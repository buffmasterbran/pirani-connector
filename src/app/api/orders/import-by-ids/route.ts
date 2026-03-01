import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getShopifyCredentials, flattenShopifyOrder, saveCustomerAndAddresses } from '@/lib/shopify'


const CONCURRENCY = 4
const BATCH_DELAY_MS = 600

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOrderFromShopify(
  orderId: string,
  baseUrl: string,
  accessToken: string,
  retries = 3,
): Promise<{ orderId: string; order: any | null; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('Retry-After') || '2')
        const waitMs = Math.max(retryAfter * 1000, 1000) * (attempt + 1)
        console.warn(`⏳ Rate limited on order ${orderId}, waiting ${waitMs}ms (attempt ${attempt + 1})`)
        await sleep(waitMs)
        continue
      }

      if (!res.ok) return { orderId, order: null, error: `${res.status} ${res.statusText}` }
      const data = await res.json()
      return { orderId, order: data.order ?? null }
    } catch (e: any) {
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      return { orderId, order: null, error: e.message }
    }
  }
  return { orderId, order: null, error: 'Max retries exceeded' }
}

export async function POST(request: NextRequest) {
  try {
    const creds = await getShopifyCredentials()
    if (!creds) {
      return NextResponse.json(
        { success: false, message: 'Shopify credentials missing.', imported: 0, updated: 0 },
        { status: 503 },
      )
    }

    const body = await request.json()
    const orderIds: string[] = Array.isArray(body.orderIds) ? body.orderIds : []

    if (!orderIds.length) {
      return NextResponse.json(
        { success: false, message: 'No order IDs provided.', imported: 0, updated: 0 },
        { status: 400 },
      )
    }

    let imported = 0
    let updated = 0
    const errors: string[] = []

    console.log(`🚀 Starting import of ${orderIds.length} order(s) (concurrency: ${CONCURRENCY}, delay: ${BATCH_DELAY_MS}ms)...`)

    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      const batch = orderIds.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map((id) => fetchOrderFromShopify(id, creds.baseUrl, creds.accessToken)),
      )

      for (const { orderId, order: rawOrder, error } of results) {
        if (error || !rawOrder) {
          const errMsg = `Order ${orderId}: ${error || 'not found'}`
          errors.push(errMsg)
          if (errors.length <= 5) console.error(`❌ ${errMsg}`)
          continue
        }

        try {
          if (imported === 0 && updated === 0) console.log(`✅ First successful fetch: order ${orderId}, name=${rawOrder.name}`)
          try { await saveCustomerAndAddresses(rawOrder) } catch { /* non-fatal */ }

          const flattened = flattenShopifyOrder(rawOrder)
          const shopifyOrderId = flattened[0]?.shopifyOrderId
          let firstOrderLineId: number | null = null

          for (const line of flattened) {
            const { shopifyOrderId: lineShopifyOrderId, lineItemId, sourceName, appId, ...rest } = line

            const createData: any = { shopifyOrderId: lineShopifyOrderId, lineItemId, ...rest }
            if (sourceName != null) createData.sourceName = sourceName
            if (appId != null) createData.appId = appId

            const updateData: any = { ...rest, updatedAt: new Date() }
            if (sourceName != null) updateData.sourceName = sourceName
            if (appId != null) updateData.appId = appId

            let result
            try {
              result = await prisma.orderLine.upsert({
                where: { shopifyOrderId_lineItemId: { shopifyOrderId: lineShopifyOrderId, lineItemId } },
                create: createData,
                update: updateData,
              })
            } catch (err: any) {
              if (err.message?.includes('sourceName') || err.message?.includes('appId') || err.message?.includes('Unknown arg')) {
                const { sourceName: _, appId: __, shopifyOrderId: ___, lineItemId: ____, ...restClean } = line
                result = await prisma.orderLine.upsert({
                  where: { shopifyOrderId_lineItemId: { shopifyOrderId: lineShopifyOrderId, lineItemId } },
                  create: { shopifyOrderId: lineShopifyOrderId, lineItemId, ...restClean },
                  update: { ...restClean, updatedAt: new Date() },
                })
              } else {
                throw err
              }
            }

            if (!firstOrderLineId) firstOrderLineId = result.id

            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              imported++
            } else {
              updated++
            }
          }

          if (shopifyOrderId && firstOrderLineId) {
            await prisma.payoutTransaction.updateMany({
              where: { shopifyOrderId, orderLineId: null },
              data: { orderLineId: firstOrderLineId },
            })
          }
        } catch (e: any) {
          errors.push(`Order ${orderId}: ${e.message}`)
          console.error(`❌ Error importing order ${orderId}:`, e.message)
        }
      }

      const processed = Math.min(i + CONCURRENCY, orderIds.length)
      if (processed % 100 === 0 || processed === orderIds.length) {
        console.log(`📦 Progress: ${processed}/${orderIds.length} (${imported} imported, ${updated} updated, ${errors.length} errors)`)
      }

      // Respect Shopify rate limits: ~2 requests/second leak rate
      if (i + CONCURRENCY < orderIds.length) {
        await sleep(BATCH_DELAY_MS)
      }
    }

    console.log(`🏁 Import complete: ${imported} imported, ${updated} updated, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
      totalErrors: errors.length,
    })
  } catch (error) {
    console.error('❌ Error importing orders by IDs:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to import orders' },
      { status: 500 },
    )
  }
}
