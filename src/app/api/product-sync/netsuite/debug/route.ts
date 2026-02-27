import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthHeader, type NetSuiteSuiteQLResponse } from '@/lib/netsuite'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const SUITEQL_BASE = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

async function runQuery(query: string) {
  const url = `${SUITEQL_BASE}?limit=5&offset=0`
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
    const text = await response.text()
    return { error: `${response.status}: ${text}` }
  }

  return response.json()
}

export async function GET(request: NextRequest) {
  const flagField = request.nextUrl.searchParams.get('flagField') || 'custitem_fa_shopify_flag01'
  const sku = request.nextUrl.searchParams.get('sku')

  try {
    const skuFilter = sku ? `AND Item.itemid = '${sku.replace(/'/g, "''")}'` : ''

    const itemQuery = `
      SELECT
        Item.id AS netsuite_id,
        Item.itemid AS sku,
        Item.displayname AS name,
        Item.itemtype AS item_type,
        BUILTIN.DF(Item.custitem_item_color) AS color,
        BUILTIN.DF(Item.custitem_item_size) AS size,
        Item.lastmodifieddate,
        Item.${flagField} AS flag_value
      FROM Item
      WHERE Item.itemtype IN ('InvtPart', 'Kit', 'NonInvtPart')
        AND Item.isinactive = 'F'
        AND Item.${flagField} = '1'
        ${skuFilter}
      ORDER BY Item.itemid
    `

    const items = await runQuery(itemQuery)

    const firstItemId = items?.items?.[0]?.netsuite_id
    let prices = null
    let inventory = null

    if (firstItemId) {
      const priceQuery = `
        SELECT
          Pricing.item AS netsuite_id,
          Pricing.pricelevel AS price_level,
          BUILTIN.DF(Pricing.pricelevel) AS price_level_name,
          Pricing.unitprice AS price,
          Pricing.quantity AS qty_break
        FROM pricing AS Pricing
        WHERE Pricing.item = ${firstItemId}
        ORDER BY Pricing.pricelevel, Pricing.quantity
      `
      prices = await runQuery(priceQuery)

      const invQuery = `
        SELECT
          AIL.Item AS netsuite_id,
          AIL.Location AS location_id,
          BUILTIN.DF(AIL.Location) AS location_name,
          AIL.QuantityAvailable AS quantity_available,
          AIL.QuantityOnHand AS quantity_on_hand,
          AIL.QuantityCommitted AS quantity_committed
        FROM AggregateItemLocation AS AIL
        WHERE AIL.Item = ${firstItemId}
        ORDER BY AIL.Location
      `
      inventory = await runQuery(invQuery)
    }

    return NextResponse.json({
      queries: {
        items: { query: 'fetchSyncableItems (first 5)', result: items },
        prices: firstItemId ? { query: `prices for item ${firstItemId}`, result: prices } : 'no items found',
        inventory: firstItemId ? { query: `inventory for item ${firstItemId}`, result: inventory } : 'no items found',
      },
    }, { status: 200 })
  } catch (err: any) {
    console.error('[product-sync] Debug query error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
