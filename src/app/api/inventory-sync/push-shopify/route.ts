import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  getShopifyStore,
  findVariantBySku,
  updateVariantPrices,
  setInventoryQuantities,
} from '@/lib/product-sync/shopify-graphql'
import { logWebhook } from '@/lib/webhook-logger'

/**
 * POST /api/inventory-sync/push-shopify
 *
 * Reads "dirty" items from the database (where NetSuite values differ
 * from last-synced values) and pushes them to Shopify. Decoupled from
 * the webhook ingest so each can run independently.
 */
export async function POST() {
  const startTime = Date.now()

  try {
    const storeConfig = await prisma.productSyncStoreConfig.findFirst({
      where: { isActive: true },
      include: { locationMappings: { where: { isActive: true } } },
    })

    if (!storeConfig) {
      return NextResponse.json({ error: 'No active store configured' }, { status: 404 })
    }

    if (storeConfig.locationMappings.length === 0) {
      return NextResponse.json({ error: 'No location mappings configured' }, { status: 404 })
    }

    const store = await getShopifyStore(storeConfig.id)

    // Find all items where NetSuite values differ from last-synced values
    const allMappings = await prisma.productSyncMapping.findMany({
      where: { storeConfigId: storeConfig.id },
    })

    // Filter to "dirty" items in JS since Prisma can't compare two columns
    const dirtyItems = allMappings.filter((m) => {
      const currentPrice = m.netsuiteCurrentPrice ? Number(m.netsuiteCurrentPrice) : null
      const lastPrice = m.lastSyncedPrice ? Number(m.lastSyncedPrice) : null
      const priceChanged = currentPrice !== null && (lastPrice === null || Math.abs(currentPrice - lastPrice) >= 0.01)
      const qtyChanged = m.netsuiteCurrentQty !== null && (m.lastSyncedQuantity === null || m.netsuiteCurrentQty !== m.lastSyncedQuantity)
      return priceChanged || qtyChanged
    })

    console.info(`[push-shopify] Found ${dirtyItems.length} dirty items out of ${allMappings.length} total`)

    if (dirtyItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No items need syncing',
        total: allMappings.length,
        dirty: 0,
        elapsed_ms: Date.now() - startTime,
      })
    }

    let priceUpdates = 0
    let qtyUpdates = 0
    let matched = 0
    let unmatched = 0
    let errors = 0
    const errorDetails: Array<{ sku: string; error: string }> = []

    for (const item of dirtyItems) {
      try {
        const currentPrice = item.netsuiteCurrentPrice ? Number(item.netsuiteCurrentPrice) : null
        const currentQty = item.netsuiteCurrentQty ?? 0
        const lastPrice = item.lastSyncedPrice ? Number(item.lastSyncedPrice) : null
        const lastQty = item.lastSyncedQuantity ?? null

        const priceChanged = currentPrice !== null && (lastPrice === null || Math.abs(currentPrice - lastPrice) >= 0.01)
        const qtyChanged = lastQty === null || currentQty !== lastQty

        // If not yet matched to Shopify, try to match
        let variantId = item.shopifyVariantId
        let productId = item.shopifyProductId
        let inventoryItemId = item.shopifyInventoryItemId

        if (!variantId || item.matchStatus !== 'matched') {
          const matches = await findVariantBySku(store, item.netsuiteSku)
          if (matches.length === 0) {
            await prisma.productSyncMapping.update({
              where: { id: item.id },
              data: { matchStatus: 'unmatched', lastSyncError: 'SKU not found in Shopify' },
            })
            unmatched++
            continue
          }
          if (matches.length > 1) {
            await prisma.productSyncMapping.update({
              where: { id: item.id },
              data: {
                matchStatus: 'multiple_matches',
                lastSyncError: `Multiple Shopify variants found (${matches.length})`,
              },
            })
            errorDetails.push({ sku: item.netsuiteSku, error: `Multiple variants (${matches.length})` })
            errors++
            continue
          }

          const v = matches[0]
          variantId = v.variantId
          productId = v.productId
          inventoryItemId = v.inventoryItemId

          await prisma.productSyncMapping.update({
            where: { id: item.id },
            data: {
              matchStatus: 'matched',
              shopifyVariantId: v.variantId,
              shopifyProductId: v.productId,
              shopifyInventoryItemId: v.inventoryItemId,
              shopifyProductTitle: v.productTitle,
              shopifyProductHandle: v.productHandle,
              lastSyncError: null,
            },
          })
          matched++
        }

        const updateData: Record<string, any> = {}

        // Push price
        if (priceChanged && currentPrice !== null && productId && variantId) {
          const priceResult = await updateVariantPrices(store, productId, [
            { id: variantId, price: currentPrice.toFixed(2) },
          ])
          if (priceResult.success) {
            priceUpdates++
            updateData.lastSyncedPrice = currentPrice
            updateData.lastSyncAt = new Date()
          } else {
            errorDetails.push({ sku: item.netsuiteSku, error: `Price: ${priceResult.errors.join(', ')}` })
            errors++
          }
        }

        // Push inventory
        if (qtyChanged && inventoryItemId) {
          const quantities = storeConfig.locationMappings.map(lm => ({
            inventoryItemId: inventoryItemId!,
            locationId: lm.shopifyLocationId,
            quantity: currentQty,
          }))

          const invResult = await setInventoryQuantities(store, quantities)
          if (invResult.success) {
            qtyUpdates++
            updateData.lastSyncedQuantity = currentQty
            updateData.lastSyncAt = new Date()
          } else {
            errorDetails.push({ sku: item.netsuiteSku, error: `Qty: ${invResult.errors.join(', ')}` })
            errors++
          }
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.productSyncMapping.update({
            where: { id: item.id },
            data: { ...updateData, lastSyncStatus: 'success', lastSyncError: null },
          })
        }
      } catch (err: any) {
        errors++
        errorDetails.push({ sku: item.netsuiteSku, error: err.message })
        console.error(`[push-shopify] Error pushing ${item.netsuiteSku}:`, err.message)
      }
    }

    const summary = {
      success: true,
      total: allMappings.length,
      dirty: dirtyItems.length,
      priceUpdates,
      qtyUpdates,
      newlyMatched: matched,
      unmatched,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 20) : undefined,
      elapsed_ms: Date.now() - startTime,
    }

    console.info(`[push-shopify] Done. Prices: ${priceUpdates}, Qty: ${qtyUpdates}, Matched: ${matched}, Unmatched: ${unmatched}, Errors: ${errors} — ${Date.now() - startTime}ms`)

    await logWebhook({
      endpoint: '/api/inventory-sync/push-shopify',
      requestPayload: { dirtyCount: dirtyItems.length },
      responsePayload: summary,
      responseStatus: 200,
      durationMs: Date.now() - startTime,
      source: 'push-shopify',
      itemCount: dirtyItems.length,
      summary: `Prices: ${priceUpdates}, Qty: ${qtyUpdates}, Matched: ${matched}, Unmatched: ${unmatched}, Errors: ${errors}`,
    })

    return NextResponse.json(summary)
  } catch (error) {
    console.error('[push-shopify] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsed_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}
