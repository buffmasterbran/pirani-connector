import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchNetSuiteTransactions } from '@/lib/netsuite'

export const maxDuration = 60

const MAX_ORDER_NAMES_PER_BATCH = 1500

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

async function loadPayoutData(payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: {
      transactions: {
        include: {
          orderLine: { select: { shopifyOrderName: true } },
        },
      },
    },
  })
  return payout
}

function classifyTransactions(payout: NonNullable<Awaited<ReturnType<typeof loadPayoutData>>>) {
  const transactionsNeedingNS = payout.transactions.filter(
    (txn) =>
      (txn.orderLine?.shopifyOrderName || txn.shopifyOrderId) &&
      !txn.netsuiteTransactionId &&
      txn.includeInNetSuite !== false
  )

  const cashSales: string[] = []
  const refunds: string[] = []
  const payments: string[] = []

  for (const txn of transactionsNeedingNS) {
    const orderName =
      txn.orderLine?.shopifyOrderName ||
      (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)
    if (!orderName) continue

    const isRefund = txn.type === 'refund' || txn.amount === null || (txn.amount !== null && txn.amount < 0)
    const isPayment = txn.type === 'payment' || txn.type === 'custpymt' || txn.type?.toLowerCase().includes('payment')

    if (isPayment) payments.push(orderName)
    else if (isRefund) refunds.push(orderName)
    else cashSales.push(orderName)
  }

  return { cashSales, refunds, payments, transactionsNeedingNS }
}

function buildNSBatches(cashSales: string[], refunds: string[], payments: string[]) {
  const batches: Array<{ cashsales: string[]; refunds: string[]; payments?: string[] }> = []
  let csIdx = 0, rfIdx = 0, pmIdx = 0

  while (csIdx < cashSales.length || rfIdx < refunds.length || pmIdx < payments.length) {
    const bcs: string[] = [], brf: string[] = [], bpm: string[] = []
    let total = 0

    while (csIdx < cashSales.length && total < MAX_ORDER_NAMES_PER_BATCH) { bcs.push(cashSales[csIdx++]); total++ }
    while (rfIdx < refunds.length && total < MAX_ORDER_NAMES_PER_BATCH) { brf.push(refunds[rfIdx++]); total++ }
    while (pmIdx < payments.length && total < MAX_ORDER_NAMES_PER_BATCH) { bpm.push(payments[pmIdx++]); total++ }

    if (bcs.length > 0 || brf.length > 0 || bpm.length > 0) {
      batches.push({ cashsales: bcs, refunds: brf, payments: bpm.length > 0 ? bpm : undefined })
    }
  }
  return batches
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const payoutId = resolvedParams.id
    const body = await request.json().catch(() => ({}))
    const action: string = body.action || 'full'

    const payoutOrNull = await loadPayoutData(payoutId)
    if (!payoutOrNull) {
      return NextResponse.json({ success: false, error: 'Payout not found' }, { status: 404 })
    }
    const payout = payoutOrNull

    const { cashSales, refunds, payments, transactionsNeedingNS } = classifyTransactions(payout)

    if (transactionsNeedingNS.length === 0) {
      return NextResponse.json({ success: true, message: 'All transactions already have NetSuite IDs', updated: 0, errors: [] })
    }

    // --- PREPARE: Return batch plan so client can orchestrate ---
    if (action === 'prepare') {
      const nsBatches = buildNSBatches(cashSales, refunds, payments)
      return NextResponse.json({
        success: true,
        action: 'prepare',
        totalNeeding: transactionsNeedingNS.length,
        cashSalesCount: cashSales.length,
        refundsCount: refunds.length,
        paymentsCount: payments.length,
        nsBatchCount: nsBatches.length,
        nsBatches: nsBatches.map((b, i) => ({
          index: i,
          cashsales: b.cashsales.length,
          refunds: b.refunds.length,
          payments: b.payments?.length || 0,
        })),
      })
    }

    // --- FETCH: Fetch one NS batch and return raw results ---
    if (action === 'fetch') {
      const batchIndex: number = body.batchIndex ?? 0
      const nsBatches = buildNSBatches(cashSales, refunds, payments)

      if (batchIndex >= nsBatches.length) {
        return NextResponse.json({ success: true, action: 'fetch', done: true, results: { cashsales: [], refunds: [], payments: [] } })
      }

      const batch = nsBatches[batchIndex]
      const payoutDate = payout.payoutDate || new Date()
      const nsRequest = {
        account: 217,
        memo: `Shopify payout ${payoutId.slice(-8)}`,
        date: payoutDate.toISOString().split('T')[0],
        ...batch,
      }

      console.log(`📦 Fetching NS batch ${batchIndex + 1}/${nsBatches.length}: ${batch.cashsales.length} CS, ${batch.refunds.length} RF, ${batch.payments?.length || 0} PM`)
      const nsResponse = await fetchNetSuiteTransactions(nsRequest)

      if (nsResponse.status !== 'success') {
        return NextResponse.json({ success: false, error: `NetSuite batch ${batchIndex + 1} failed: ${nsResponse.message}` }, { status: 500 })
      }

      console.log(`✅ NS batch ${batchIndex + 1}: ${nsResponse.details.cashsales.length} CS, ${nsResponse.details.refunds.length} RF, ${(nsResponse.details.payments || []).length} PM`)

      return NextResponse.json({
        success: true,
        action: 'fetch',
        batchIndex,
        done: batchIndex >= nsBatches.length - 1,
        results: {
          cashsales: nsResponse.details.cashsales,
          refunds: nsResponse.details.refunds,
          payments: nsResponse.details.payments || [],
        },
      })
    }

    // --- SAVE: Match provided NS results against DB transactions and bulk-update ---
    if (action === 'save') {
      const nsResults: {
        cashsales: Array<{ id: number; tranid: string; otherrefnum: string; amount: number }>
        refunds: Array<{ id: number; tranid: string; otherrefnum: string; amount: number }>
        payments: Array<{ id: number; tranid: string; otherrefnum: string; amount: number }>
      } = body.results || { cashsales: [], refunds: [], payments: [] }

      const transactionMap = new Map<string, Array<typeof payout.transactions[0]>>()
      for (const txn of payout.transactions) {
        if (txn.includeInNetSuite === false) continue
        const orderName = txn.orderLine?.shopifyOrderName || (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)
        if (!orderName) continue

        const normalized = orderName.startsWith('#') ? orderName : `#${orderName}`
        const bare = orderName.startsWith('#') ? orderName.substring(1) : orderName

        for (const key of [normalized, bare]) {
          if (!transactionMap.has(key)) transactionMap.set(key, [])
          transactionMap.get(key)!.push(txn)
        }
      }

      const normalize = (n: string) => (n.startsWith('#') ? n : `#${n}`)
      const isRefund = (txn: typeof payout.transactions[0]) =>
        txn.type === 'refund' || txn.amount === null || (txn.amount !== null && txn.amount < 0)

      const updates: Array<{
        id: string
        netsuiteTransactionId: string
        netsuiteTransactionName: string
        netsuiteAmount: number
        amountMismatch: boolean
      }> = []
      const errors: string[] = []
      const matchedTxnIds = new Set<string>()

      const matchNS = (
        nsItems: Array<{ id: number; tranid: string; otherrefnum: string; amount: number }>,
        filterFn: (txn: typeof payout.transactions[0]) => boolean,
        useAbsAmount: boolean,
      ) => {
        for (const nsItem of nsItems) {
          const key1 = normalize(nsItem.otherrefnum)
          const txns = transactionMap.get(key1) || transactionMap.get(nsItem.otherrefnum) || []
          const candidates = txns.filter(t => filterFn(t) && !matchedTxnIds.has(t.id))

          let matched = candidates.find(txn => {
            const shopAmt = useAbsAmount ? Math.abs(txn.amount || txn.net || 0) : (txn.amount || txn.net || 0)
            const nsAmt = useAbsAmount ? Math.abs(nsItem.amount) : nsItem.amount
            return Math.abs(shopAmt - nsAmt) < 0.01
          })
          if (!matched && candidates.length > 0) matched = candidates[0]

          if (matched) {
            matchedTxnIds.add(matched.id)
            const shopAmt = useAbsAmount ? Math.abs(matched.amount || matched.net || 0) : (matched.amount || matched.net || 0)
            const nsAmt = useAbsAmount ? Math.abs(nsItem.amount) : nsItem.amount
            const mismatch = Math.abs(shopAmt - nsAmt) > 0.01

            updates.push({
              id: matched.id,
              netsuiteTransactionId: String(nsItem.id),
              netsuiteTransactionName: nsItem.tranid,
              netsuiteAmount: nsItem.amount,
              amountMismatch: mismatch,
            })

            if (mismatch) {
              errors.push(`${nsItem.otherrefnum}: Mismatch - Shopify: ${shopAmt.toFixed(2)}, NS: ${nsItem.amount.toFixed(2)}`)
            }
          }
        }
      }

      matchNS(nsResults.cashsales, t => !isRefund(t), false)
      matchNS(nsResults.refunds, t => isRefund(t), true)
      matchNS(nsResults.payments, t => t.type === 'payment' || t.type === 'custpymt' || (t.type?.toLowerCase().includes('payment') ?? false), true)

      if (updates.length > 0) {
        const BATCH = 500
        for (let i = 0; i < updates.length; i += BATCH) {
          const chunk = updates.slice(i, i + BATCH)
          const ids = chunk.map(u => u.id)

          let nsIdCase = ''
          let nsNameCase = ''
          let nsAmountCase = ''
          let mismatchCase = ''
          const sqlParams: any[] = []
          let pIdx = 1

          for (const u of chunk) {
            nsIdCase += ` WHEN "id" = $${pIdx} THEN $${pIdx + 1}`
            nsNameCase += ` WHEN "id" = $${pIdx} THEN $${pIdx + 2}`
            nsAmountCase += ` WHEN "id" = $${pIdx} THEN $${pIdx + 3}::float`
            mismatchCase += ` WHEN "id" = $${pIdx} THEN $${pIdx + 4}::boolean`
            sqlParams.push(u.id, u.netsuiteTransactionId, u.netsuiteTransactionName, u.netsuiteAmount, u.amountMismatch)
            pIdx += 5
          }

          const idPlaceholders = ids.map((_, idx) => `$${pIdx + idx}`).join(', ')
          sqlParams.push(...ids)

          const sql = `
            UPDATE "PayoutTransaction" SET
              "netsuiteTransactionId" = CASE ${nsIdCase} END,
              "netsuiteTransactionName" = CASE ${nsNameCase} END,
              "netsuiteAmount" = CASE ${nsAmountCase} END,
              "amountMismatch" = CASE ${mismatchCase} END
            WHERE "id" IN (${idPlaceholders})
          `
          await prisma.$executeRawUnsafe(sql, ...sqlParams)

          if ((i / BATCH + 1) % 5 === 0 || i + BATCH >= updates.length) {
            console.log(`💾 Updated ${Math.min(i + BATCH, updates.length)}/${updates.length} transactions`)
          }
        }
      }

      return NextResponse.json({
        success: true,
        action: 'save',
        updated: updates.length,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('Error in netsuite-transactions:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process NetSuite transactions' },
      { status: 500 },
    )
  }
}
