import prisma from '@/lib/prisma'
import {
  fetchSyncableItems,
  fetchPricesForItems,
  fetchInventoryByLocation,
  aggregateInventory,
  fetchRecentlyChangedItemIds,
} from './netsuite'
import {
  getShopifyStore,
  updateVariantPrices,
  setInventoryQuantities,
  findVariantBySku,
  updateProductFields,
} from './shopify-graphql'
import type { SyncResult, SyncItemError } from './types'
import type { ProductSyncStoreConfig, ProductSyncMapping } from '@prisma/client'

function pricesMatch(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return Math.abs(a - b) < 0.01
}

// ---------- Full Sync ----------

export async function runFullSync(storeConfigId: string): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: SyncItemError[] = []

  const storeConfig = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
    include: { locationMappings: { where: { isActive: true } } },
  })

  if (!storeConfig.syncEnabled || !storeConfig.isActive) {
    return makeSyncResult('completed', 0, 0, 0, 0, 0, 0, startTime, [])
  }

  const log = await prisma.productSyncLog.create({
    data: { storeConfigId, syncType: 'full', status: 'running' },
  })

  try {
    const store = await getShopifyStore(storeConfigId)
    const result = await syncItems(storeConfig, store, null, log.id)
    return result
  } catch (err: any) {
    await prisma.productSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorSummary: [{ sku: 'SYSTEM', error: err.message, timestamp: new Date().toISOString() }],
      },
    })
    return makeSyncResult('failed', 0, 0, 0, 1, 0, 0, startTime, [
      { sku: 'SYSTEM', error: err.message, timestamp: new Date().toISOString() },
    ])
  }
}

// ---------- Incremental Sync ----------

export async function runIncrementalSync(storeConfigId: string): Promise<SyncResult> {
  const startTime = Date.now()

  const storeConfig = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
    include: { locationMappings: { where: { isActive: true } } },
  })

  if (!storeConfig.syncEnabled || !storeConfig.isActive) {
    return makeSyncResult('completed', 0, 0, 0, 0, 0, 0, startTime, [])
  }

  const log = await prisma.productSyncLog.create({
    data: { storeConfigId, syncType: 'incremental', status: 'running' },
  })

  try {
    // Determine what changed since last sync
    const lastLog = await prisma.productSyncLog.findFirst({
      where: {
        storeConfigId,
        status: { in: ['completed', 'completed_with_errors'] },
      },
      orderBy: { startedAt: 'desc' },
    })

    const since = lastLog?.startedAt || new Date(Date.now() - 60 * 60 * 1000) // Default: last hour
    const locationIds = storeConfig.locationMappings.map((m) => m.netsuiteLocationId)
    const changedItemIds = await fetchRecentlyChangedItemIds(
      since,
      locationIds,
      storeConfig.netsuiteFlagFieldId
    )

    if (changedItemIds.length === 0) {
      await prisma.productSyncLog.update({
        where: { id: log.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          itemsProcessed: 0,
        },
      })
      return makeSyncResult('completed', 0, 0, 0, 0, 0, 0, startTime, [])
    }

    const store = await getShopifyStore(storeConfigId)
    const result = await syncItems(storeConfig, store, changedItemIds, log.id)
    return result
  } catch (err: any) {
    await prisma.productSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorSummary: [{ sku: 'SYSTEM', error: err.message, timestamp: new Date().toISOString() }],
      },
    })
    return makeSyncResult('failed', 0, 0, 0, 1, 0, 0, startTime, [
      { sku: 'SYSTEM', error: err.message, timestamp: new Date().toISOString() },
    ])
  }
}

// ---------- Single Item Sync ----------

export async function syncSingleItem(
  storeConfigId: string,
  sku: string
): Promise<SyncResult> {
  const startTime = Date.now()

  const storeConfig = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
    include: { locationMappings: { where: { isActive: true } } },
  })

  const log = await prisma.productSyncLog.create({
    data: { storeConfigId, syncType: 'manual_single', status: 'running' },
  })

  try {
    const mapping = await prisma.productSyncMapping.findUnique({
      where: {
        storeConfigId_netsuiteSku: { storeConfigId, netsuiteSku: sku },
      },
    })

    if (!mapping) {
      throw new Error(`SKU ${sku} not found in sync mappings`)
    }

    if (!mapping.netsuiteItemId) {
      throw new Error(`SKU ${sku} has no NetSuite item ID`)
    }
    const store = await getShopifyStore(storeConfigId)
    const result = await syncItems(storeConfig, store, [mapping.netsuiteItemId], log.id)
    return result
  } catch (err: any) {
    await prisma.productSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorSummary: [{ sku, error: err.message, timestamp: new Date().toISOString() }],
      },
    })
    return makeSyncResult('failed', 0, 0, 0, 1, 0, 0, startTime, [
      { sku, error: err.message, timestamp: new Date().toISOString() },
    ])
  }
}

// ---------- Core sync logic ----------

/**
 * Push items to Shopify. Resolves SKU → Shopify variant at push time (no
 * pre-matching step required). If a SKU isn't found in Shopify, the mapping
 * is marked as an error so the UI can surface it.
 */
async function syncItems(
  storeConfig: ProductSyncStoreConfig & {
    locationMappings: Array<{
      netsuiteLocationId: number
      shopifyLocationId: string
    }>
  },
  store: { id: string; name: string; domain: string; accessToken: string; apiVersion: string },
  filterItemIds: number[] | null,
  logId: string
): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: SyncItemError[] = []
  let itemsProcessed = 0
  let itemsUpdated = 0
  let itemsSkipped = 0
  let itemsErrored = 0
  let priceUpdateCount = 0
  let qtyUpdateCount = 0

  // 1. Get all flagged mappings for this store (no matchStatus gate)
  const whereClause: any = { storeConfigId: storeConfig.id }
  if (filterItemIds) {
    whereClause.netsuiteItemId = { in: filterItemIds }
  }

  const mappings = await prisma.productSyncMapping.findMany({ where: whereClause })
  if (mappings.length === 0) {
    await finalizeLog(logId, 'completed', 0, 0, 0, 0, 0, 0, startTime, [])
    return makeSyncResult('completed', 0, 0, 0, 0, 0, 0, startTime, [])
  }

  // 2. Resolve SKU → Shopify variant for each mapping at push time
  console.info(`[sync] 🔍 Resolving ${mappings.length} SKU(s) against Shopify...`)
  for (const m of mappings) {
    if (m.shopifyVariantId && m.matchStatus === 'matched') continue

    try {
      const variants = await findVariantBySku(store, m.netsuiteSku)
      if (variants.length === 1) {
        const v = variants[0]
        await prisma.productSyncMapping.update({
          where: { id: m.id },
          data: {
            shopifyProductId: v.productId,
            shopifyVariantId: v.variantId,
            shopifyInventoryItemId: v.inventoryItemId,
            shopifyProductTitle: v.productTitle,
            shopifyProductHandle: v.productHandle,
            matchStatus: 'matched',
            lastSyncError: null,
          },
        })
        m.shopifyProductId = v.productId
        m.shopifyVariantId = v.variantId
        m.shopifyInventoryItemId = v.inventoryItemId
        m.matchStatus = 'matched' as any
      } else if (variants.length > 1) {
        await prisma.productSyncMapping.update({
          where: { id: m.id },
          data: { matchStatus: 'multiple_matches', lastSyncError: `SKU "${m.netsuiteSku}" matches ${variants.length} Shopify variants` },
        })
        m.matchStatus = 'multiple_matches' as any
      } else {
        await prisma.productSyncMapping.update({
          where: { id: m.id },
          data: { matchStatus: 'unmatched', lastSyncStatus: 'error', lastSyncError: `SKU "${m.netsuiteSku}" not found in Shopify` },
        })
        m.matchStatus = 'unmatched' as any
        errors.push({ sku: m.netsuiteSku, error: `SKU not found in Shopify`, timestamp: new Date().toISOString() })
        itemsErrored++
      }
    } catch (err: any) {
      errors.push({ sku: m.netsuiteSku, error: `Shopify lookup failed: ${err.message}`, timestamp: new Date().toISOString() })
      itemsErrored++
    }
  }

  const resolvedMappings = mappings.filter((m) => m.matchStatus === 'matched' && m.shopifyVariantId)
  console.info(`[sync] ✅ Resolved ${resolvedMappings.length}/${mappings.length} SKUs to Shopify variants`)

  if (resolvedMappings.length === 0) {
    await finalizeLog(logId, itemsErrored > 0 ? 'completed_with_errors' : 'completed',
      mappings.length, 0, mappings.length - itemsErrored, itemsErrored, 0, 0, startTime, errors)
    return makeSyncResult(itemsErrored > 0 ? 'completed_with_errors' : 'completed',
      mappings.length, 0, mappings.length - itemsErrored, itemsErrored, 0, 0, startTime, errors)
  }

  const itemIds = resolvedMappings.map((m) => m.netsuiteItemId)

  // 3. Fetch prices from NetSuite
  console.info(`[sync] 💰 Fetching prices for ${itemIds.length} item(s) (price level: ${storeConfig.netsuitePriceLevelId})...`)
  const prices = await fetchPricesForItems(storeConfig.netsuitePriceLevelId, itemIds)
  const priceMap = new Map<number, number>()
  for (const p of prices) {
    const id = typeof p.netsuite_id === 'string' ? parseInt(p.netsuite_id as unknown as string, 10) : p.netsuite_id
    const price = typeof p.price === 'string' ? parseFloat(p.price as unknown as string) : p.price
    if (!isNaN(id) && !isNaN(price)) priceMap.set(id, price)
  }
  console.info(`[sync] 💰 Price map: ${priceMap.size} entries from ${prices.length} rows`)

  let comparePriceMap = new Map<number, number>()
  if (storeConfig.netsuiteComparePriceLevelId) {
    const comparePrices = await fetchPricesForItems(
      storeConfig.netsuiteComparePriceLevelId,
      itemIds
    )
    for (const p of comparePrices) {
      const id = typeof p.netsuite_id === 'string' ? parseInt(p.netsuite_id as unknown as string, 10) : p.netsuite_id
      const price = typeof p.price === 'string' ? parseFloat(p.price as unknown as string) : p.price
      if (!isNaN(id) && !isNaN(price)) comparePriceMap.set(id, price)
    }
  }

  // 4. Fetch inventory from NetSuite
  const locationIds = storeConfig.locationMappings.map((m) => m.netsuiteLocationId)
  console.info(`[sync] 📦 Fetching inventory for ${itemIds.length} item(s) across ${locationIds.length} location(s)...`)
  const inventory = await fetchInventoryByLocation(itemIds, locationIds)
  console.info(`[sync] 📦 Got ${inventory.length} inventory records`)
  const aggregated = aggregateInventory(inventory, storeConfig.locationMappings)
  console.info(`[sync] 📦 Aggregated to ${aggregated.size} Shopify location(s)`)

  // 5. Push price changes
  const byProduct = new Map<string, ProductSyncMapping[]>()
  for (const m of resolvedMappings) {
    if (!m.shopifyProductId) continue
    const arr = byProduct.get(m.shopifyProductId) || []
    arr.push(m)
    byProduct.set(m.shopifyProductId, arr)
  }

  for (const [productId, productMappings] of byProduct) {
    const variantUpdates: Array<{
      id: string
      price: string
      compareAtPrice?: string | null
      mapping: ProductSyncMapping
    }> = []

    for (const m of productMappings) {
      const nsPrice = priceMap.get(m.netsuiteItemId)
      const nsComparePrice = comparePriceMap.get(m.netsuiteItemId)

      if (nsPrice === undefined) {
        console.info(`[sync] ⏭️ SKU ${m.netsuiteSku} (NS ID ${m.netsuiteItemId}): no price found in priceMap — skipping price push`)
        continue
      }
      if (!m.shopifyVariantId) {
        console.info(`[sync] ⏭️ SKU ${m.netsuiteSku}: no shopifyVariantId — skipping price push`)
        continue
      }

      const currentSyncedPrice = m.lastSyncedPrice ? Number(m.lastSyncedPrice) : null
      const currentSyncedCompare = m.lastSyncedComparePrice
        ? Number(m.lastSyncedComparePrice)
        : null

      const priceChanged = !pricesMatch(nsPrice, currentSyncedPrice)
      const comparePriceChanged =
        storeConfig.netsuiteComparePriceLevelId != null &&
        !pricesMatch(nsComparePrice ?? null, currentSyncedCompare)

      console.info(`[sync] 💰 SKU ${m.netsuiteSku}: NS price=$${nsPrice}, lastSynced=$${currentSyncedPrice}, changed=${priceChanged}`)

      if (priceChanged || comparePriceChanged) {
        variantUpdates.push({
          id: m.shopifyVariantId,
          price: nsPrice.toFixed(2),
          compareAtPrice: nsComparePrice != null ? nsComparePrice.toFixed(2) : null,
          mapping: m,
        })
      }
    }

    if (variantUpdates.length > 0) {
      try {
        const priceResult = await updateVariantPrices(
          store,
          productId,
          variantUpdates.map((v) => ({
            id: v.id,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
          }))
        )

        if (priceResult.success) {
          for (const v of variantUpdates) {
            await prisma.productSyncMapping.update({
              where: { id: v.mapping.id },
              data: {
                lastSyncedPrice: parseFloat(v.price),
                lastSyncedComparePrice: v.compareAtPrice
                  ? parseFloat(v.compareAtPrice)
                  : null,
                lastSyncAt: new Date(),
                lastSyncStatus: 'success',
                lastSyncError: null,
              },
            })
            priceUpdateCount++
          }
        } else {
          for (const v of variantUpdates) {
            const errMsg = priceResult.errors.join('; ')
            await prisma.productSyncMapping.update({
              where: { id: v.mapping.id },
              data: { lastSyncStatus: 'error', lastSyncError: errMsg },
            })
            errors.push({
              sku: v.mapping.netsuiteSku,
              error: errMsg,
              timestamp: new Date().toISOString(),
            })
            itemsErrored++
          }
        }
      } catch (err: any) {
        for (const v of variantUpdates) {
          errors.push({
            sku: v.mapping.netsuiteSku,
            error: err.message,
            timestamp: new Date().toISOString(),
          })
          itemsErrored++
        }
      }
    }
  }

  // 6. Push inventory changes
  const inventoryEntries = Array.from(aggregated.entries())
  for (const [shopifyLocationId, itemQtyMap] of inventoryEntries) {
    const qtyUpdates: Array<{
      inventoryItemId: string
      locationId: string
      quantity: number
      mapping: ProductSyncMapping
    }> = []

    for (const m of resolvedMappings) {
      if (!m.shopifyInventoryItemId) continue
      const rawQty = itemQtyMap.get(m.netsuiteItemId)
      if (rawQty === undefined) continue
      const nsQty = Math.max(0, rawQty)

      const currentSyncedQty = m.lastSyncedQuantity
      if (currentSyncedQty !== null && currentSyncedQty === nsQty) continue

      qtyUpdates.push({
        inventoryItemId: m.shopifyInventoryItemId,
        locationId: shopifyLocationId,
        quantity: nsQty,
        mapping: m,
      })
    }

    if (qtyUpdates.length > 0) {
      try {
        const invResult = await setInventoryQuantities(
          store,
          qtyUpdates.map((q) => ({
            inventoryItemId: q.inventoryItemId,
            locationId: q.locationId,
            quantity: q.quantity,
          }))
        )

        if (invResult.success) {
          for (const q of qtyUpdates) {
            await prisma.productSyncMapping.update({
              where: { id: q.mapping.id },
              data: {
                lastSyncedQuantity: q.quantity,
                lastSyncAt: new Date(),
                lastSyncStatus: 'success',
                lastSyncError: null,
              },
            })
            qtyUpdateCount++
          }
        } else {
          for (const q of qtyUpdates) {
            const errMsg = invResult.errors.join('; ')
            await prisma.productSyncMapping.update({
              where: { id: q.mapping.id },
              data: { lastSyncStatus: 'error', lastSyncError: errMsg },
            })
            errors.push({
              sku: q.mapping.netsuiteSku,
              error: errMsg,
              timestamp: new Date().toISOString(),
            })
            itemsErrored++
          }
        }
      } catch (err: any) {
        for (const q of qtyUpdates) {
          errors.push({
            sku: q.mapping.netsuiteSku,
            error: err.message,
            timestamp: new Date().toISOString(),
          })
          itemsErrored++
        }
      }
    }
  }

  // 7. Full Product Sync: push product-level fields from DB field mappings
  try {
    const fieldMappings = await prisma.productSyncFieldMapping.findMany({
      where: {
        OR: [{ storeConfigId: storeConfig.id }, { storeConfigId: null }],
        isEnabled: true,
        mappingType: 'item_field',
        shopifyField: {
          notIn: ['sku', 'price', 'compare_at_price', 'inventory_quantity', 'barcode', 'weight', 'weight_unit'],
        },
      },
    })

    if (fieldMappings.length > 0) {
      const productLevelFields = new Set([
        'title', 'body_html', 'vendor', 'product_type', 'tags', 'handle', 'published',
      ])

      const applicableFieldMappings = fieldMappings.filter((fm) =>
        productLevelFields.has(fm.shopifyField) && fm.netsuiteFieldId
      )

      if (applicableFieldMappings.length > 0) {
        const nsItemIds = [...new Set(resolvedMappings.map((m) => m.netsuiteItemId))]

        try {
          const nsModule = await import('./netsuite')
          const itemFieldData = new Map<number, Record<string, string>>()

          if (nsItemIds.length > 0) {
            const fieldSelectParts = applicableFieldMappings.map(
              (fm) => `Item.${fm.netsuiteFieldId}`
            )
            const selectClause = `Item.id, ${fieldSelectParts.join(', ')}`

            const BATCH_SIZE = 500
            for (let i = 0; i < nsItemIds.length; i += BATCH_SIZE) {
              const batch = nsItemIds.slice(i, i + BATCH_SIZE)
              const idList = batch.join(',')
              try {
                const rows: any[] = await (nsModule as any).executeSuiteQLPaginated(
                  `SELECT ${selectClause} FROM Item WHERE Item.id IN (${idList})`
                )
                for (const row of rows) {
                  const data: Record<string, string> = {}
                  for (const fm of applicableFieldMappings) {
                    const val = row[fm.netsuiteFieldId!]
                    if (val != null) data[fm.shopifyField] = String(val)
                  }
                  itemFieldData.set(Number(row.id), data)
                }
              } catch (err: any) {
                console.warn('NS field fetch error (non-fatal):', err.message)
              }
            }
          }

          const productFieldsByProduct = new Map<string, Record<string, string>>()
          for (const m of resolvedMappings) {
            if (!m.shopifyProductId) continue
            const nsData = itemFieldData.get(m.netsuiteItemId)
            if (!nsData || Object.keys(nsData).length === 0) continue
            productFieldsByProduct.set(m.shopifyProductId, nsData)
          }

          for (const [productId, fields] of productFieldsByProduct) {
            try {
              await updateProductFields(store, productId, fields)
            } catch (err: any) {
              console.warn(`Product field update error for ${productId}:`, err.message)
            }
          }
        } catch (err: any) {
          console.warn('Full product field sync error (non-fatal):', err.message)
        }
      }
    }
  } catch (err: any) {
    console.warn('Field mapping lookup error (non-fatal):', err.message)
  }

  // 8. Tally
  itemsProcessed = mappings.length
  itemsUpdated = priceUpdateCount + qtyUpdateCount
  itemsSkipped = itemsProcessed - itemsUpdated - itemsErrored
  console.info(`[sync] 🏁 Sync complete: ${itemsProcessed} processed, ${priceUpdateCount} prices pushed, ${qtyUpdateCount} qty pushed, ${itemsErrored} errors, ${itemsSkipped} skipped`)

  const status =
    itemsErrored > 0 && itemsUpdated > 0
      ? 'completed_with_errors'
      : itemsErrored > 0
        ? 'failed'
        : 'completed'

  await finalizeLog(logId, status as any, itemsProcessed, itemsUpdated, itemsSkipped,
    itemsErrored, priceUpdateCount, qtyUpdateCount, startTime, errors)

  const logRecord = await prisma.productSyncLog.findUnique({ where: { id: logId } })
  const duration = Date.now() - (logRecord?.startedAt?.getTime() ?? startTime)

  await prisma.productSyncLog.update({
    where: { id: logId },
    data: { durationMs: duration },
  })

  return {
    logId,
    status: status as SyncResult['status'],
    itemsProcessed,
    itemsUpdated,
    itemsSkipped,
    itemsErrored,
    priceUpdates: priceUpdateCount,
    quantityUpdates: qtyUpdateCount,
    durationMs: duration,
    errors,
  }
}

async function finalizeLog(
  logId: string,
  status: 'completed' | 'completed_with_errors' | 'failed',
  processed: number,
  updated: number,
  skipped: number,
  errored: number,
  priceUpdates: number,
  quantityUpdates: number,
  startTime: number,
  errors: SyncItemError[]
) {
  await prisma.productSyncLog.update({
    where: { id: logId },
    data: {
      status,
      completedAt: new Date(),
      itemsProcessed: processed,
      itemsUpdated: updated,
      itemsSkipped: skipped,
      itemsErrored: errored,
      priceUpdates,
      quantityUpdates,
      errorSummary: errors.length > 0 ? JSON.parse(JSON.stringify(errors)) : undefined,
    },
  })
}

function makeSyncResult(
  status: SyncResult['status'],
  processed: number,
  updated: number,
  skipped: number,
  errored: number,
  priceUpdates: number,
  quantityUpdates: number,
  startTime: number,
  errors: SyncItemError[]
): SyncResult {
  return {
    logId: '',
    status,
    itemsProcessed: processed,
    itemsUpdated: updated,
    itemsSkipped: skipped,
    itemsErrored: errored,
    priceUpdates,
    quantityUpdates,
    durationMs: Date.now() - startTime,
    errors,
  }
}
