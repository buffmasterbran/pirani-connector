import { generateOAuthHeader, type NetSuiteSuiteQLResponse } from '@/lib/netsuite'
import type {
  NetSuiteItem,
  NetSuitePrice,
  NetSuiteInventory,
  NetSuiteLocation,
  NetSuitePriceLevel,
} from './types'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const SUITEQL_BASE = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
const PAGE_SIZE = 1000

async function executeSuiteQL<T = any>(
  query: string,
  limit: number = PAGE_SIZE,
  offset: number = 0
): Promise<NetSuiteSuiteQLResponse<T>> {
  const url = `${SUITEQL_BASE}?limit=${limit}&offset=${offset}`
  const authorization = generateOAuthHeader('POST', url)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'transient',
      Authorization: authorization,
      Accept: '*/*',
    },
    body: JSON.stringify({ q: query }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`NetSuite SuiteQL error ${response.status}: ${errorText}`)
  }

  return response.json()
}

export async function executeSuiteQLPaginated<T = any>(query: string): Promise<T[]> {
  let allResults: T[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const response = await executeSuiteQL<T>(query, PAGE_SIZE, offset)
    allResults = allResults.concat(response.items || [])
    hasMore = response.hasMore
    offset += PAGE_SIZE
  }

  return allResults
}

/**
 * Fetch all items that have a sync flag set for a given store.
 * The flagFieldId is the NetSuite custom field internal ID (e.g., "custitem_fa_shopify_flag01").
 *
 * Farapp flag field conventions (honoring these values):
 *   1 = Add/Update Item (sync to Shopify)
 *   2 = Remove Item (future: unpublish/remove from Shopify)
 *   3 = Ignore Item (skip entirely)
 *   4 = Post Children as Stand-Alone (future: matrix items)
 *   5-7 = eBay-specific (not applicable)
 *
 * Currently only flag value = 1 triggers sync. Flag values 2 (Remove) and
 * 3 (Ignore) are acknowledged but not yet implemented -- they will be skipped
 * by the WHERE clause below. When Remove is implemented, items with flag=2
 * should be unpublished or have inventory zeroed out in Shopify.
 */
export async function fetchSyncableItems(
  flagFieldId: string,
  includeNonInventory: boolean = false
): Promise<NetSuiteItem[]> {
  const itemTypes = includeNonInventory
    ? "'InvtPart', 'Kit', 'NonInvtPart'"
    : "'InvtPart', 'Kit'"

  const query = `
    SELECT
      Item.id AS netsuite_id,
      Item.itemid AS sku,
      Item.displayname AS name,
      Item.itemtype AS item_type,
      BUILTIN.DF(Item.custitem_item_color) AS color,
      BUILTIN.DF(Item.custitem_item_size) AS size,
      Item.lastmodifieddate,
      Item.${flagFieldId} AS flag_value
    FROM Item
    WHERE Item.itemtype IN (${itemTypes})
      AND Item.isinactive = 'F'
      AND Item.${flagFieldId} = '1'
    ORDER BY Item.itemid
  `

  return executeSuiteQLPaginated<NetSuiteItem>(query)
}

/**
 * Fetch prices for a set of items at a specific price level.
 */
export async function fetchPricesForItems(
  priceLevelId: number,
  itemIds: number[]
): Promise<NetSuitePrice[]> {
  if (itemIds.length === 0) return []

  const results: NetSuitePrice[] = []
  // SuiteQL has limits on IN clause size, batch in groups of 500
  for (let i = 0; i < itemIds.length; i += 500) {
    const batch = itemIds.slice(i, i + 500)
    const idList = batch.join(',')
    const query = `
      SELECT
        Pricing.item AS netsuite_id,
        Pricing.pricelevel AS price_level,
        Pricing.unitprice AS price
      FROM pricing AS Pricing
      WHERE Pricing.pricelevel = ${priceLevelId}
        AND Pricing.quantity = 1
        AND Pricing.item IN (${idList})
    `
    const batchResults = await executeSuiteQLPaginated<NetSuitePrice>(query)
    results.push(...batchResults)
  }

  return results
}

/**
 * Fetch inventory quantities for items at specific locations.
 */
export async function fetchInventoryByLocation(
  itemIds: number[],
  locationIds: number[]
): Promise<NetSuiteInventory[]> {
  if (itemIds.length === 0 || locationIds.length === 0) return []

  const results: NetSuiteInventory[] = []
  const locationList = locationIds.join(',')

  for (let i = 0; i < itemIds.length; i += 500) {
    const batch = itemIds.slice(i, i + 500)
    const idList = batch.join(',')
    const query = `
      SELECT
        AIL.Item AS netsuite_id,
        AIL.Location AS location_id,
        BUILTIN.DF(AIL.Location) AS location_name,
        AIL.QuantityAvailable AS quantity_available,
        AIL.QuantityOnHand AS quantity_on_hand,
        AIL.QuantityCommitted AS quantity_committed,
        AIL.LastQuantityAvailableChange AS last_qty_change
      FROM AggregateItemLocation AS AIL
      WHERE AIL.Item IN (${idList})
        AND AIL.Location IN (${locationList})
      ORDER BY AIL.Item, AIL.Location
    `
    const batchResults = await executeSuiteQLPaginated<NetSuiteInventory>(query)
    results.push(...batchResults)
  }

  return results
}

/**
 * Fetch total inventory for items across ALL NetSuite locations (no location filter).
 * Used as a fallback when no location mappings are configured.
 */
export async function fetchTotalInventory(
  itemIds: number[]
): Promise<Array<{ netsuite_id: number; quantity_available: number }>> {
  if (itemIds.length === 0) return []

  const results: Array<{ netsuite_id: string; total_available: string }> = []

  for (let i = 0; i < itemIds.length; i += 500) {
    const batch = itemIds.slice(i, i + 500)
    const idList = batch.join(',')
    const query = `
      SELECT
        AIL.Item AS netsuite_id,
        SUM(AIL.QuantityAvailable) AS total_available
      FROM AggregateItemLocation AS AIL
      WHERE AIL.Item IN (${idList})
      GROUP BY AIL.Item
    `
    const batchResults = await executeSuiteQLPaginated<{ netsuite_id: string; total_available: string }>(query)
    results.push(...batchResults)
  }

  return results.map((r) => ({
    netsuite_id: typeof r.netsuite_id === 'string' ? parseInt(r.netsuite_id, 10) : Number(r.netsuite_id),
    quantity_available: typeof r.total_available === 'string' ? parseInt(r.total_available, 10) : Number(r.total_available),
  }))
}

/**
 * Fetch all active NetSuite locations (for the config UI dropdowns).
 */
export async function fetchLocations(): Promise<NetSuiteLocation[]> {
  const query = `
    SELECT
      Location.id,
      Location.name
    FROM Location
    WHERE Location.isinactive = 'F'
    ORDER BY Location.name
  `
  return executeSuiteQLPaginated<NetSuiteLocation>(query)
}

/**
 * Fetch all active price levels (for the config UI dropdowns).
 */
export async function fetchPriceLevels(): Promise<NetSuitePriceLevel[]> {
  const query = `
    SELECT
      PriceLevel.id,
      PriceLevel.name
    FROM PriceLevel
    WHERE PriceLevel.isinactive = 'F'
    ORDER BY PriceLevel.name
  `
  return executeSuiteQLPaginated<NetSuitePriceLevel>(query)
}

/**
 * Kit/Package items don't hold inventory themselves — availability is the
 * minimum number of complete kits that can be assembled from component stock.
 *
 * Uses the KitItemMember join table to resolve components, then checks their
 * AggregateItemLocation inventory at specific locations (or all locations
 * if none specified).
 *
 * Returns a Map<kitItemId, availableQty>.
 */
export async function fetchKitInventory(
  kitItemIds: number[],
  locationIds?: number[]
): Promise<Map<number, number>> {
  if (kitItemIds.length === 0) return new Map()

  const result = new Map<number, number>()
  const locationFilter = locationIds && locationIds.length > 0
    ? `AND AIL.Location IN (${locationIds.join(',')})`
    : ''

  for (let i = 0; i < kitItemIds.length; i += 200) {
    const batch = kitItemIds.slice(i, i + 200)
    const idList = batch.join(',')

    const query = `
      SELECT
        KIM.ParentItem AS kit_id,
        KIM.Item AS component_id,
        KIM.Quantity AS qty_required,
        COALESCE(SUM(AIL.QuantityAvailable), 0) AS component_available
      FROM KitItemMember AS KIM
        LEFT JOIN AggregateItemLocation AS AIL
          ON AIL.Item = KIM.Item ${locationFilter}
      WHERE KIM.ParentItem IN (${idList})
      GROUP BY KIM.ParentItem, KIM.Item, KIM.Quantity
    `

    const rows = await executeSuiteQLPaginated<{
      kit_id: string
      component_id: string
      qty_required: string
      component_available: string
    }>(query)

    const kitComponents = new Map<number, Array<{ required: number; available: number }>>()

    for (const row of rows) {
      const kitId = parseInt(row.kit_id, 10)
      const required = parseFloat(row.qty_required) || 1
      const available = parseFloat(row.component_available) || 0

      if (!kitComponents.has(kitId)) kitComponents.set(kitId, [])
      kitComponents.get(kitId)!.push({ required, available })
    }

    for (const [kitId, components] of kitComponents) {
      if (components.length === 0) {
        result.set(kitId, 0)
        continue
      }
      const kitQty = Math.min(
        ...components.map((c) => Math.floor(c.available / c.required))
      )
      result.set(kitId, Math.max(0, kitQty))
    }

    for (const id of batch) {
      if (!result.has(id)) result.set(id, 0)
    }
  }

  return result
}

/**
 * Find items that have changed since a given timestamp, used for incremental sync.
 */
export async function fetchRecentlyChangedItemIds(
  since: Date,
  locationIds: number[],
  flagFieldId: string
): Promise<number[]> {
  if (locationIds.length === 0) return []

  const sinceStr = since.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)
  const locationList = locationIds.join(',')

  const query = `
    SELECT DISTINCT AIL.Item AS netsuite_id
    FROM AggregateItemLocation AS AIL
    WHERE AIL.LastQuantityAvailableChange > TO_DATE('${sinceStr}', 'YYYY-MM-DD HH24:MI:SS')
      AND AIL.Location IN (${locationList})
      AND AIL.Item IN (
        SELECT id FROM Item
        WHERE ${flagFieldId} = '1'
          AND isinactive = 'F'
      )
  `

  const rows = await executeSuiteQLPaginated<{ netsuite_id: number }>(query)
  return rows.map((r) => r.netsuite_id)
}

/**
 * Aggregate inventory across multiple NetSuite locations for a Shopify location.
 * When multiple NS locations map to one Shopify location, sum their QuantityAvailable.
 */
export function aggregateInventory(
  nsInventory: NetSuiteInventory[],
  locationMappings: Array<{
    netsuiteLocationId: number
    shopifyLocationId: string
  }>
): Map<string, Map<number, number>> {
  // Map: shopifyLocationId -> Map<netsuiteItemId, aggregatedQty>
  const result = new Map<string, Map<number, number>>()

  for (const inv of nsInventory) {
    const mappings = locationMappings.filter(
      (m) => m.netsuiteLocationId === inv.location_id
    )
    for (const mapping of mappings) {
      if (!result.has(mapping.shopifyLocationId)) {
        result.set(mapping.shopifyLocationId, new Map())
      }
      const itemMap = result.get(mapping.shopifyLocationId)!
      const current = itemMap.get(inv.netsuite_id) || 0
      itemMap.set(inv.netsuite_id, current + (inv.quantity_available || 0))
    }
  }

  // Floor at 0 — never push negative inventory
  result.forEach((itemMap) => {
    itemMap.forEach((qty, itemId) => {
      itemMap.set(itemId, Math.max(0, qty))
    })
  })

  return result
}
