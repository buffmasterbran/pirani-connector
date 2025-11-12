import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const toISO = (date: Date | null | undefined) => (date ? date.toISOString() : null)

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const transactions = await prisma.payoutTransaction.findMany({
      where: { payoutId: params.id },
      orderBy: [{ processedAt: 'desc' }, { id: 'asc' }],
      include: {
        orderLine: true,
        payout: true,
      },
    })

    // Get all unique shopifyOrderIds that don't have orderLine relation
    const missingOrderIds = transactions
      .filter(t => t.shopifyOrderId && !t.orderLine)
      .map(t => t.shopifyOrderId!)
      .filter((id, index, self) => self.indexOf(id) === index) // unique

    // Lookup order names for transactions without orderLine relation
    const orderNameMap = new Map<string, string>()
    if (missingOrderIds.length > 0) {
      const orderLines = await prisma.orderLine.findMany({
        where: {
          shopifyOrderId: { in: missingOrderIds },
          isDeleted: false,
        },
        select: {
          shopifyOrderId: true,
          shopifyOrderName: true,
        },
      })
      
      for (const orderLine of orderLines) {
        orderNameMap.set(orderLine.shopifyOrderId, orderLine.shopifyOrderName)
      }
    }

    const payout = transactions[0]?.payout
    
    const payload = transactions.map((transaction) => {
      // Try to get order name from relation first, then fallback to lookup map
      const orderName = transaction.orderLine?.shopifyOrderName 
        ?? (transaction.shopifyOrderId ? orderNameMap.get(transaction.shopifyOrderId) : null)
        ?? null

      return {
        id: transaction.id,
        source_order_id: transaction.shopifyOrderId ?? 'N/A',
        order_name: orderName,
        amount: transaction.amount ?? 0,
        fee: transaction.fee ?? 0,
        net: transaction.net ?? 0,
        type: transaction.type ?? transaction.payout?.type ?? 'charge',
        currency: transaction.currency ?? transaction.payout?.currency ?? 'USD',
        processedAt: toISO(transaction.processedAt),
        netsuiteTransactionId: transaction.netsuiteTransactionId ?? null,
        netsuiteTransactionName: transaction.netsuiteTransactionName ?? null,
        netsuiteAmount: transaction.netsuiteAmount ?? null,
        amountMismatch: transaction.amountMismatch ?? false,
        includeInNetSuite: transaction.includeInNetSuite ?? true,
        adjustmentReason: transaction.adjustmentReason ?? null,
      }
    })

    return NextResponse.json({ 
      transactions: payload,
      payoutTotalAmount: payout?.totalAmount ?? null,
      payoutCurrency: payout?.currency ?? 'USD',
    })
  } catch (error) {
    console.error('❌ Failed to load payout transactions', error)
    return NextResponse.json({ error: 'Failed to load payout transactions' }, { status: 500 })
  }
}
