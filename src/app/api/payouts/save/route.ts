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

    const payoutDate = payout.date ? new Date(payout.date) : payout.arrival_date ? new Date(payout.arrival_date) : null

    await prisma.payout.upsert({
      where: { id: payoutId },
      update: {
        status: payout.status ?? null,
        currency: payout.currency ?? null,
        totalAmount: payout.amount !== undefined ? Number(payout.amount) : null,
        payoutDate,
        type: payout.type ?? payout.payout_type ?? null,
      },
      create: {
        id: payoutId,
        status: payout.status ?? null,
        currency: payout.currency ?? null,
        totalAmount: payout.amount !== undefined ? Number(payout.amount) : null,
        payoutDate,
        type: payout.type ?? payout.payout_type ?? null,
      },
    })

    const allTransactions = Array.isArray(transactions) ? transactions.filter((t: any) => t?.id) : []

    if (allTransactions.length === 0) {
      return NextResponse.json({ success: true, payoutId, transactionsProcessed: 0 })
    }

    // Batch lookup: get all order line IDs in one query
    const allShopifyOrderIds = [
      ...new Set(
        allTransactions
          .map((t: any) => String(t.source_order_id || t.sourceOrderId || ''))
          .filter((id: string) => id && id !== '0')
      ),
    ]

    const orderLineMap = new Map<string, number>()
    if (allShopifyOrderIds.length > 0) {
      const orderLines = await prisma.orderLine.findMany({
        where: { shopifyOrderId: { in: allShopifyOrderIds }, isDeleted: false },
        select: { id: true, shopifyOrderId: true },
        distinct: ['shopifyOrderId'],
      })
      for (const ol of orderLines) {
        orderLineMap.set(ol.shopifyOrderId, ol.id)
      }
    }

    // Bulk upsert using raw SQL for speed
    const BATCH_SIZE = 500
    let transactionsProcessed = 0

    for (let i = 0; i < allTransactions.length; i += BATCH_SIZE) {
      const batch = allTransactions.slice(i, i + BATCH_SIZE)

      const values: string[] = []
      const params: any[] = []
      let paramIdx = 1

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
        const processedAt = processedAtRaw ? new Date(processedAtRaw).toISOString() : payoutDate?.toISOString() ?? null
        const adjustmentReason = transaction.adjustment_reason ? String(transaction.adjustment_reason) : null
        const type = transaction.type ?? null
        const currency = transaction.currency ?? payout.currency ?? null
        const orderLineId = shopifyOrderId ? (orderLineMap.get(shopifyOrderId) ?? null) : null

        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}::timestamptz, $${paramIdx + 10})`)
        params.push(
          transactionId,      // id
          payoutId,           // payoutId
          shopifyOrderId,     // shopifyOrderId
          orderLineId,        // orderLineId
          amount,             // amount
          net,                // net
          fee,                // fee
          type,               // type
          currency,           // currency
          processedAt,        // processedAt
          adjustmentReason,   // adjustmentReason
        )
        paramIdx += 11
      }

      const sql = `
        INSERT INTO "PayoutTransaction" (
          "id", "payoutId", "shopifyOrderId", "orderLineId",
          "amount", "net", "fee", "type", "currency", "processedAt", "adjustmentReason"
        )
        VALUES ${values.join(', ')}
        ON CONFLICT ("id") DO UPDATE SET
          "payoutId" = EXCLUDED."payoutId",
          "shopifyOrderId" = EXCLUDED."shopifyOrderId",
          "orderLineId" = EXCLUDED."orderLineId",
          "amount" = EXCLUDED."amount",
          "net" = EXCLUDED."net",
          "fee" = EXCLUDED."fee",
          "type" = EXCLUDED."type",
          "currency" = EXCLUDED."currency",
          "processedAt" = EXCLUDED."processedAt",
          "adjustmentReason" = EXCLUDED."adjustmentReason"
      `

      await prisma.$executeRawUnsafe(sql, ...params)
      transactionsProcessed += batch.length

      if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= allTransactions.length) {
        console.log(`💾 Saved ${transactionsProcessed}/${allTransactions.length} transactions`)
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
