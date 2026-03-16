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

    // Auto-split transactions that have adjustment_order_transactions (e.g. Shop Cash)
    // Shopify merges multiple orders into one payout line — this splits them back out
    const transactionsToAutoSplit = allTransactions.filter(
      (t: any) => Array.isArray(t.adjustment_order_transactions) && t.adjustment_order_transactions.length > 1
    )

    if (transactionsToAutoSplit.length > 0) {
      console.log(`🔀 Auto-splitting ${transactionsToAutoSplit.length} merged transactions`)

      // Log the first transaction's adjustment_order_transactions structure for debugging
      if (transactionsToAutoSplit.length > 0) {
        const sample = transactionsToAutoSplit[0]
        console.log(`🔀 Sample adjustment_order_transactions:`, JSON.stringify(sample.adjustment_order_transactions?.slice(0, 2)))
        console.log(`🔀 Sample transaction keys:`, Object.keys(sample).join(', '))
      }

      // Collect all order IDs from the splits so we can look up orderLineIds
      const splitOrderIds = new Set<string>()
      for (const t of transactionsToAutoSplit) {
        for (const sub of t.adjustment_order_transactions) {
          if (sub.order_id) splitOrderIds.add(String(sub.order_id))
        }
      }

      // Look up any orderLineIds we don't already have
      const missingOrderIds = [...splitOrderIds].filter(id => !orderLineMap.has(id))
      if (missingOrderIds.length > 0) {
        const extraOrderLines = await prisma.orderLine.findMany({
          where: { shopifyOrderId: { in: missingOrderIds }, isDeleted: false },
          select: { id: true, shopifyOrderId: true },
          distinct: ['shopifyOrderId'],
        })
        for (const ol of extraOrderLines) {
          orderLineMap.set(ol.shopifyOrderId, ol.id)
        }
      }

      // Also look up order names for display
      const orderNameMap = new Map<string, string>()
      const orderIdsForNames = [...splitOrderIds]
      if (orderIdsForNames.length > 0) {
        const orderLines = await prisma.orderLine.findMany({
          where: { shopifyOrderId: { in: orderIdsForNames }, isDeleted: false },
          select: { shopifyOrderId: true, shopifyOrderName: true },
          distinct: ['shopifyOrderId'],
        })
        for (const ol of orderLines) {
          if (ol.shopifyOrderName) orderNameMap.set(ol.shopifyOrderId, ol.shopifyOrderName)
        }
      }

      for (const transaction of transactionsToAutoSplit) {
        const parentId = String(transaction.id)
        const subs: any[] = transaction.adjustment_order_transactions

        // Check if this parent already has children (re-import case)
        const existingChildren = await prisma.payoutTransaction.count({
          where: { parentTransactionId: parentId },
        })
        if (existingChildren > 0) {
          console.log(`🔀 Skipping ${parentId} — already has ${existingChildren} split children`)
          continue
        }

        const parentCurrency = transaction.currency ?? payout.currency ?? null
        const processedAtRaw = transaction.processed_at ?? transaction.processedAt ?? null
        const processedAt = processedAtRaw ? new Date(processedAtRaw) : payoutDate ?? null

        // Create a standalone transaction for each order in the merged transaction
        // These are top-level rows (no parentTransactionId) so they show as individual
        // lines that can be matched to NS payments normally
        for (let j = 0; j < subs.length; j++) {
          const sub = subs[j]
          const childOrderId = sub.order_id ? String(sub.order_id) : null
          const childAmount = sub.amount != null ? Number(sub.amount) : 0
          const childOrderLineId = childOrderId ? (orderLineMap.get(childOrderId) ?? null) : null
          const childId = `${parentId}-auto-${j}`

          await prisma.payoutTransaction.create({
            data: {
              id: childId,
              payoutId,
              shopifyOrderId: childOrderId,
              orderLineId: childOrderLineId,
              type: transaction.type ?? null,
              currency: parentCurrency,
              processedAt,
              amount: childAmount,
              net: childAmount,
              fee: 0,
              includeInNetSuite: true,
            },
          })
        }

        // Create a separate fee line if the merged transaction had a fee
        const parentFee = transaction.fee != null ? Number(transaction.fee) : 0
        if (parentFee !== 0) {
          const feeId = `${parentId}-auto-fee`
          await prisma.payoutTransaction.create({
            data: {
              id: feeId,
              payoutId,
              shopifyOrderId: null,
              orderLineId: null,
              type: 'shop_cash_fee',
              currency: parentCurrency,
              processedAt,
              amount: parentFee,
              net: parentFee,
              fee: 0,
              includeInNetSuite: true,
              feeDescription: 'Shop Cash Fee',
            },
          })
          console.log(`🔀 Created Shop Cash Fee line: ${parentFee}`)
        }

        // Set the merged parent to excluded (it's replaced by the individual rows above)
        await prisma.payoutTransaction.update({
          where: { id: parentId },
          data: { includeInNetSuite: false },
        })

        const orderNames = subs.map((s: any) => {
          const oid = s.order_id ? String(s.order_id) : '?'
          return orderNameMap.get(oid) || oid
        }).join(', ')
        console.log(`🔀 Split ${parentId} into ${subs.length} children + fee: ${orderNames}`)
      }
    }

    // Batch update order lines (include split child order IDs too)
    const allOrderIdsForUpdate = new Set(allShopifyOrderIds)
    for (const t of transactionsToAutoSplit) {
      for (const sub of (t.adjustment_order_transactions ?? [])) {
        if (sub.order_id) allOrderIdsForUpdate.add(String(sub.order_id))
      }
    }
    const orderIdsToUpdate = [...allOrderIdsForUpdate]
    if (orderIdsToUpdate.length > 0) {
      await prisma.orderLine.updateMany({
        where: { shopifyOrderId: { in: orderIdsToUpdate } },
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
