import { shopifyFetch } from '@/lib/shopify/shared'
import { fetchNetSuiteTransactions } from '@/lib/netsuite/transactions'

interface MatchResult {
  tiktokOrderId: string
  shopifyOrderId: string | null
  shopifyOrderName: string | null
  netsuiteTransactionId: string | null
  netsuiteTransactionName: string | null
  netsuiteTransactionType: string | null
  netsuiteAmount: number | null
  matchStatus: 'matched' | 'unmatched' | 'error'
  matchError: string | null
}

/**
 * Search Shopify for an order tagged with TikTokOrderID:<id>.
 * Returns the Shopify order or null if not found.
 */
async function findShopifyOrderByTikTokId(tiktokOrderId: string): Promise<{
  id: string
  name: string
  order_number: number
  tags: string
} | null> {
  try {
    const url = `/orders.json?status=any&limit=5&tag=TikTokOrderID:${tiktokOrderId}`
    console.log(`[TikTok Match] 🔍 Searching Shopify: tag=TikTokOrderID:${tiktokOrderId}`)

    const data = await shopifyFetch<{ orders: any[] }>(url)
    console.log(`[TikTok Match]    → Shopify returned ${data.orders?.length || 0} order(s)`)

    if (data.orders && data.orders.length > 0) {
      const order = data.orders[0]
      console.log(`[TikTok Match]    ✅ Found: ${order.name} (ID: ${order.id}, tags: ${(order.tags || '').substring(0, 100)})`)
      return {
        id: String(order.id),
        name: order.name || `#${order.order_number}`,
        order_number: order.order_number,
        tags: order.tags || '',
      }
    }

    console.log(`[TikTok Match]    ❌ No Shopify order found for TikTok ID ${tiktokOrderId}`)
    return null
  } catch (error: any) {
    console.error(`[TikTok Match]    ❌ Shopify error for ${tiktokOrderId}: ${error.message}`)
    return null
  }
}

/**
 * Match a batch of TikTok order IDs → Shopify orders → NetSuite cash sales.
 */
export async function matchTikTokOrders(
  tiktokOrderIds: string[]
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>()
  const uniqueIds = [...new Set(tiktokOrderIds.filter(id => id && id !== '/'))]

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[TikTok Match] Starting match for ${uniqueIds.length} unique TikTok order(s)`)
  console.log(`${'='.repeat(60)}\n`)

  // ── Step 1: Find Shopify orders ──────────────────────────────────────────
  console.log(`[TikTok Match] STEP 1: Searching Shopify by TikTokOrderID tags...`)
  const shopifyMatches = new Map<string, { id: string; name: string; orderNumber: number }>()

  for (let i = 0; i < uniqueIds.length; i++) {
    const tiktokId = uniqueIds[i]
    console.log(`[TikTok Match] [${i + 1}/${uniqueIds.length}] TikTok Order: ${tiktokId}`)

    const shopifyOrder = await findShopifyOrderByTikTokId(tiktokId)
    if (shopifyOrder) {
      shopifyMatches.set(tiktokId, {
        id: shopifyOrder.id,
        name: shopifyOrder.name,
        orderNumber: shopifyOrder.order_number,
      })
    }
    // Throttle: 500ms between requests to stay under Shopify rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n[TikTok Match] Shopify results: ${shopifyMatches.size}/${uniqueIds.length} found`)
  if (shopifyMatches.size > 0) {
    console.log(`[TikTok Match] Matched Shopify orders:`)
    shopifyMatches.forEach((val, key) => {
      console.log(`[TikTok Match]   TikTok ${key} → Shopify ${val.name} (ID: ${val.id})`)
    })
  }
  const missingFromShopify = uniqueIds.filter(id => !shopifyMatches.has(id))
  if (missingFromShopify.length > 0) {
    console.log(`[TikTok Match] ⚠️  Missing from Shopify (${missingFromShopify.length}):`)
    missingFromShopify.forEach(id => console.log(`[TikTok Match]   ${id}`))
  }

  // ── Step 2: Batch-query NetSuite ─────────────────────────────────────────
  const orderNames = [...shopifyMatches.values()].map(m => m.name)
  let nsResults: Awaited<ReturnType<typeof fetchNetSuiteTransactions>> | null = null

  if (orderNames.length > 0) {
    console.log(`\n[TikTok Match] STEP 2: Querying NetSuite for ${orderNames.length} order name(s)...`)
    console.log(`[TikTok Match] Order names: ${orderNames.join(', ')}`)
    try {
      nsResults = await fetchNetSuiteTransactions({
        account: 0,
        memo: '',
        date: '',
        cashsales: orderNames,
        refunds: orderNames,
        payments: [],
        customerRefunds: [],
      })
      console.log(`[TikTok Match] NetSuite response: ${nsResults.message}`)
      if (nsResults.details) {
        console.log(`[TikTok Match]   Cash Sales: ${nsResults.details.cashsales.length}`)
        nsResults.details.cashsales.forEach(cs =>
          console.log(`[TikTok Match]     ${cs.tranid} (ID: ${cs.id}) — otherrefnum: ${cs.otherrefnum} — $${cs.amount}`)
        )
        console.log(`[TikTok Match]   Refunds: ${nsResults.details.refunds.length}`)
        nsResults.details.refunds.forEach(rf =>
          console.log(`[TikTok Match]     ${rf.tranid} (ID: ${rf.id}) — otherrefnum: ${rf.otherrefnum} — $${rf.amount}`)
        )
        if (nsResults.details.payments?.length) {
          console.log(`[TikTok Match]   Payments: ${nsResults.details.payments.length}`)
        }
        if (nsResults.details.customerRefunds?.length) {
          console.log(`[TikTok Match]   Customer Refunds: ${nsResults.details.customerRefunds.length}`)
        }
      }
    } catch (error: any) {
      console.error(`[TikTok Match] ❌ NetSuite query failed: ${error.message}`)
    }
  } else {
    console.log(`\n[TikTok Match] STEP 2: Skipped — no Shopify orders to look up in NetSuite`)
  }

  // ── Step 3: Build results ────────────────────────────────────────────────
  console.log(`\n[TikTok Match] STEP 3: Building match results...`)
  let matchedCount = 0
  let unmatchedCount = 0

  for (const tiktokId of uniqueIds) {
    const shopify = shopifyMatches.get(tiktokId)

    if (!shopify) {
      results.set(tiktokId, {
        tiktokOrderId: tiktokId,
        shopifyOrderId: null,
        shopifyOrderName: null,
        netsuiteTransactionId: null,
        netsuiteTransactionName: null,
        netsuiteTransactionType: null,
        netsuiteAmount: null,
        matchStatus: 'unmatched',
        matchError: 'No Shopify order found with TikTokOrderID tag',
      })
      unmatchedCount++
      continue
    }

    // Look for NS cash sale matching this Shopify order name
    let nsMatch: { id: number; tranid: string; amount: number; type: string } | null = null

    if (nsResults?.details) {
      const cashSale = nsResults.details.cashsales.find(
        cs => cs.otherrefnum === shopify.name
      )
      if (cashSale) {
        nsMatch = { id: cashSale.id, tranid: cashSale.tranid, amount: cashSale.amount, type: 'CashSale' }
      } else {
        const refund = nsResults.details.refunds.find(
          rf => rf.otherrefnum === shopify.name
        )
        if (refund) {
          nsMatch = { id: refund.id, tranid: refund.tranid, amount: refund.amount, type: 'CashRfnd' }
        }
      }
    }

    if (nsMatch) {
      console.log(`[TikTok Match] ✅ ${tiktokId} → ${shopify.name} → ${nsMatch.tranid} (NS ID: ${nsMatch.id}, $${nsMatch.amount})`)
      matchedCount++
    } else {
      console.log(`[TikTok Match] ⚠️  ${tiktokId} → ${shopify.name} → NO NS MATCH`)
      unmatchedCount++
    }

    results.set(tiktokId, {
      tiktokOrderId: tiktokId,
      shopifyOrderId: shopify.id,
      shopifyOrderName: shopify.name,
      netsuiteTransactionId: nsMatch ? String(nsMatch.id) : null,
      netsuiteTransactionName: nsMatch ? nsMatch.tranid : null,
      netsuiteTransactionType: nsMatch ? nsMatch.type : null,
      netsuiteAmount: nsMatch ? nsMatch.amount : null,
      matchStatus: nsMatch ? 'matched' : 'unmatched',
      matchError: nsMatch ? null : `Shopify order ${shopify.name} found but no NetSuite Cash Sale`,
    })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[TikTok Match] DONE: ${matchedCount} matched, ${unmatchedCount} unmatched out of ${uniqueIds.length}`)
  console.log(`${'='.repeat(60)}\n`)

  return results
}
