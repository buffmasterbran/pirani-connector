import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { payout, transactions } = await request.json()

    if (!payout?.id) {
      return NextResponse.json(
        { error: 'Missing payout payload' },
        { status: 400 },
      )
    }

    const payoutId = String(payout.id)

    const payoutData = {
      status: payout.status ?? null,
      currency: payout.currency ?? null,
      totalAmount: payout.amount !== undefined ? Number(payout.amount) : null,
      payoutDate: payout.date ? new Date(payout.date) : payout.arrival_date ? new Date(payout.arrival_date) : null,
      type: payout.type ?? payout.payout_type ?? null,
    }

    await prisma.payout.upsert({
      where: { id: payoutId },
      update: payoutData,
      create: {
        id: payoutId,
        ...payoutData,
      },
    })

    let transactionsProcessed = 0

    const validTransactions = Array.isArray(transactions)
      ? transactions.filter((transaction: any) => transaction?.source_order_id)
      : []

    for (const transaction of validTransactions) {
      const transactionId = String(transaction.id)
      const shopifyOrderId = transaction.source_order_id ? String(transaction.source_order_id) : transaction.sourceOrderId ? String(transaction.sourceOrderId) : null
      const amount = transaction.amount !== undefined ? Number(transaction.amount) : null
      const net = transaction.net !== undefined ? Number(transaction.net) : null
      const fee = transaction.fee !== undefined ? Number(transaction.fee) : null
      const processedAtRaw = transaction.processed_at ?? transaction.processedAt ?? null
      const processedAt = processedAtRaw ? new Date(processedAtRaw) : payoutData.payoutDate ?? null
      const adjustmentReason = transaction.adjustment_reason ? String(transaction.adjustment_reason) : null

      let orderLineId: number | null = null
      if (shopifyOrderId) {
        const orderLine = await prisma.orderLine.findFirst({
          where: { shopifyOrderId, isDeleted: false },
          select: { id: true },
        })
        orderLineId = orderLine?.id ?? null
      }

      await prisma.payoutTransaction.upsert({
        where: { id: transactionId },
        update: {
          payoutId,
          shopifyOrderId,
          orderLineId,
          amount,
          net,
          fee,
          type: transaction.type ?? null,
          currency: transaction.currency ?? payout.currency ?? null,
          processedAt,
          adjustmentReason,
        },
        create: {
          id: transactionId,
          payoutId,
          shopifyOrderId,
          orderLineId,
          amount,
          net,
          fee,
          type: transaction.type ?? null,
          currency: transaction.currency ?? payout.currency ?? null,
          processedAt,
          adjustmentReason,
        },
      })

      if (shopifyOrderId) {
        await prisma.orderLine.updateMany({
          where: { shopifyOrderId },
          data: {
            shopifyPayoutId: payoutId,
            shopifyPayoutStatus: payout.status ?? null,
            expectedPayoutAmount: amount,
            actualDepositAmount: net,
            varianceAmount: amount !== null && net !== null ? net - amount : null,
            depositCreatedAt: processedAt,
            syncedShopifyAt: new Date(),
          },
        })
      }

      transactionsProcessed += 1
    }

    return NextResponse.json({ success: true, payoutId, transactionsProcessed })
  } catch (error) {
    console.error('❌ Detailed error saving payout:', error)
    return NextResponse.json(
      {
        error: 'Failed to save payout and transactions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
