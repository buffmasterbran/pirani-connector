import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, toISO } from '@/lib/api-helpers'

/**
 * GET /api/tiktok/payouts — List all TikTok payouts (statements)
 */
export async function GET() {
  try {
    const payouts = await prisma.tikTokPayout.findMany({
      orderBy: { payoutDate: 'desc' },
      include: {
        transactions: {
          select: {
            id: true,
            tiktokOrderId: true,
            matchStatus: true,
            netsuiteTransactionId: true,
            totalSettlementAmount: true,
            type: true,
          },
        },
      },
    })

    const formatted = payouts.map(p => {
      const txns = p.transactions || []
      const orderTxns = txns.filter(t => t.type === 'Order')
      const matched = orderTxns.filter(t => t.matchStatus === 'matched').length
      const unmatched = orderTxns.filter(t => t.matchStatus !== 'matched').length
      const uniqueOrders = new Set(txns.map(t => t.tiktokOrderId).filter(Boolean)).size

      return {
        id: p.id,
        paymentId: p.paymentId,
        status: p.status,
        currency: p.currency,
        totalAmount: p.totalAmount,
        netSales: p.netSales,
        shipping: p.shipping,
        fees: p.fees,
        adjustments: p.adjustments,
        payableAmount: p.payableAmount,
        payoutDate: toISO(p.payoutDate),
        netsuiteDepositId: p.netsuiteDepositId,
        pushedToNsAt: toISO(p.pushedToNsAt),
        pushedToNsBy: p.pushedToNsBy,
        uploadBatchId: p.uploadBatchId,
        transactionCount: txns.length,
        uniqueOrderCount: uniqueOrders,
        matchedCount: matched,
        unmatchedCount: unmatched,
      }
    })

    return NextResponse.json({ payouts: formatted })
  } catch (error) {
    return handleApiError(error, 'GET /api/tiktok/payouts')
  }
}
