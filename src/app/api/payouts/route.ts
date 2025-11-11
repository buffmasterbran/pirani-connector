import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const toISO = (date: Date | null | undefined) => (date ? date.toISOString() : null)

export async function GET() {
  try {
    const payouts = await prisma.payout.findMany({
      orderBy: { payoutDate: 'desc' },
      include: {
        transactions: {
          include: {
            orderLine: true,
          },
        },
      },
    })

    // Get all unique shopifyOrderIds from all transactions that don't have orderLine relation
    const missingOrderIds = new Set<string>()
    for (const payout of payouts) {
      for (const transaction of payout.transactions) {
        if (transaction.shopifyOrderId && !transaction.orderLine) {
          missingOrderIds.add(transaction.shopifyOrderId)
        }
      }
    }

    // Lookup order names for transactions without orderLine relation
    const orderNameMap = new Map<string, string>()
    if (missingOrderIds.size > 0) {
      const orderLines = await prisma.orderLine.findMany({
        where: {
          shopifyOrderId: { in: Array.from(missingOrderIds) },
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

    const payload = payouts.map((payout) => {
      const transactions = payout.transactions.map((transaction) => {
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
          type: transaction.type ?? 'charge',
          currency: transaction.currency ?? payout.currency ?? 'USD',
          processedAt: toISO(transaction.processedAt),
          netsuiteTransactionId: transaction.netsuiteTransactionId ?? null,
          netsuiteTransactionName: transaction.netsuiteTransactionName ?? null,
          netsuiteAmount: transaction.netsuiteAmount ?? null,
          amountMismatch: transaction.amountMismatch ?? false,
        }
      })

      const expectedDepositAmount = transactions.reduce((acc, current) => acc + (current.amount ?? 0), 0)
      const actualDepositAmount = transactions.reduce((acc, current) => acc + (current.net ?? 0), 0)
      const varianceAmount = actualDepositAmount - expectedDepositAmount

      return {
        id: payout.id,
        internalId: payout.id,
        shopifyPayoutId: payout.id,
        date: toISO(payout.payoutDate) ?? toISO(payout.updatedAt),
        amount: actualDepositAmount,
        currency: payout.currency ?? 'USD',
        status: payout.status ?? 'pending',
        expectedDepositAmount,
        actualDepositAmount,
        varianceAmount,
        netsuiteDepositNumber: payout.netsuiteDepositId ?? null,
        netsuiteDepositId: payout.netsuiteDepositId ?? null,
        createdAt: toISO(payout.createdAt),
        updatedAt: toISO(payout.updatedAt),
        transactions,
      }
    })

    return NextResponse.json({ payouts: payload })
  } catch (error) {
    console.error('❌ Failed to load payouts', error)
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 })
  }
}
