import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthHeader } from '@/lib/netsuite'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const SUITEQL_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

async function runSuiteQL(query: string) {
  const authorization = generateOAuthHeader('POST', SUITEQL_URL)
  const res = await fetch(SUITEQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'transient',
      Authorization: authorization,
      Accept: 'application/json',
    },
    body: JSON.stringify({ q: query }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SuiteQL error ${res.status}: ${text.slice(0, 500)}`)
  }
  return JSON.parse(text)
}

/**
 * GET /api/inventory-sync/test?hours=1
 *
 * Test endpoint to prove SuiteQL can find items with recent inventory transactions.
 * Returns which items had inventory-affecting transactions in the last N hours.
 */
export async function GET(request: NextRequest) {
  try {
    const hours = parseInt(request.nextUrl.searchParams.get('hours') || '24', 10)

    // Step 1: Find items with inventory-affecting transactions in the last N hours
    const changedItemsQuery = `
      SELECT DISTINCT TransactionLine.item AS itemid,
             BUILTIN.DF(TransactionLine.item) AS itemname,
             Transaction.type AS trantype,
             BUILTIN.DF(Transaction.type) AS trantypename,
             Transaction.trandate,
             Transaction.lastmodifieddate
      FROM TransactionLine
      JOIN Transaction ON Transaction.id = TransactionLine.transaction
      WHERE Transaction.lastmodifieddate >= SYSDATE - (${hours}/24)
      AND Transaction.type IN ('CashSale','CashRfnd','InvAdjst','InvTrnfr','ItemShip','ItemRcpt')
      ORDER BY Transaction.lastmodifieddate DESC
    `

    console.log(`🔍 Testing SuiteQL: items with inventory transactions in last ${hours} hours`)
    const changedResult = await runSuiteQL(changedItemsQuery)
    const changedItems = changedResult.items || []

    // Get unique item IDs
    const uniqueItemIds = [...new Set(changedItems.map((r: any) => r.itemid))]

    // Step 2: If we found changed items, get their current qty/price
    let currentData: any[] = []
    if (uniqueItemIds.length > 0 && uniqueItemIds.length <= 200) {
      const idList = uniqueItemIds.join(',')
      const qtyQuery = `
        SELECT Item.id, Item.itemid AS sku, Item.displayname,
               Item.quantityavailable AS qty_available,
               Item.quantityonhand AS qty_on_hand
        FROM Item
        WHERE Item.id IN (${idList})
      `

      try {
        const qtyResult = await runSuiteQL(qtyQuery)
        currentData = qtyResult.items || []
      } catch (e) {
        currentData = [{ error: `Qty query failed: ${e instanceof Error ? e.message : String(e)}` }]
      }
    }

    // Step 3: Count ALL active items for comparison
    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM Item
      WHERE Item.isinactive = 'F'
    `
    const totalResult = await runSuiteQL(totalQuery)
    const totalItems = totalResult.items?.[0]?.total || '?'

    return NextResponse.json({
      success: true,
      test: `Items with inventory transactions in last ${hours} hours`,
      summary: {
        totalActiveItems: totalItems,
        itemsWithRecentTransactions: uniqueItemIds.length,
        transactionLines: changedItems.length,
        message: `Instead of syncing ${totalItems} items, we'd only sync ${uniqueItemIds.length}`,
      },
      changedItems: changedItems.slice(0, 50),
      currentInventory: currentData.slice(0, 50),
    })
  } catch (error) {
    console.error('SuiteQL test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
