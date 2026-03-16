import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchNetSuiteTransactions } from '@/lib/netsuite'

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
  const customerRefunds: string[] = []

  for (const txn of transactionsNeedingNS) {
    const orderName =
      txn.orderLine?.shopifyOrderName ||
      (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)
    if (!orderName) continue

    const isCustomerRefund = txn.type === 'customerRefund' || txn.type === 'custrfnd' || txn.type?.toLowerCase() === 'customerrefund'
    const isRefund = txn.type === 'refund' || txn.type === 'cashRefund' || txn.amount === null || (txn.amount !== null && txn.amount < 0)
    const isPayment = txn.type === 'payment' || txn.type === 'custpymt' || txn.type?.toLowerCase().includes('payment')

    if (isCustomerRefund) customerRefunds.push(orderName)
    else if (isPayment) payments.push(orderName)
    else if (isRefund) refunds.push(orderName)
    else cashSales.push(orderName)
  }

  return { cashSales, refunds, payments, customerRefunds, transactionsNeedingNS }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const payoutId = resolvedParams.id

    const payoutOrNull = await loadPayoutData(payoutId)
    if (!payoutOrNull) {
      return NextResponse.json({ success: false, error: 'Payout not found' }, { status: 404 })
    }
    const payout = payoutOrNull

    const { cashSales, refunds, payments, customerRefunds, transactionsNeedingNS } = classifyTransactions(payout)

    if (transactionsNeedingNS.length === 0) {
      return NextResponse.json({ success: true, message: 'All transactions already have NetSuite IDs', updated: 0, errors: [] })
    }

    // Fetch all NetSuite transactions in a single call
    const payoutDate = payout.payoutDate || new Date()
    const nsRequest = {
      account: 217,
      memo: `Shopify payout ${payoutId.slice(-8)}`,
      date: payoutDate.toISOString().split('T')[0],
      cashsales: cashSales,
      refunds: refunds,
      payments: payments.length > 0 ? payments : undefined,
      customerRefunds: customerRefunds.length > 0 ? customerRefunds : undefined,
    }

    console.log(`📦 Fetching NS transactions: ${cashSales.length} CS, ${refunds.length} RF, ${payments.length} PM, ${customerRefunds.length} CR`)
    const nsResponse = await fetchNetSuiteTransactions(nsRequest)

    if (nsResponse.status !== 'success') {
      return NextResponse.json({ success: false, error: `NetSuite fetch failed: ${nsResponse.message}` }, { status: 500 })
    }

    const nsResults = {
      cashsales: nsResponse.details.cashsales,
      refunds: nsResponse.details.refunds,
      payments: nsResponse.details.payments || [],
      customerRefunds: nsResponse.details.customerRefunds || [],
    }

    console.log(`✅ NS results: ${nsResults.cashsales.length} CS, ${nsResults.refunds.length} RF, ${nsResults.payments.length} PM, ${nsResults.customerRefunds.length} CR`)
    if (nsResults.payments.length > 0) {
      console.log(`💳 Payments found:`, nsResults.payments.map(p => `${p.tranid} (ref: ${p.otherrefnum}, amt: ${p.amount})`).join(', '))
    }

    // Match NS results against DB transactions
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
    const isRefundTxn = (txn: typeof payout.transactions[0]) =>
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
    const matchedNsIds = new Set<number>()

    const matchNS = (
      nsItems: Array<{ id: number; tranid: string; otherrefnum: string; amount: number }>,
      filterFn: (txn: typeof payout.transactions[0]) => boolean,
      useAbsAmount: boolean,
    ) => {
      for (const nsItem of nsItems) {
        if (matchedNsIds.has(nsItem.id)) continue
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
          matchedNsIds.add(nsItem.id)
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

    matchNS(nsResults.cashsales, t => !isRefundTxn(t) && t.type !== 'customerRefund' && t.type !== 'custrfnd', false)
    matchNS(nsResults.refunds, t => isRefundTxn(t) && t.type !== 'customerRefund' && t.type !== 'custrfnd', true)
    matchNS(nsResults.customerRefunds, t => t.type === 'customerRefund' || t.type === 'custrfnd' || t.type?.toLowerCase() === 'customerrefund', true)
    // First try matching payments to payment-typed transactions
    const beforePaymentMatch = updates.length
    matchNS(nsResults.payments, t => t.type === 'payment' || t.type === 'custpymt' || (t.type?.toLowerCase().includes('payment') ?? false), true)
    console.log(`💳 Payment strict match: ${updates.length - beforePaymentMatch} matched`)
    // Fallback: match remaining payments to any unmatched transaction with the same order ref
    // This handles Shop Cash credits (type='credit') that need a NS payment
    const beforeFallback = updates.length
    matchNS(nsResults.payments, () => true, true)
    console.log(`💳 Payment fallback match: ${updates.length - beforeFallback} matched`)

    // Bulk update matched transactions in chunks (Postgres max 32767 bind vars, 6 per row)
    const UPDATE_CHUNK_SIZE = 4000
    if (updates.length > 0) {
      for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
        const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE)

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

        const ids = chunk.map(u => u.id)
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
        console.log(`💾 Updated ${i + chunk.length}/${updates.length} transactions`)
      }
    }

    return NextResponse.json({
      success: true,
      updated: updates.length,
      cashSalesMatched: nsResults.cashsales.length,
      refundsMatched: nsResults.refunds.length,
      paymentsMatched: nsResults.payments.length,
      customerRefundsMatched: nsResults.customerRefunds.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error in netsuite-transactions:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process NetSuite transactions' },
      { status: 500 },
    )
  }
}
