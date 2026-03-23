import { generateOAuthHeader, buildSuiteQLUrl } from '@/lib/netsuite'

/**
 * Shared helper functions for deposit creation and preview routes.
 *
 * Both create-deposit and preview-deposit need the same logic to classify
 * transactions, build deposit items, resolve payout-mapping dropdowns, and
 * assemble the final NetSuite deposit payload.  Keeping that logic here
 * avoids duplication and ensures the two routes stay in sync.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositItem {
  deposit: boolean
  id: number
}

export interface OtherItem {
  description: string
  amount: number
  account: { id: string }
}

// ---------------------------------------------------------------------------
// Transaction classification helpers
// ---------------------------------------------------------------------------

/** Returns `true` when the NetSuite transaction name looks like a Cash Sale or Cash Refund. */
export function isCashSaleOrRefund(txnName: string): boolean {
  const name = (txnName || '').toUpperCase().trim()
  return (
    name.startsWith('CS') ||
    name.startsWith('RFND') ||
    name.includes('CASH SALE') ||
    name.includes('CASH REFUND')
  )
}

/** Returns `true` when the NetSuite transaction name looks like a Payment. */
export function isPaymentTransaction(txnName: string): boolean {
  const name = (txnName || '').toUpperCase().trim()
  return (
    name.startsWith('PYMT') ||
    name.startsWith('CUSTPYMT') ||
    name.includes('PAYMENT')
  )
}

// ---------------------------------------------------------------------------
// Transaction filtering
// ---------------------------------------------------------------------------

/**
 * From a full list of payout transactions, return only those that have a
 * non-empty NetSuite transaction ID and are not excluded (`includeInNetSuite`
 * is not `false`).
 */
export function filterValidTransactions(transactions: any[]): any[] {
  return transactions.filter(
    (txn: any) =>
      txn.netsuiteTransactionId &&
      txn.netsuiteTransactionId.trim() !== '' &&
      txn.includeInNetSuite !== false,
  )
}

// ---------------------------------------------------------------------------
// Deposit items
// ---------------------------------------------------------------------------

/**
 * Given the list of transactions that have valid NS IDs, build the
 * `payment.items` array for the deposit.  Transactions are included if they
 * are a cash sale / refund **or** a payment.  Duplicates (same NS ID) are
 * removed.
 */
export function buildDepositItems(transactions: any[]): DepositItem[] {
  const cashSalesAndRefunds = transactions.filter((txn: any) =>
    isCashSaleOrRefund(txn.netsuiteTransactionName || ''),
  )
  const payments = transactions.filter((txn: any) =>
    isPaymentTransaction(txn.netsuiteTransactionName || ''),
  )

  const allDepositTransactions = [...cashSalesAndRefunds, ...payments]

  return allDepositTransactions
    .map((txn: any) => {
      const idNum = parseInt(txn.netsuiteTransactionId!, 10)
      if (isNaN(idNum)) return null
      return { deposit: true, id: idNum } as DepositItem
    })
    .filter((item): item is DepositItem => item !== null)
    .filter((item, idx, arr) => idx === arr.findIndex((t) => t.id === item.id))
}

// ---------------------------------------------------------------------------
// Payout-mapping resolution
// ---------------------------------------------------------------------------

/**
 * Look up a payout mapping by its `netsuiteId` **or** its `description`.
 * Returns `null` when the value is falsy or no mapping matches.
 */
export function findPayoutMapping(
  value: string | null | undefined,
  mappings: any[],
): any | null {
  if (!value) return null
  return mappings.find(
    (m: any) => m.netsuiteId === value || m.description === value,
  ) || null
}

// ---------------------------------------------------------------------------
// Dropdown (other) items aggregation
// ---------------------------------------------------------------------------

/**
 * Walk every included transaction and aggregate amounts from the
 * `amountDescription` dropdown into a `Map` keyed by the resolved
 * NetSuite account ID.
 */
export function buildDropdownItems(
  transactions: any[],
  payoutMappings: any[],
): Map<string, { description: string; amount: number }> {
  const map = new Map<string, { description: string; amount: number }>()

  for (const txn of transactions) {
    // Skip for transactions that already have a NS cash sale/payment
    // — those go into payment.items via buildDepositItems, so adding their amount
    // here would double-count them in the deposit.
    const hasNsPaymentItem = txn.netsuiteTransactionId &&
      String(txn.netsuiteTransactionId).trim() !== '' &&
      (isCashSaleOrRefund(txn.netsuiteTransactionName || '') ||
       isPaymentTransaction(txn.netsuiteTransactionName || ''))

    if (txn.amountDescription && !hasNsPaymentItem) {
      const mapping = findPayoutMapping(txn.amountDescription, payoutMappings)
      if (mapping?.netsuiteId) {
        const e = map.get(mapping.netsuiteId) || { description: mapping.description || '', amount: 0 }
        e.amount += Number(txn.amount) || 0
        map.set(mapping.netsuiteId, e)
      }
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// "Other" items builder
// ---------------------------------------------------------------------------

/**
 * Build the `other.items` array for the deposit payload.
 *
 * - If `totalFees` is non-zero, a "Shopify Fees" line is added (always
 *   negative) using the provided `feesAccountId`.
 * - Any non-zero dropdown-aggregated items are appended afterwards.
 */
export function buildOtherItems(
  totalFees: number,
  dropdownItems: Map<string, { description: string; amount: number }>,
  feesAccountId: string,
): OtherItem[] {
  const otherItems: OtherItem[] = []

  if (totalFees !== 0) {
    otherItems.push({
      description: 'Shopify Fees',
      amount: totalFees < 0 ? totalFees : -Math.abs(totalFees),
      account: { id: feesAccountId },
    })
  }

  dropdownItems.forEach((item, netsuiteId) => {
    if (item.amount !== 0) {
      otherItems.push({
        description: item.description,
        amount: item.amount,
        account: { id: netsuiteId },
      })
    }
  })

  return otherItems
}

// ---------------------------------------------------------------------------
// Full deposit payload
// ---------------------------------------------------------------------------

/**
 * Assemble the complete deposit request object that NetSuite expects.
 *
 * The `other` section is only included when there are items in it.
 */
export function buildDepositPayload(
  payoutId: string,
  payoutDate: string,
  depositItems: DepositItem[],
  otherItems: OtherItem[],
): Record<string, any> {
  const body: Record<string, any> = {
    account: { id: '217' },
    trandate: payoutDate,
    memo: `Shopify payout ${payoutId}`,
    payment: { items: depositItems },
  }
  if (otherItems.length > 0) {
    body.other = { items: otherItems }
  }
  return body
}

// ---------------------------------------------------------------------------
// SuiteQL validation — check which NS IDs exist and their deposit status
// ---------------------------------------------------------------------------

interface TxnStatus { id: string; tranid: string; type: string; statusname: string; account: string }

export async function getUndepositedIds(ids: number[]): Promise<{
  valid: Set<number>
  skipped: Array<{ id: number; tranid: string; reason: string }>
}> {
  const SUITEQL_URL = buildSuiteQLUrl()
  const valid = new Set<number>()
  const skipped: Array<{ id: number; tranid: string; reason: string }> = []

  if (ids.length === 0) return { valid, skipped }

  const CHUNK_SIZE = 1000
  const found = new Map<number, TxnStatus>()

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const idList = chunk.join(',')
    const query = `SELECT Transaction.id, Transaction.tranid, Transaction.type, BUILTIN.DF(Transaction.status) AS statusname, Transaction.account FROM Transaction WHERE Transaction.id IN (${idList})`

    const authorization = generateOAuthHeader('POST', SUITEQL_URL)
    try {
      const res = await fetch(SUITEQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'transient',
          Authorization: authorization,
          Accept: 'application/json',
        },
        body: JSON.stringify({ q: query }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.warn(`⚠️ SuiteQL validation failed for chunk (${res.status}), skipping pre-check: ${errText.slice(0, 200)}`)
        ids.forEach(id => valid.add(id))
        return { valid, skipped: [] }
      }

      const data = await res.json() as { items?: TxnStatus[] }
      for (const item of data.items || []) {
        found.set(Number(item.id), item)
      }
    } catch (err) {
      console.warn('⚠️ SuiteQL validation error, skipping pre-check:', err)
      ids.forEach(id => valid.add(id))
      return { valid, skipped: [] }
    }
  }

  for (const id of ids) {
    const txn = found.get(id)
    if (!txn) {
      skipped.push({ id, tranid: '?', reason: 'Not found in NetSuite' })
    } else {
      const status = (txn.statusname || '').toLowerCase()
      if (status.includes('deposited') && !status.includes('not deposited')) {
        skipped.push({ id, tranid: txn.tranid, reason: `Already deposited (${txn.statusname})` })
      } else if (txn.account && txn.account !== '150') {
        // Account 150 = Undeposited Funds. Transactions posted directly to a bank
        // account (e.g., Chase Checking) bypass the deposit workflow and can't be included.
        skipped.push({ id, tranid: txn.tranid, reason: `Wrong account (not Undeposited Funds)` })
      } else {
        valid.add(id)
      }
    }
  }

  return { valid, skipped }
}
