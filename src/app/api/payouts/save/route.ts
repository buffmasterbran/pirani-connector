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
    // Only split when there are 2+ orders merged (length > 1).
    // Single-order credits (length === 1) work fine without splitting.
    const transactionsToAutoSplit = allTransactions.filter(
      (t: any) => Array.isArray(t.adjustment_order_transactions) && t.adjustment_order_transactions.length > 1
    )

    if (transactionsToAutoSplit.length > 0) {
      console.log(`🔀 Auto-splitting ${transactionsToAutoSplit.length} merged transactions`)

      // Collect all order IDs from the splits so we can look up orderLineIds
      // Shopify nests order info: sub.order.id and sub.order.name
      // Also include the parent's source_order_id as a safety net
      const splitOrderIds = new Set<string>()
      for (const t of transactionsToAutoSplit) {
        if (t.source_order_id) splitOrderIds.add(String(t.source_order_id))
        for (const sub of t.adjustment_order_transactions) {
          const orderId = sub.order?.id ?? sub.order_id
          if (orderId) splitOrderIds.add(String(orderId))
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

      for (const transaction of transactionsToAutoSplit) {
        try {
        const parentId = String(transaction.id)
        const subs: any[] = transaction.adjustment_order_transactions

        // Find which children already exist (re-import safe)
        // On re-import, only create MISSING children — preserves manual edits (NS IDs, dropdowns)
        const existingChildRows = await prisma.payoutTransaction.findMany({
          where: { id: { startsWith: `${parentId}-auto` } },
          select: { id: true },
        })
        const existingChildIds = new Set(existingChildRows.map(c => c.id))

        if (existingChildIds.size >= subs.length) {
          console.log(`🔀 Skipping ${parentId} — already has ${existingChildIds.size} split children`)
          continue
        }

        const parentCurrency = transaction.currency ?? payout.currency ?? null
        const processedAtRaw = transaction.processed_at ?? transaction.processedAt ?? null
        const processedAt = processedAtRaw ? new Date(processedAtRaw) : payoutDate ?? null
        const parentFee = transaction.fee != null ? Number(transaction.fee) : 0
        const parentAmount = transaction.amount != null ? Number(transaction.amount) : 0

        // Create a standalone transaction for each order in the merged transaction
        // These are top-level rows that can be matched to NS payments normally
        let totalChildFees = 0
        let created = 0
        for (let j = 0; j < subs.length; j++) {
          const sub = subs[j]
          const childId = `${parentId}-auto-${j}`
          const childFee = sub.fees != null ? Number(sub.fees) : 0
          totalChildFees += childFee

          // Skip if this child already exists (incomplete split re-import)
          if (existingChildIds.has(childId)) continue

          const childOrderId = sub.order?.id ? String(sub.order.id) : (sub.order_id ? String(sub.order_id) : null)
          const childOrderName = sub.order?.name ?? null
          const childAmount = sub.amount != null ? Number(sub.amount) : 0
          const childNet = sub.net != null ? Number(sub.net) : childAmount
          const childOrderLineId = childOrderId ? (orderLineMap.get(childOrderId) ?? null) : null

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
              net: childNet,
              fee: Math.abs(childFee || 0),
              adjustmentReason: transaction.adjustment_reason ?? null,
              includeInNetSuite: true,
            },
          })
          created++

          console.log(`🔀   Child ${j}: ${childOrderName || childOrderId || '?'} = $${childAmount} (fee: $${childFee})`)
        }

        // Safety net: if Shopify omitted the primary order from adjustment_order_transactions,
        // the children amounts won't sum to the parent. Create a remainder child.
        const totalChildAmounts = subs.reduce((sum: number, s: any) => sum + (s.amount != null ? Number(s.amount) : 0), 0)
        const remainderAmount = Math.round((parentAmount - totalChildAmounts) * 100) / 100
        const remainderId = `${parentId}-auto-${subs.length}`
        if (Math.abs(remainderAmount) > 0.01 && !existingChildIds.has(remainderId)) {
          const parentOrderId = transaction.source_order_id ? String(transaction.source_order_id) : null
          const remainderFee = Math.round((Math.abs(parentFee) - totalChildFees) * 100) / 100
          const remainderNet = Math.round((remainderAmount - remainderFee) * 100) / 100
          const remainderOrderLineId = parentOrderId ? (orderLineMap.get(parentOrderId) ?? null) : null

          await prisma.payoutTransaction.create({
            data: {
              id: remainderId,
              payoutId,
              shopifyOrderId: parentOrderId,
              orderLineId: remainderOrderLineId,
              type: transaction.type ?? null,
              currency: parentCurrency,
              processedAt,
              amount: remainderAmount,
              net: remainderNet,
              fee: Math.abs(remainderFee || 0),
              adjustmentReason: transaction.adjustment_reason ?? null,
              includeInNetSuite: true,
            },
          })
          totalChildFees += remainderFee
          created++
          console.log(`🔀   Child ${subs.length} (inferred remainder): ${parentOrderId || '?'} = $${remainderAmount} (fee: $${remainderFee})`)
        }

        // Fee rounding line — captures any diff between parent fee and sum of child fees
        const feeDiff = Math.abs(parentFee) - totalChildFees
        const feeId = `${parentId}-auto-fee`
        if (Math.abs(feeDiff) > 0.01 && !existingChildIds.has(feeId)) {
          await prisma.payoutTransaction.create({
            data: {
              id: feeId,
              payoutId,
              shopifyOrderId: null,
              orderLineId: null,
              type: 'shop_cash_fee',
              currency: parentCurrency,
              processedAt,
              amount: -Math.abs(feeDiff),
              net: -Math.abs(feeDiff),
              fee: 0,
              includeInNetSuite: true,
              amountDescription: 'Shop Cash Fee (rounding)',
            },
          })
          console.log(`🔀 Created Shop Cash Fee rounding line: ${feeDiff}`)
        }

        // Set the merged parent to excluded (it's replaced by the individual rows above)
        await prisma.payoutTransaction.update({
          where: { id: parentId },
          data: { includeInNetSuite: false },
        })

        const orderNames = subs.map((s: any) => s.order?.name || s.order_id || '?').join(', ')
        if (created > 0) {
          console.log(`🔀 Split ${parentId} into ${subs.length} children (${created} new, ${existingChildIds.size} existed): ${orderNames}`)
        }

        } catch (splitErr) {
          console.error(`🔀 ❌ Error splitting ${transaction.id} (non-fatal):`, splitErr)
        }
      }
    }

    // Batch update order lines (include split child order IDs too)
    const allOrderIdsForUpdate = new Set(allShopifyOrderIds)
    for (const t of transactionsToAutoSplit) {
      for (const sub of (t.adjustment_order_transactions ?? [])) {
        const orderId = sub.order?.id ?? sub.order_id
        if (orderId) allOrderIdsForUpdate.add(String(orderId))
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

    // Run auto-assign rules on all transactions (including split children)
    try {
      const { runAutoAssignRules } = await import('@/lib/auto-assign')
      const autoResult = await runAutoAssignRules(payoutId)
      if (autoResult.applied > 0) {
        console.log(`🏷️ Auto-assign: applied ${autoResult.applied} rules, skipped ${autoResult.skipped}`)
      }
    } catch (autoErr) {
      console.warn('⚠️ Auto-assign failed (non-fatal):', autoErr)
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
