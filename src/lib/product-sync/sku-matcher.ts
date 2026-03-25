import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getShopifyStore, findVariantBySku } from './shopify-graphql'
import {
  fetchSyncableItems,
  fetchPricesForItems,
  fetchInventoryByLocation,
  fetchTotalInventory,
  fetchKitInventory,
  aggregateInventory,
} from './netsuite'
import type { ProductSyncStoreConfig } from '@prisma/client'

interface MatchResult {
  matched: number
  unmatched: number
  multipleMatches: number
  errors: number
}

const BATCH_SIZE = 500

/**
 * Fetches all flagged NetSuite items for a store, bulk-upserts them into ProductSyncMapping,
 * then enriches each mapping with current NS price and aggregated inventory quantity.
 * All DB writes are batched for performance (handles 50k+ SKUs efficiently).
 */
export async function fetchAndPopulateNetSuiteItems(
  storeConfig: ProductSyncStoreConfig
): Promise<{ created: number; updated: number; pricesLoaded: number; inventoryLoaded: number }> {
  console.info(`[product-sync] 🔄 Starting pull for store "${storeConfig.storeName}" (flag field: ${storeConfig.netsuiteFlagFieldId})`)
  const t0 = Date.now()

  const items = await fetchSyncableItems(
    storeConfig.netsuiteFlagFieldId,
    storeConfig.includeNonInventory
  )
  console.info(`[product-sync] 📦 Fetched ${items.length} flagged items from NetSuite in ${Date.now() - t0}ms`)

  if (items.length === 0) {
    console.info('[product-sync] ⚠️ No items returned — check that the flag field has items with value 1')
    return { created: 0, updated: 0, pricesLoaded: 0, inventoryLoaded: 0 }
  }

  const parsedIds: number[] = []
  const kitItemIds: number[] = []

  for (const item of items) {
    const itemId = typeof item.netsuite_id === 'string' ? parseInt(item.netsuite_id, 10) : item.netsuite_id
    parsedIds.push(itemId)
    if (item.item_type === 'Kit') kitItemIds.push(itemId)
  }

  // --- Bulk upsert items via raw SQL (INSERT ... ON CONFLICT) ---
  const t1 = Date.now()
  let totalUpserted = 0
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const values = batch.map((item) => {
      const itemId = typeof item.netsuite_id === 'string' ? parseInt(item.netsuite_id, 10) : item.netsuite_id
      return Prisma.sql`(
        gen_random_uuid(), ${storeConfig.id}, ${itemId}, ${item.sku},
        ${item.name}, ${item.color}, ${item.size}, ${item.item_type},
        ${item.flag_value}, NOW(), NOW()
      )`
    })

    await prisma.$executeRaw`
      INSERT INTO "ProductSyncMapping"
        ("id", "storeConfigId", "netsuiteItemId", "netsuiteSku",
         "netsuiteName", "netsuiteColor", "netsuiteSize", "netsuiteItemType",
         "netsuiteFlagValue", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("storeConfigId", "netsuiteSku") DO UPDATE SET
        "netsuiteItemId" = EXCLUDED."netsuiteItemId",
        "netsuiteName" = EXCLUDED."netsuiteName",
        "netsuiteColor" = EXCLUDED."netsuiteColor",
        "netsuiteSize" = EXCLUDED."netsuiteSize",
        "netsuiteItemType" = EXCLUDED."netsuiteItemType",
        "netsuiteFlagValue" = EXCLUDED."netsuiteFlagValue",
        "updatedAt" = NOW()
    `
    totalUpserted += batch.length
    if (totalUpserted % 1000 === 0 || totalUpserted === items.length) {
      console.info(`[product-sync] 📝 Upserted ${totalUpserted}/${items.length} items`)
    }
  }
  console.info(`[product-sync] ✅ ${items.length} items upserted in ${Date.now() - t1}ms`)

  // --- Enrich with prices (batch UPDATE via raw SQL) ---
  let pricesLoaded = 0
  if (storeConfig.netsuitePriceLevelId && parsedIds.length > 0) {
    console.info(`[product-sync] 💰 Fetching prices for ${parsedIds.length} items (price level: ${storeConfig.netsuitePriceLevelId})...`)
    try {
      const t2 = Date.now()
      const prices = await fetchPricesForItems(storeConfig.netsuitePriceLevelId, parsedIds)
      console.info(`[product-sync] 💰 Got ${prices.length} price records from NetSuite in ${Date.now() - t2}ms`)

      const priceRows: Array<{ id: number; price: number }> = []
      for (const p of prices) {
        const id = typeof p.netsuite_id === 'string' ? parseInt(p.netsuite_id as unknown as string, 10) : p.netsuite_id
        const price = typeof p.price === 'string' ? parseFloat(p.price as unknown as string) : p.price
        if (!isNaN(id) && !isNaN(price)) priceRows.push({ id, price })
      }

      const t3 = Date.now()
      for (let i = 0; i < priceRows.length; i += BATCH_SIZE) {
        const batch = priceRows.slice(i, i + BATCH_SIZE)
        const cases = batch.map((r) =>
          Prisma.sql`WHEN ${r.id} THEN ${r.price}::decimal(10,2)`
        )
        const ids = batch.map((r) => r.id)

        await prisma.$executeRaw`
          UPDATE "ProductSyncMapping"
          SET "netsuiteCurrentPrice" = CASE "netsuiteItemId" ${Prisma.join(cases, ' ')} END,
              "updatedAt" = NOW()
          WHERE "storeConfigId" = ${storeConfig.id}
            AND "netsuiteItemId" IN (${Prisma.join(ids)})
        `
        pricesLoaded += batch.length
      }
      console.info(`[product-sync] ✅ Prices updated for ${pricesLoaded} items in ${Date.now() - t3}ms`)
    } catch (err) {
      console.error('[product-sync] ❌ Failed to fetch NS prices during populate:', err)
    }
  } else {
    console.info('[product-sync] ⚠️ Skipping prices — no price level configured on store')
  }

  // --- Enrich with inventory ---
  let inventoryLoaded = 0
  if (parsedIds.length > 0) {
    const locationMappings = await prisma.productSyncLocationMapping.findMany({
      where: { storeConfigId: storeConfig.id, isActive: true },
    })
    console.info(`[product-sync] 📍 Found ${locationMappings.length} location mapping(s) for inventory`)

    try {
      const totalQtyMap = new Map<number, number>()

      if (locationMappings.length > 0) {
        const nsLocationIds = [...new Set(locationMappings.map((m) => m.netsuiteLocationId))]
        const t4 = Date.now()
        console.info(`[product-sync] 📦 Fetching inventory for ${parsedIds.length} items across ${nsLocationIds.length} location(s)...`)
        const rawInventory = await fetchInventoryByLocation(parsedIds, nsLocationIds)
        console.info(`[product-sync] 📦 Got ${rawInventory.length} inventory records in ${Date.now() - t4}ms`)

        const coercedInventory = rawInventory.map((inv) => ({
          ...inv,
          netsuite_id: typeof inv.netsuite_id === 'string' ? parseInt(inv.netsuite_id as unknown as string, 10) : inv.netsuite_id,
          location_id: typeof inv.location_id === 'string' ? parseInt(inv.location_id as unknown as string, 10) : inv.location_id,
          quantity_available: typeof inv.quantity_available === 'string'
            ? parseInt(inv.quantity_available as unknown as string, 10) : (inv.quantity_available || 0),
        }))

        const aggregated = aggregateInventory(
          coercedInventory,
          locationMappings.map((m) => ({
            netsuiteLocationId: m.netsuiteLocationId,
            shopifyLocationId: m.shopifyLocationId,
          }))
        )

        aggregated.forEach((itemMap) => {
          itemMap.forEach((qty, itemId) => {
            totalQtyMap.set(itemId, (totalQtyMap.get(itemId) || 0) + qty)
          })
        })
      } else {
        console.info(`[product-sync] 📦 No location mappings — fetching total inventory across all locations...`)
        const totals = await fetchTotalInventory(parsedIds)
        console.info(`[product-sync] 📦 Got ${totals.length} total inventory records`)
        for (const t of totals) {
          totalQtyMap.set(t.netsuite_id, Math.max(0, t.quantity_available))
        }
      }

      // Kit items don't appear in AggregateItemLocation — calculate from components
      if (kitItemIds.length > 0) {
        const kitsWithoutInv = kitItemIds.filter((id) => !totalQtyMap.has(id))
        if (kitsWithoutInv.length > 0) {
          console.info(`[product-sync] 🧩 Calculating kit inventory for ${kitsWithoutInv.length} kit item(s) from components...`)
          const nsLocationIds = locationMappings.length > 0
            ? [...new Set(locationMappings.map((m) => m.netsuiteLocationId))]
            : undefined
          const kitQtyMap = await fetchKitInventory(kitsWithoutInv, nsLocationIds)
          for (const [kitId, qty] of kitQtyMap) {
            totalQtyMap.set(kitId, Math.max(0, qty))
          }
          console.info(`[product-sync] 🧩 Kit inventory resolved for ${kitQtyMap.size} kit(s)`)
        }
      }

      // Batch update inventory quantities
      const qtyEntries = Array.from(totalQtyMap.entries())
      const t5 = Date.now()
      for (let i = 0; i < qtyEntries.length; i += BATCH_SIZE) {
        const batch = qtyEntries.slice(i, i + BATCH_SIZE)
        const cases = batch.map(([nsId, qty]) =>
          Prisma.sql`WHEN ${nsId} THEN ${qty}`
        )
        const ids = batch.map(([nsId]) => nsId)

        await prisma.$executeRaw`
          UPDATE "ProductSyncMapping"
          SET "netsuiteCurrentQty" = CASE "netsuiteItemId" ${Prisma.join(cases, ' ')} END,
              "updatedAt" = NOW()
          WHERE "storeConfigId" = ${storeConfig.id}
            AND "netsuiteItemId" IN (${Prisma.join(ids)})
        `
        inventoryLoaded += batch.length
      }
      console.info(`[product-sync] ✅ Inventory updated for ${inventoryLoaded} items in ${Date.now() - t5}ms`)
    } catch (err) {
      console.error('[product-sync] ❌ Failed to fetch NS inventory during populate:', err)
    }
  }

  const elapsed = Date.now() - t0
  console.info(`[product-sync] 🏁 Pull complete in ${elapsed}ms: ${items.length} items, ${pricesLoaded} prices, ${inventoryLoaded} inventory`)
  return { created: 0, updated: items.length, pricesLoaded, inventoryLoaded }
}

/**
 * For each unmatched ProductSyncMapping in a store, search Shopify by SKU and update the mapping.
 */
export async function matchBySkuForStore(
  storeConfigId: string
): Promise<MatchResult> {
  const store = await getShopifyStore(storeConfigId)
  const unmatchedMappings = await prisma.productSyncMapping.findMany({
    where: {
      storeConfigId,
      matchStatus: 'unmatched',
    },
  })

  const result: MatchResult = { matched: 0, unmatched: 0, multipleMatches: 0, errors: 0 }

  for (const mapping of unmatchedMappings) {
    try {
      const variants = await findVariantBySku(store, mapping.netsuiteSku)

      if (variants.length === 1) {
        const v = variants[0]
        await prisma.productSyncMapping.update({
          where: { id: mapping.id },
          data: {
            shopifyProductId: v.productId,
            shopifyVariantId: v.variantId,
            shopifyInventoryItemId: v.inventoryItemId,
            shopifyProductTitle: v.productTitle,
            shopifyProductHandle: v.productHandle,
            matchStatus: 'matched',
          },
        })
        result.matched++
      } else if (variants.length > 1) {
        await prisma.productSyncMapping.update({
          where: { id: mapping.id },
          data: { matchStatus: 'multiple_matches' },
        })
        result.multipleMatches++
      } else {
        result.unmatched++
      }
    } catch (err: any) {
      await prisma.productSyncMapping.update({
        where: { id: mapping.id },
        data: {
          matchStatus: 'error',
          lastSyncError: `Match error: ${err.message}`,
        },
      })
      result.errors++
    }
  }

  return result
}

/**
 * Run matching for all stores — typically called once during initial setup.
 */
export async function matchAllStores(): Promise<Record<string, MatchResult>> {
  const stores = await prisma.productSyncStoreConfig.findMany({
    where: { isActive: true },
  })

  const results: Record<string, MatchResult> = {}
  for (const store of stores) {
    results[store.id] = await matchBySkuForStore(store.id)
  }

  return results
}
