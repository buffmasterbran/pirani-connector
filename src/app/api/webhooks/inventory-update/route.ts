import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { logWebhook } from '@/lib/webhook-logger'

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.NETSUITE_WEBHOOK_SECRET
  if (!secret) return true // No secret configured = allow all (dev mode)
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

interface InventoryItem {
  netsuiteId: number
  sku: string
  name?: string | null
  itemType?: string | null
  quantity: number
  quantityOnHand?: number
  price?: number | null
}

interface InventoryPayload {
  storeId: string
  items: InventoryItem[]
  timestamp?: string
}

/**
 * POST /api/webhooks/inventory-update
 *
 * DB-only ingest: receives inventory data from NetSuite M/R script
 * and updates ProductSyncMapping records. Does NOT push to Shopify —
 * that's handled separately by /api/inventory-sync/push-shopify.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: InventoryPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.items || !Array.isArray(payload.items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  console.info(`[webhook:inventory] Received ${payload.items.length} items (storeId: ${payload.storeId})`)

  const storeConfig = await prisma.productSyncStoreConfig.findFirst({
    where: { isActive: true },
  })

  if (!storeConfig) {
    return NextResponse.json({ error: 'No active store configured' }, { status: 404 })
  }

  let updated = 0
  let created = 0
  let unchanged = 0
  let errors = 0
  const errorDetails: Array<{ sku: string; error: string }> = []

  for (const item of payload.items) {
    try {
      const existing = await prisma.productSyncMapping.findUnique({
        where: { storeConfigId_netsuiteSku: { storeConfigId: storeConfig.id, netsuiteSku: item.sku } },
      })

      if (existing) {
        const currentPrice = item.price != null ? item.price : null
        const currentQty = Math.max(0, item.quantity)
        const lastPrice = existing.netsuiteCurrentPrice ? Number(existing.netsuiteCurrentPrice) : null
        const lastQty = existing.netsuiteCurrentQty ?? null

        const priceChanged = currentPrice !== null && (lastPrice === null || Math.abs(currentPrice - lastPrice) >= 0.01)
        const qtyChanged = lastQty === null || currentQty !== lastQty

        if (!priceChanged && !qtyChanged) {
          unchanged++
          continue
        }

        await prisma.productSyncMapping.update({
          where: { id: existing.id },
          data: {
            netsuiteCurrentPrice: item.price != null ? item.price : undefined,
            netsuiteCurrentQty: Math.max(0, item.quantity),
            netsuiteName: item.name || existing.netsuiteName,
            netsuiteItemType: item.itemType || existing.netsuiteItemType,
            updatedAt: new Date(),
          },
        })
        updated++
      } else {
        await prisma.productSyncMapping.create({
          data: {
            storeConfigId: storeConfig.id,
            netsuiteItemId: item.netsuiteId,
            netsuiteSku: item.sku,
            netsuiteName: item.name || null,
            netsuiteItemType: item.itemType || null,
            netsuiteCurrentPrice: item.price != null ? item.price : undefined,
            netsuiteCurrentQty: Math.max(0, item.quantity),
            matchStatus: 'unmatched',
            netsuiteFlagValue: '1',
          },
        })
        created++
      }
    } catch (err: any) {
      errors++
      errorDetails.push({ sku: item.sku, error: err.message })
      console.error(`[webhook:inventory] Error processing ${item.sku}:`, err.message)
    }
  }

  const summary = {
    received: payload.items.length,
    updated,
    created,
    unchanged,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 20) : undefined,
  }

  console.info(`[webhook:inventory] Done. Updated: ${updated}, Created: ${created}, Unchanged: ${unchanged}, Errors: ${errors}`)

  await logWebhook({
    endpoint: '/api/webhooks/inventory-update',
    requestPayload: payload,
    responsePayload: summary,
    responseStatus: 200,
    durationMs: Date.now() - startTime,
    source: request.headers.get('user-agent') || 'unknown',
    itemCount: payload.items.length,
    summary: `Updated: ${updated}, Created: ${created}, Unchanged: ${unchanged}, Errors: ${errors}`,
  })

  return NextResponse.json(summary, { status: 200 })
}
