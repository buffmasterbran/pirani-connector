import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const maxDuration = 300

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
      create: { id: payoutId, ...payoutData },
    })

    const validTransactions = Array.isArray(transactions)
      ? transactions.filter((t: any) => t?.source_order_id)
      : []

    if (validTransactions.length === 0) {
      return NextResponse.json({ success: true, payoutId, transactionsProcessed: 0 })
    }

    // Batch lookup: get all order line IDs in one query
    const allShopifyOrderIds = [
      ...new Set(
        validTransactions
          .map((t: any) => String(t.source_order_id || t.sourceOrderId || ''))
          .filter(Boolean)
      ),
    ]

    const orderLines = await prisma.orderLine.findMany({
      where: { shopifyOrderId: { in: allShopifyOrderIds }, isDeleted: false },
      select: { id: true, shopifyOrderId: true },
      distinct: ['shopifyOrderId'],
    })

    const orderLineMap = new Map<string, number>()
    for (const ol of orderLines) {
      orderLineMap.set(ol.shopifyOrderId, ol.id)
    }

    // Process in batches of 500 using $transaction
    const BATCH_SIZE = 500
    let transactionsProcessed = 0

    for (let i = 0; i < validTransactions.length; i += BATCH_SIZE) {
      const batch = validTransactions.slice(i, i + BATCH_SIZE)
      const ops: any[] = []

      for (const transaction of batch) {
        const transactionId = String(transaction.id)
        const shopifyOrderId = transaction.source_order_id
          ? String(transaction.source_order_id)
          : transaction.sourceOrderId
            ? String(transaction.sourceOrderId)
            : null
        const amount = transaction.amount !== undefined ? Number(transaction.amount) : null
        const net = transaction.net !== undefined ? Number(transaction.net) : null
        const fee = transaction.fee !== undefined ? Number(transaction.fee) : null
        const processedAtRaw = transaction.processed_at ?? transaction.processedAt ?? null
        const processedAt = processedAtRaw ? new Date(processedAtRaw) : payoutData.payoutDate ?? null
        const adjustmentReason = transaction.adjustment_reason ? String(transaction.adjustment_reason) : null

        const orderLineId = shopifyOrderId ? (orderLineMap.get(shopifyOrderId) ?? null) : null

        const txData = {
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
        }

        ops.push(
          prisma.payoutTransaction.upsert({
            where: { id: transactionId },
            update: txData,
            create: { id: transactionId, ...txData },
          })
        )
      }

      await prisma.$transaction(ops)
      transactionsProcessed += batch.length

      if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= validTransactions.length) {
        console.log(`💾 Saved ${transactionsProcessed}/${validTransactions.length} transactions`)
      }
    }

    // Batch update order lines
    if (allShopifyOrderIds.length > 0) {
      await prisma.orderLine.updateMany({
        where: { shopifyOrderId: { in: allShopifyOrderIds } },
        data: {
          shopifyPayoutId: payoutId,
          shopifyPayoutStatus: payout.status ?? null,
          syncedShopifyAt: new Date(),
        },
      })
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
