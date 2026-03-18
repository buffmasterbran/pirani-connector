import { useMemo } from 'react'
import type { OrderSourceMapping } from './types'

interface TransactionLike {
  id: string
  source_order_id: string
  order_name?: string | null
  type: string
  amount: number
  currency: string
  processedAt: string | null
  netsuiteTransactionId?: string | null
  includeInNetSuite?: boolean
  amountDescription?: string | null
  parentTransactionId?: string | null
  adjustmentReason?: string | null
  order_edited?: boolean
  app_id?: number | null
  source_name?: string | null
}

export interface AutoProcessTransaction {
  id: string
  orderName: string
  sourceOrderId: string
  amount: number
  currency: string
  processedAt: string | null
  type: string
}

export interface AutoProcessOrder {
  orderName: string
  sourceOrderId: string
  transactions: AutoProcessTransaction[]
  isAlone: boolean
  groupSize: number // total txns for this order in payout (not just eligible)
}

export interface AutoProcessQueues {
  editedQueue: AutoProcessOrder[]
  marketplaceQueue: AutoProcessOrder[]
  editedCount: number
  marketplaceCount: number
}

function isMarketplaceSource(
  t: TransactionLike,
  mappings: OrderSourceMapping[]
): boolean {
  return mappings.some(m =>
    m.isActive && m.isTaxable === false && (
      (t.app_id && m.appId === t.app_id) ||
      (t.source_name && m.sourceName === t.source_name)
    )
  )
}

function buildQueue(
  eligible: TransactionLike[],
  allTransactions: TransactionLike[]
): AutoProcessOrder[] {
  // Group eligible by source_order_id
  const grouped = new Map<string, TransactionLike[]>()
  for (const t of eligible) {
    if (!t.source_order_id || t.source_order_id === 'N/A') continue
    const existing = grouped.get(t.source_order_id)
    if (existing) {
      existing.push(t)
    } else {
      grouped.set(t.source_order_id, [t])
    }
  }

  // Count all transactions per order in the full payout (for groupSize)
  const allCountByOrder = new Map<string, number>()
  for (const t of allTransactions) {
    if (!t.source_order_id || t.source_order_id === 'N/A') continue
    allCountByOrder.set(t.source_order_id, (allCountByOrder.get(t.source_order_id) || 0) + 1)
  }

  const orders: AutoProcessOrder[] = []

  for (const [sourceOrderId, txns] of grouped) {
    // Sort: charges first, then credits (charge creates invoice, credit just creates payment)
    txns.sort((a, b) => {
      if (a.type === 'charge' && b.type !== 'charge') return -1
      if (a.type !== 'charge' && b.type === 'charge') return 1
      return 0
    })

    const orderName = txns[0].order_name || `#${sourceOrderId}`
    const groupSize = allCountByOrder.get(sourceOrderId) || txns.length

    orders.push({
      orderName,
      sourceOrderId,
      transactions: txns.map(t => ({
        id: t.id,
        orderName: t.order_name || `#${t.source_order_id}`,
        sourceOrderId: t.source_order_id,
        amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0,
        currency: t.currency || 'USD',
        processedAt: t.processedAt,
        type: t.type,
      })),
      isAlone: groupSize === 1,
      groupSize,
    })
  }

  return orders
}

export function useAutoProcessData(
  transactions: TransactionLike[],
  orderSourceMappings: OrderSourceMapping[]
): AutoProcessQueues {
  return useMemo(() => {
    // Base eligibility
    const eligible = transactions.filter(t =>
      !t.netsuiteTransactionId &&
      t.includeInNetSuite !== false &&
      !t.amountDescription &&
      !t.parentTransactionId &&
      (t.type === 'charge' || t.type === 'credit')
    )

    const editedEligible = eligible.filter(t =>
      (t as any).order_edited === true &&
      !isMarketplaceSource(t, orderSourceMappings)
    )

    const marketplaceEligible = eligible.filter(t =>
      isMarketplaceSource(t, orderSourceMappings)
    )

    const editedQueue = buildQueue(editedEligible, transactions)
    const marketplaceQueue = buildQueue(marketplaceEligible, transactions)

    return {
      editedQueue,
      marketplaceQueue,
      editedCount: editedEligible.length,
      marketplaceCount: marketplaceEligible.length,
    }
  }, [transactions, orderSourceMappings])
}
