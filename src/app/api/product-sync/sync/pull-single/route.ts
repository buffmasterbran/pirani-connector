import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  executeSuiteQLPaginated,
  fetchPricesForItems,
  fetchInventoryByLocation,
  fetchTotalInventory,
  fetchKitInventory,
} from '@/lib/product-sync/netsuite'

/**
 * Pull a SINGLE item from NetSuite with verbose diagnostic logging.
 * Returns the full diagnostic log so the UI can display it.
 */
export async function POST(request: NextRequest) {
  const log: string[] = []
  const info = (msg: string) => { console.info(msg); log.push(msg) }
  const warn = (msg: string) => { console.warn(msg); log.push(`⚠️ ${msg}`) }
  const err = (msg: string) => { console.error(msg); log.push(`❌ ${msg}`) }

  try {
    const { storeConfigId, netsuiteItemId, netsuiteSku } = await request.json()

    if (!storeConfigId || (!netsuiteItemId && !netsuiteSku)) {
      return NextResponse.json({ error: 'Missing storeConfigId and netsuiteItemId or netsuiteSku' }, { status: 400 })
    }

    const storeConfig = await prisma.productSyncStoreConfig.findUniqueOrThrow({
      where: { id: storeConfigId },
    })

    info(`🔍 Single-item pull for store "${storeConfig.storeName}"`)
    info(`   Flag field: ${storeConfig.netsuiteFlagFieldId}`)
    info(`   Price level: ${storeConfig.netsuitePriceLevelId}`)
    info(`   Item ID: ${netsuiteItemId || 'N/A'}, SKU: ${netsuiteSku || 'N/A'}`)

    // 1. Fetch the item from NetSuite
    const idFilter = netsuiteItemId
      ? `Item.id = ${netsuiteItemId}`
      : `Item.itemid = '${netsuiteSku.replace(/'/g, "''")}'`

    const itemQuery = `
      SELECT
        Item.id AS netsuite_id,
        Item.itemid AS sku,
        Item.displayname AS name,
        Item.itemtype AS item_type,
        BUILTIN.DF(Item.custitem_item_color) AS color,
        BUILTIN.DF(Item.custitem_item_size) AS size,
        Item.isinactive,
        Item.lastmodifieddate,
        Item.${storeConfig.netsuiteFlagFieldId} AS flag_value
      FROM Item
      WHERE ${idFilter}
    `
    info(`📋 SuiteQL query:\n${itemQuery.trim()}`)

    const items = await executeSuiteQLPaginated<any>(itemQuery)
    info(`📦 NetSuite returned ${items.length} row(s)`)

    if (items.length === 0) {
      warn('No item found in NetSuite with that ID/SKU')
      return NextResponse.json({ log, item: null })
    }

    const item = items[0]
    const itemId = typeof item.netsuite_id === 'string' ? parseInt(item.netsuite_id, 10) : item.netsuite_id
    info(`✅ Found item: ${JSON.stringify(item, null, 2)}`)

    if (item.isinactive === 'T') {
      warn('This item is INACTIVE in NetSuite')
    }
    if (!item.flag_value || item.flag_value !== '1') {
      warn(`Flag value is "${item.flag_value}" (expected "1" for sync). Item won't appear in bulk pull.`)
    }

    // 2. Upsert into DB
    info(`💾 Upserting into ProductSyncMapping...`)
    await prisma.$executeRaw`
      INSERT INTO "ProductSyncMapping"
        ("id", "storeConfigId", "netsuiteItemId", "netsuiteSku",
         "netsuiteName", "netsuiteColor", "netsuiteSize", "netsuiteItemType",
         "netsuiteFlagValue", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(), ${storeConfigId}, ${itemId}, ${item.sku},
        ${item.name}, ${item.color}, ${item.size}, ${item.item_type},
        ${item.flag_value}, NOW(), NOW()
      )
      ON CONFLICT ("storeConfigId", "netsuiteSku") DO UPDATE SET
        "netsuiteItemId" = EXCLUDED."netsuiteItemId",
        "netsuiteName" = EXCLUDED."netsuiteName",
        "netsuiteColor" = EXCLUDED."netsuiteColor",
        "netsuiteSize" = EXCLUDED."netsuiteSize",
        "netsuiteItemType" = EXCLUDED."netsuiteItemType",
        "netsuiteFlagValue" = EXCLUDED."netsuiteFlagValue",
        "updatedAt" = NOW()
    `
    info(`✅ DB upsert done`)

    // 3. Fetch price
    let price: number | null = null
    if (storeConfig.netsuitePriceLevelId) {
      info(`💰 Fetching price (price level ${storeConfig.netsuitePriceLevelId})...`)
      try {
        const prices = await fetchPricesForItems(storeConfig.netsuitePriceLevelId, [itemId])
        info(`💰 Price query returned ${prices.length} row(s): ${JSON.stringify(prices)}`)
        if (prices.length > 0) {
          price = typeof prices[0].price === 'string' ? parseFloat(prices[0].price as any) : prices[0].price
          info(`💰 Price: $${price}`)
          await prisma.productSyncMapping.updateMany({
            where: { storeConfigId, netsuiteItemId: itemId },
            data: { netsuiteCurrentPrice: price },
          })
        } else {
          warn(`No price found for item ${itemId} at price level ${storeConfig.netsuitePriceLevelId}`)
        }
      } catch (e: any) {
        err(`Price fetch failed: ${e.message}`)
      }
    }

    // 4. Fetch inventory
    let quantity: number | null = null
    const locationMappings = await prisma.productSyncLocationMapping.findMany({
      where: { storeConfigId, isActive: true },
    })
    info(`📍 Location mappings: ${locationMappings.length}`)
    for (const lm of locationMappings) {
      info(`   NS Location ${lm.netsuiteLocationId} (${lm.netsuiteLocationName}) → Shopify ${lm.shopifyLocationId} (${lm.shopifyLocationName})`)
    }

    const isKit = item.item_type === 'Kit'
    info(`📦 Item type: "${item.item_type}" — isKit: ${isKit}`)

    // Try standard inventory first
    if (locationMappings.length > 0) {
      const nsLocationIds = [...new Set(locationMappings.map((m) => m.netsuiteLocationId))]
      info(`📦 Fetching AggregateItemLocation for item ${itemId} at locations [${nsLocationIds.join(', ')}]...`)
      const inv = await fetchInventoryByLocation([itemId], nsLocationIds)
      info(`📦 AggregateItemLocation returned ${inv.length} row(s): ${JSON.stringify(inv)}`)

      if (inv.length > 0) {
        quantity = inv.reduce((sum, r) => {
          const qa = typeof r.quantity_available === 'string' ? parseInt(r.quantity_available as any, 10) : (r.quantity_available || 0)
          return sum + qa
        }, 0)
        info(`📦 Total quantity from AggregateItemLocation: ${quantity}`)
      } else {
        info(`📦 No rows in AggregateItemLocation for this item at these locations`)
      }
    } else {
      info(`📦 No location mappings — fetching total inventory across all locations...`)
      const totals = await fetchTotalInventory([itemId])
      info(`📦 Total inventory query returned: ${JSON.stringify(totals)}`)
      if (totals.length > 0) {
        quantity = Math.max(0, totals[0].quantity_available)
      }
    }

    // If kit and no inventory found, calculate from components
    if (isKit && (quantity === null || quantity === 0)) {
      info(`🧩 Kit detected with no AggregateItemLocation inventory — resolving from components...`)

      // First show the raw KitItemMember data
      const componentQuery = `
        SELECT
          KIM.ParentItem AS kit_id,
          KIM.Item AS component_id,
          BUILTIN.DF(KIM.Item) AS component_name,
          KIM.Quantity AS qty_required,
          KIM.LineNumber
        FROM KitItemMember AS KIM
        WHERE KIM.ParentItem = ${itemId}
        ORDER BY KIM.LineNumber
      `
      info(`🧩 KitItemMember query:\n${componentQuery.trim()}`)
      const components = await executeSuiteQLPaginated<any>(componentQuery)
      info(`🧩 Components found: ${components.length}`)
      for (const c of components) {
        info(`   Component: ${c.component_name} (ID: ${c.component_id}), qty required: ${c.qty_required}`)
      }

      if (components.length === 0) {
        warn(`🧩 No components found in KitItemMember for parent item ${itemId}. Kit inventory = 0.`)
        quantity = 0
      } else {
        // Now fetch inventory for each component
        const componentIds = components.map((c: any) =>
          typeof c.component_id === 'string' ? parseInt(c.component_id, 10) : c.component_id
        )

        const nsLocationIds = locationMappings.length > 0
          ? [...new Set(locationMappings.map((m) => m.netsuiteLocationId))]
          : undefined

        info(`🧩 Fetching inventory for ${componentIds.length} component(s)${nsLocationIds ? ` at locations [${nsLocationIds.join(', ')}]` : ' (all locations)'}...`)

        const kitQtyMap = await fetchKitInventory([itemId], nsLocationIds)
        const kitQty = kitQtyMap.get(itemId) ?? 0
        info(`🧩 fetchKitInventory result: ${kitQty}`)

        // Also show per-component detail
        if (nsLocationIds) {
          const compInv = await fetchInventoryByLocation(componentIds, nsLocationIds)
          info(`🧩 Component inventory detail (AggregateItemLocation):`)
          for (const ci of compInv) {
            info(`   Item ${ci.netsuite_id} @ location ${ci.location_id} (${ci.location_name}): available=${ci.quantity_available}, on_hand=${ci.quantity_on_hand}, committed=${ci.quantity_committed}`)
          }
        } else {
          const compTotals = await fetchTotalInventory(componentIds)
          info(`🧩 Component total inventory:`)
          for (const ct of compTotals) {
            info(`   Item ${ct.netsuite_id}: available=${ct.quantity_available}`)
          }
        }

        for (const comp of components) {
          const cId = typeof comp.component_id === 'string' ? parseInt(comp.component_id, 10) : comp.component_id
          const qtyReq = parseFloat(comp.qty_required) || 1
          info(`🧩 Component ${comp.component_name} (${cId}): requires ${qtyReq} per kit`)
        }

        quantity = Math.max(0, kitQty)
        info(`🧩 Final kit quantity: ${quantity}`)
      }
    }

    // Save inventory to DB
    if (quantity !== null) {
      quantity = Math.max(0, quantity)
      await prisma.productSyncMapping.updateMany({
        where: { storeConfigId, netsuiteItemId: itemId },
        data: { netsuiteCurrentQty: quantity },
      })
      info(`✅ Saved quantity ${quantity} to DB`)
    } else {
      warn(`No inventory data found for item ${itemId}`)
    }

    // Fetch the final DB record
    const dbRecord = await prisma.productSyncMapping.findFirst({
      where: { storeConfigId, netsuiteItemId: itemId },
    })

    info(`🏁 Pull single complete`)

    return NextResponse.json({
      log,
      item: dbRecord,
      netsuiteRaw: item,
      price,
      quantity,
    })
  } catch (e: any) {
    err(`Fatal error: ${e.message}`)
    return NextResponse.json({ log, error: e.message }, { status: 500 })
  }
}
