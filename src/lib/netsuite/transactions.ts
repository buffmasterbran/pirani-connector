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

/**
 * Fetches NetSuite transaction IDs for cash sales, refunds, and payments
 * using SuiteQL instead of a RESTlet. Filters to only CashSale, CashRfnd,
 * and CustPymt — guarantees no Sales Orders leak through.
 */
export async function fetchNetSuiteTransactions(
  request: NetSuiteTransactionRequest
): Promise<NetSuiteResponse> {
  // Combine all order refs into a single list for one query
  const allRefs = [
    ...(request.cashsales || []),
    ...(request.refunds || []),
    ...(request.payments || []),
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
  const refList = uniqueRefs.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')

  const query = `
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
      AND Transaction.type IN ('CashSale', 'CashRfnd', 'CustPymt')
    ORDER BY Transaction.otherrefnum, Transaction.type
  `

  const data = await executeSuiteQL<SuiteQLTransactionRow>(query, 1000)

  // Classify results into the same shape the rest of the app expects
  const cashsales: NetSuiteCashSale[] = []
  const refunds: NetSuiteRefund[] = []
  const payments: NetSuitePayment[] = []

  for (const row of data.items || []) {
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
      case 'CustPymt':
        payments.push(mapped)
        break
    }
  }

  return {
    status: 'success',
    message: `Found ${cashsales.length} cash sales, ${payments.length} payments, and ${refunds.length} refunds.`,
    details: { cashsales, refunds, payments },
  }
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
