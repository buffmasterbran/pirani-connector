import { NETSUITE_RESTLET_URL, NETSUITE_SCRIPT_ID, NETSUITE_DEPLOY_ID } from './constants'
import { generateOAuthHeader } from './oauth'
import type { NetSuiteTransactionRequest, NetSuiteResponse } from './types'

/**
 * Fetches NetSuite transaction IDs for cash sales, refunds, and payments
 */
export async function fetchNetSuiteTransactions(
  request: NetSuiteTransactionRequest
): Promise<NetSuiteResponse> {
  if (!NETSUITE_RESTLET_URL) {
    throw new Error('NETSUITE_RESTLET_URL environment variable is not set')
  }

  const url = `${NETSUITE_RESTLET_URL}?script=${NETSUITE_SCRIPT_ID}&deploy=${NETSUITE_DEPLOY_ID}`
  const authorization = generateOAuthHeader('POST', url)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      Accept: '*/*',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`NetSuite API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data as NetSuiteResponse
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
