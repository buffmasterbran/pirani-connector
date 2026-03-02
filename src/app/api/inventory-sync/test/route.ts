import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthHeader } from '@/lib/netsuite'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const SUITEQL_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

interface SuiteQLStep {
  name: string
  description: string
  query: string
  elapsed_ms: number
  rowCount: number
  data: any[]
  error?: string
}

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

async function runStep(name: string, description: string, query: string): Promise<SuiteQLStep> {
  const trimmedQuery = query.replace(/\s+/g, ' ').trim()
  const start = Date.now()
  try {
    const result = await runSuiteQL(query)
    const data = result.items || []
    return {
      name,
      description,
      query: trimmedQuery,
      elapsed_ms: Date.now() - start,
      rowCount: data.length,
      data,
    }
  } catch (e) {
    return {
      name,
      description,
      query: trimmedQuery,
      elapsed_ms: Date.now() - start,
      rowCount: 0,
      data: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * GET /api/inventory-sync/test?hours=24
 *
 * Full SuiteQL delta inventory sync with per-step diagnostics.
 * Returns every SuiteQL call, its query, timing, and response data.
 */
export async function GET(request: NextRequest) {
  const totalStart = Date.now()
  const steps: SuiteQLStep[] = []

  try {
    const hours = parseFloat(request.nextUrl.searchParams.get('hours') || '24')
    const INVENTORY_TYPES = "'InvtPart','Kit'"

    // ── Step 1: Delta detect ──
    const deltaQuery = `
      SELECT DISTINCT TransactionLine.item AS itemid,
             BUILTIN.DF(TransactionLine.item) AS itemname,
             Item.itemtype,
             Transaction.tranid,
             Transaction.type AS trantype,
             BUILTIN.DF(Transaction.type) AS trantypename,
             Transaction.trandate,
             TO_CHAR(Transaction.lastmodifieddate, 'YYYY-MM-DD HH24:MI:SS') AS lastmodified
      FROM TransactionLine
      JOIN Transaction ON Transaction.id = TransactionLine.transaction
      JOIN Item ON Item.id = TransactionLine.item
      WHERE Transaction.lastmodifieddate >= SYSDATE - (${hours}/24)
      AND Transaction.type IN ('SalesOrd','CashSale','CashRfnd','InvAdjst','InvTrnfr','ItemShip','ItemRcpt')
      AND Item.itemtype IN (${INVENTORY_TYPES})
      ORDER BY lastmodified DESC
    `
    const step1 = await runStep(
      'Delta Detect',
      `Items with inventory-affecting transactions in last ${hours}h`,
      deltaQuery
    )
    steps.push(step1)

    // Split into InvtPart vs Kit
    const invtPartIds = [...new Set(
      step1.data.filter((r: any) => r.itemtype === 'InvtPart').map((r: any) => r.itemid)
    )]
    const kitIds = [...new Set(
      step1.data.filter((r: any) => r.itemtype === 'Kit').map((r: any) => r.itemid)
    )]
    const allIds = [...new Set(step1.data.map((r: any) => r.itemid))]

    // ── Step 2: InvtPart qty + price ──
    if (invtPartIds.length > 0) {
      const invtQuery = `
        SELECT Item.id, Item.itemid AS sku, Item.itemtype, Item.displayname,
               Item.totalquantityonhand AS qty_on_hand,
               Pricing.unitprice AS baseprice
        FROM Item
        LEFT JOIN Pricing ON Pricing.item = Item.id
          AND Pricing.pricelevel = 1 AND Pricing.quantity = 1
        WHERE Item.id IN (${invtPartIds.join(',')})
        AND Item.itemtype = 'InvtPart'
      `
      steps.push(await runStep(
        'InvtPart Inventory',
        `Qty on hand + base price for ${invtPartIds.length} inventory parts`,
        invtQuery
      ))
    }

    // ── Step 3: Kit components + stock ──
    if (kitIds.length > 0) {
      const kitComponentQuery = `
        SELECT
          KIM.ParentItem AS kit_id,
          BUILTIN.DF(KIM.ParentItem) AS kit_name,
          KIM.Item AS component_id,
          BUILTIN.DF(KIM.Item) AS component_name,
          KIM.Quantity AS qty_required,
          COALESCE(SUM(AIL.QuantityAvailable), 0) AS component_available
        FROM KitItemMember AS KIM
          LEFT JOIN AggregateItemLocation AS AIL
            ON AIL.Item = KIM.Item
        WHERE KIM.ParentItem IN (${kitIds.join(',')})
        GROUP BY KIM.ParentItem, BUILTIN.DF(KIM.ParentItem),
                 KIM.Item, BUILTIN.DF(KIM.Item), KIM.Quantity
      `
      const step3 = await runStep(
        'Kit Components',
        `Component stock for ${kitIds.length} kits via KitItemMember + AggregateItemLocation`,
        kitComponentQuery
      )
      steps.push(step3)

      // Calculate kit available qty from components
      const kitComponents: Record<string, Array<{ component: string; required: number; available: number }>> = {}
      for (const row of step3.data) {
        if (!kitComponents[row.kit_id]) kitComponents[row.kit_id] = []
        kitComponents[row.kit_id].push({
          component: row.component_name || row.component_id,
          required: parseFloat(row.qty_required) || 1,
          available: parseFloat(row.component_available) || 0,
        })
      }

      const kitCalcData = Object.entries(kitComponents).map(([kitId, comps]) => {
        const kitQty = Math.max(0, Math.min(
          ...comps.map((c) => Math.floor(c.available / c.required))
        ))
        const kitName = step3.data.find((r: any) => r.kit_id === kitId)?.kit_name || kitId
        return {
          kit_id: kitId,
          kit_name: kitName,
          calculated_qty: kitQty,
          components: comps,
        }
      })

      steps.push({
        name: 'Kit Qty Calculation',
        description: `min(component_available / qty_required) for ${kitIds.length} kits`,
        query: '-- JavaScript: Math.min(...components.map(c => Math.floor(c.available / c.required)))',
        elapsed_ms: 0,
        rowCount: kitCalcData.length,
        data: kitCalcData,
      })

      // ── Step 4: Kit prices ──
      const kitPriceQuery = `
        SELECT Item.id, Item.itemid AS sku, Item.displayname,
               Pricing.unitprice AS baseprice
        FROM Item
        LEFT JOIN Pricing ON Pricing.item = Item.id
          AND Pricing.pricelevel = 1 AND Pricing.quantity = 1
        WHERE Item.id IN (${kitIds.join(',')})
      `
      steps.push(await runStep(
        'Kit Prices',
        `Base prices for ${kitIds.length} kit items`,
        kitPriceQuery
      ))
    }

    // ── Step 5: Total active inventory items ──
    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM Item
      WHERE Item.isinactive = 'F'
      AND Item.itemtype IN (${INVENTORY_TYPES})
    `
    steps.push(await runStep(
      'Total Count',
      'All active InvtPart + Kit items (for comparison)',
      totalQuery
    ))

    const totalMs = Date.now() - totalStart
    const totalItems = steps.find((s) => s.name === 'Total Count')?.data?.[0]?.total || '?'

    return NextResponse.json({
      success: true,
      elapsed_ms: totalMs,
      summary: {
        totalActiveItems: totalItems,
        itemsWithRecentTransactions: allIds.length,
        invtPartCount: invtPartIds.length,
        kitCount: kitIds.length,
        transactionLines: step1.data.length,
        message: `Found ${allIds.length} changed items (${invtPartIds.length} InvtPart + ${kitIds.length} Kit) out of ${totalItems} total — ${totalMs}ms`,
      },
      steps,
    })
  } catch (error) {
    console.error('SuiteQL test error:', error)
    return NextResponse.json({
      success: false,
      elapsed_ms: Date.now() - totalStart,
      steps,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}