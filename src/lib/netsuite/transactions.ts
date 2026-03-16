import { executeSuiteQL } from './suiteql'
import type { NetSuiteTransactionRequest, NetSuiteResponse, NetSuiteCashSale, NetSuiteRefund, NetSuitePayment } from './types'

interface SuiteQLTransactionRow {
  id: string
  tranid: string
  otherrefnum: string
  entityname: string
  foreigntotal: string
  type: string
  typename: string
}

// Max values in a single IN (...) clause to stay within SQL limits
const IN_CLAUSE_CHUNK_SIZE = 900
// SuiteQL returns max 1000 rows per request
const SUITEQL_PAGE_SIZE = 1000

/**
 * Run a single SuiteQL query for a chunk of order refs, paginating through
 * all results if there are more than 1000 rows.
 */
async function fetchChunk(refList: string): Promise<SuiteQLTransactionRow[]> {
  const baseQuery = `
    SELECT
      Transaction.id,
      Transaction.tranid,
      Transaction.otherrefnum,
      BUILTIN.DF(Transaction.entity) AS entityname,
      Transaction.foreigntotal,
      Transaction.type,
      BUILTIN.DF(Transaction.type) AS typename
    FROM Transaction
    WHERE Transaction.otherrefnum IN (${refList})
      AND Transaction.type IN ('CashSale', 'CashRfnd', 'CustPymt', 'CustRfnd')
    ORDER BY Transaction.otherrefnum, Transaction.type
  `

  const allRows: SuiteQLTransactionRow[] = []
  let offset = 0

  while (true) {
    const data = await executeSuiteQL<SuiteQLTransactionRow>(baseQuery, SUITEQL_PAGE_SIZE, offset)
    const items = data.items || []
    allRows.push(...items)

    // If we got fewer than the page size, we've fetched everything
    if (items.length < SUITEQL_PAGE_SIZE || !data.hasMore) break
    offset += SUITEQL_PAGE_SIZE
  }

  return allRows
}

/**
 * Fetches NetSuite transaction IDs for cash sales, refunds, and payments
 * using SuiteQL instead of a RESTlet. Filters to only CashSale, CashRfnd,
 * and CustPymt — guarantees no Sales Orders leak through.
 *
 * Handles large payouts by chunking the IN clause and paginating results.
 */
export async function fetchNetSuiteTransactions(
  request: NetSuiteTransactionRequest
): Promise<NetSuiteResponse> {
  // Combine all order refs into a single list for one query
  const allRefs = [
    ...(request.cashsales || []),
    ...(request.refunds || []),
    ...(request.payments || []),
    ...(request.customerRefunds || []),
  ]

  if (allRefs.length === 0) {
    return {
      status: 'success',
      message: 'No order references provided.',
      details: { cashsales: [], refunds: [], payments: [] },
    }
  }

  // Deduplicate and escape single quotes for SQL
  const uniqueRefs = [...new Set(allRefs)]

  // Chunk refs to stay within SQL IN clause limits, fetch each chunk in parallel
  const chunks: string[][] = []
  for (let i = 0; i < uniqueRefs.length; i += IN_CLAUSE_CHUNK_SIZE) {
    chunks.push(uniqueRefs.slice(i, i + IN_CLAUSE_CHUNK_SIZE))
  }

  const allRows: SuiteQLTransactionRow[] = []
  for (const chunk of chunks) {
    const refList = chunk.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')
    const rows = await fetchChunk(refList)
    allRows.push(...rows)
  }

  // Classify results into the same shape the rest of the app expects
  const cashsales: NetSuiteCashSale[] = []
  const refunds: NetSuiteRefund[] = []
  const payments: NetSuitePayment[] = []
  const customerRefunds: NetSuiteRefund[] = []
  const paymentIdsSeen = new Set<number>()

  for (const row of allRows) {
    const mapped = {
      id: Number(row.id),
      tranid: row.tranid,
      otherrefnum: row.otherrefnum,
      entity: row.entityname || '',
      amount: Number(row.foreigntotal),
      type: row.typename || row.type,
    }

    switch (row.type) {
      case 'CashSale':
        cashsales.push(mapped)
        break
      case 'CashRfnd':
        refunds.push(mapped)
        break
      case 'CustRfnd':
        customerRefunds.push(mapped)
        break
      case 'CustPymt':
        payments.push(mapped)
        paymentIdsSeen.add(mapped.id)
        break
    }
  }

  // --- Find payments applied to invoices (for payments without otherrefnum) ---
  // Step 1: Find invoices by otherrefnum
  // Step 2: Find payments linked to those invoices via NextTransactionLineLink
  try {
    const invoicePayments = await fetchPaymentsViaInvoices(uniqueRefs, paymentIdsSeen)
    if (invoicePayments.length > 0) {
      console.log(`🔍 Found ${invoicePayments.length} additional payment(s) via invoice links`)
      payments.push(...invoicePayments)
    }
  } catch (error) {
    console.error('⚠️ Error fetching payments via invoices (non-critical):', error)
  }

  return {
    status: 'success',
    message: `Found ${cashsales.length} cash sales, ${payments.length} payments, ${refunds.length} cash refunds, and ${customerRefunds.length} customer refunds.`,
    details: { cashsales, refunds, payments, customerRefunds },
  }
}

/**
 * Find payments applied to invoices that match the given order refs.
 * This catches payments that don't have otherrefnum set (e.g., manually created).
 *
 * 1. Find invoices by otherrefnum
 * 2. Use NextTransactionLineLink to find payments applied to those invoices
 * 3. Return payments not already in paymentIdsSeen
 */
async function fetchPaymentsViaInvoices(
  orderRefs: string[],
  paymentIdsSeen: Set<number>
): Promise<NetSuitePayment[]> {
  if (orderRefs.length === 0) return []

  const results: NetSuitePayment[] = []

  // Chunk the order refs for the invoice query
  for (let i = 0; i < orderRefs.length; i += IN_CLAUSE_CHUNK_SIZE) {
    const chunk = orderRefs.slice(i, i + IN_CLAUSE_CHUNK_SIZE)
    const refList = chunk.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')

    // Step 1: Find invoices
    const invoiceQuery = `
      SELECT Transaction.id, Transaction.otherrefnum
      FROM Transaction
      WHERE Transaction.otherrefnum IN (${refList})
        AND Transaction.type = 'CustInvc'
    `
    const invoiceData = await executeSuiteQL<{ id: string; otherrefnum: string }>(invoiceQuery)
    const invoices = invoiceData.items || []

    if (invoices.length === 0) continue

    // Build a map of invoice ID → otherrefnum so we can tag payments with the order ref
    const invoiceRefMap = new Map<string, string>()
    for (const inv of invoices) {
      invoiceRefMap.set(inv.id, inv.otherrefnum)
    }

    const invoiceIds = invoices.map(inv => inv.id).join(', ')

    // Step 2: Find payments linked to these invoices
    const paymentQuery = `
      SELECT
        t.id,
        t.tranid,
        BUILTIN.DF(t.entity) AS entityname,
        t.foreigntotal,
        ntll.previousDoc AS invoiceId
      FROM NextTransactionLineLink ntll
        JOIN Transaction t ON t.id = ntll.nextDoc
      WHERE ntll.previousDoc IN (${invoiceIds})
        AND t.type = 'CustPymt'
    `
    const paymentData = await executeSuiteQL<{
      id: string
      tranid: string
      entityname: string
      foreigntotal: string
      invoiceid: string
    }>(paymentQuery)

    for (const row of paymentData.items || []) {
      const id = Number(row.id)
      if (paymentIdsSeen.has(id)) continue // Already found via otherrefnum
      paymentIdsSeen.add(id)

      // Tag with the invoice's otherrefnum so matching works
      const otherrefnum = invoiceRefMap.get(row.invoiceid) || ''

      results.push({
        id,
        tranid: row.tranid,
        otherrefnum,
        entity: row.entityname || '',
        amount: Number(row.foreigntotal),
        type: 'Customer Payment',
      })
    }
  }

  return results
}

/**
 * Matches NetSuite transactions to PayoutTransactions by order name
 */
export function matchNetSuiteTransactions(
  transactions: Array<{ order_name?: string | null; type?: string | null }>,
  netsuiteData: NetSuiteResponse
): Map<string, { id: number; tranid: string; amount: number; type: string }> {
  const matches = new Map()

  for (const transaction of transactions) {
    const orderName = transaction.order_name
    if (!orderName || orderName === '—' || orderName === 'N/A') continue

    const cashSale = netsuiteData.details.cashsales.find(
      (cs) => cs.otherrefnum === orderName
    )
    if (cashSale) {
      matches.set(transaction.order_name!, {
        id: cashSale.id,
        tranid: cashSale.tranid,
        amount: cashSale.amount,
        type: 'Cash Sale',
      })
      continue
    }

    const refund = netsuiteData.details.refunds.find(
      (rf) => rf.otherrefnum === orderName
    )
    if (refund) {
      matches.set(transaction.order_name!, {
        id: refund.id,
        tranid: refund.tranid,
        amount: refund.amount,
        type: 'Cash Refund',
      })
      continue
    }

    if (netsuiteData.details.customerRefunds) {
      const customerRefund = netsuiteData.details.customerRefunds.find(
        (cr) => cr.otherrefnum === orderName
      )
      if (customerRefund) {
        matches.set(transaction.order_name!, {
          id: customerRefund.id,
          tranid: customerRefund.tranid,
          amount: customerRefund.amount,
          type: 'Customer Refund',
        })
        continue
      }
    }

    if (netsuiteData.details.payments) {
      const payment = netsuiteData.details.payments.find(
        (pmt) => pmt.otherrefnum === orderName
      )
      if (payment) {
        matches.set(transaction.order_name!, {
          id: payment.id,
          tranid: payment.tranid,
          amount: payment.amount,
          type: 'Payment',
        })
      }
    }
  }

  return matches
}
