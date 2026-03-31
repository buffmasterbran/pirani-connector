import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { matchTikTokOrders } from '@/lib/tiktok/match-orders'

/**
 * POST /api/tiktok/payouts/[id]/match
 * Match TikTok orders → Shopify (by tag) → NetSuite (cash sales).
 * Updates each TikTokPayoutTransaction with the match results.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payout = await prisma.tikTokPayout.findUnique({
      where: { id: params.id },
      include: { transactions: true },
    })

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    // Get unique TikTok order IDs from transactions
    const orderTxns = payout.transactions.filter(t => t.type === 'Order' && t.tiktokOrderId)
    const uniqueOrderIds = [...new Set(orderTxns.map(t => t.tiktokOrderId!).filter(Boolean))]

    if (uniqueOrderIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No order transactions to match',
        matched: 0,
        unmatched: 0,
      })
    }

    // Run the matching pipeline
    const matchResults = await matchTikTokOrders(uniqueOrderIds)

    // Update each transaction with match results
    let matched = 0
    let unmatched = 0

    for (const txn of orderTxns) {
      if (!txn.tiktokOrderId) continue

      const result = matchResults.get(txn.tiktokOrderId)
      if (!result) continue

      await prisma.tikTokPayoutTransaction.update({
        where: { id: txn.id },
        data: {
          shopifyOrderId: result.shopifyOrderId,
          shopifyOrderName: result.shopifyOrderName,
          netsuiteTransactionId: result.netsuiteTransactionId,
          netsuiteTransactionName: result.netsuiteTransactionName,
          netsuiteTransactionType: result.netsuiteTransactionType,
          netsuiteAmount: result.netsuiteAmount,
          matchStatus: result.matchStatus,
          matchError: result.matchError,
        },
      })

      if (result.matchStatus === 'matched') matched++
      else unmatched++
    }

    return NextResponse.json({
      success: true,
      totalOrders: uniqueOrderIds.length,
      matched,
      unmatched,
    })
  } catch (error) {
    return handleApiError(error, `POST /api/tiktok/payouts/${params.id}/match`)
  }
}
