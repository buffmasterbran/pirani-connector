import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  getShopifyStore,
  findVariantBySku,
  updateVariantPrices,
  setInventoryQuantities,
} from '@/lib/product-sync/shopify-graphql'

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

export async function POST(request: NextRequest) {
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
    include: { locationMappings: { where: { isActive: true } } },
  })

  if (!storeConfig) {
    return NextResponse.json({ error: 'No active store configured' }, { status: 404 })
  }

  const store = await getShopifyStore(storeConfig.id)

  let priceUpdates = 0
  let quantityUpdates = 0
  let skipped = 0
  let errors = 0
  const errorDetails: Array<{ sku: string; error: string }> = []

  for (const item of payload.items) {
    try {
      const existing = await prisma.productSyncMapping.findUnique({
        where: { storeConfigId_netsuiteSku: { storeConfigId: storeConfig.id, netsuiteSku: item.sku } },
      })

      if (existing) {
        await prisma.productSyncMapping.update({
          where: { id: existing.id },
          data: {
            netsuiteCurrentPrice: item.price != null ? item.price : undefined,
            netsuiteCurrentQty: item.quantity,
            updatedAt: new Date(),
          },
        })
      }

      const currentPrice = item.price != null ? item.price : null
      const currentQty = Math.max(0, item.quantity)
      const lastPrice = existing?.lastSyncedPrice ? Number(existing.lastSyncedPrice) : null
      const lastQty = existing?.lastSyncedQuantity ?? null

      const priceChanged = currentPrice !== null && (lastPrice === null || Math.abs(currentPrice - lastPrice) >= 0.01)
      const qtyChanged = lastQty === null || currentQty !== lastQty

      if (!priceChanged && !qtyChanged) {
        skipped++
        continue
      }

      const matches = await findVariantBySku(store, item.sku)
      if (matches.length === 0) {
        skipped++
        continue
      }
      if (matches.length > 1) {
        errorDetails.push({ sku: item.sku, error: `Multiple Shopify variants found (${matches.length})` })
        errors++
        continue
      }

      const variant = matches[0]
      const updateData: Record<string, any> = {}

      if (priceChanged && currentPrice !== null) {
        const priceResult = await updateVariantPrices(store, variant.productId, [
          { id: variant.variantId, price: currentPrice.toFixed(2) },
        ])
        if (priceResult.success) {
          priceUpdates++
          updateData.lastSyncedPrice = currentPrice
          updateData.lastSyncAt = new Date()
        } else {
          errorDetails.push({ sku: item.sku, error: `Price update failed: ${priceResult.errors.join(', ')}` })
          errors++
        }
      }

      if (qtyChanged && storeConfig.locationMappings.length > 0) {
        const quantities = storeConfig.locationMappings.map(lm => ({
          inventoryItemId: variant.inventoryItemId,
          locationId: lm.shopifyLocationId,
          quantity: currentQty,
        }))

        const invResult = await setInventoryQuantities(store, quantities)
        if (invResult.success) {
          quantityUpdates++
          updateData.lastSyncedQuantity = currentQty
          updateData.lastSyncAt = new Date()
        } else {
          errorDetails.push({ sku: item.sku, error: `Inventory update failed: ${invResult.errors.join(', ')}` })
          errors++
        }
      }

      if (existing && Object.keys(updateData).length > 0) {
        await prisma.productSyncMapping.update({
          where: { id: existing.id },
          data: { ...updateData, lastSyncStatus: 'success', lastSyncError: null },
        })
      }
    } catch (err: any) {
      errors++
      errorDetails.push({ sku: item.sku, error: err.message })
      console.error(`[webhook:inventory] Error processing ${item.sku}:`, err.message)
    }
  }

  const summary = {
    received: payload.items.length,
    priceUpdates,
    quantityUpdates,
    skipped,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 20) : undefined,
  }

  console.info(`[webhook:inventory] Done. Prices: ${priceUpdates}, Qty: ${quantityUpdates}, Skipped: ${skipped}, Errors: ${errors}`)

  return NextResponse.json(summary, { status: 200 })
}
