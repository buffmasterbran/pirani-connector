import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchShopifyPayouts, fetchShopifyPayoutTransactions } from '@/lib/shopify'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')

    const limit = limitParam ? Number(limitParam) : 50
    const { payouts } = await fetchShopifyPayouts(limit)

    return NextResponse.json({ payouts })
  } catch (error) {
    console.error('❌ Failed to fetch Shopify payouts', error)
    return NextResponse.json({ error: 'Failed to fetch payouts from Shopify' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number }
    const limit = body.limit ?? 50
    const { payouts } = await fetchShopifyPayouts(limit)

    if (!payouts.length) {
      return NextResponse.json({ imported: 0, message: 'No payouts retrieved from Shopify.' })
    }

    let payoutsProcessed = 0
    let transactionsProcessed = 0

    for (const payout of payouts) {
      const payoutId = String(payout.id)
      const payoutData = {
        status: payout.status ?? null,
        currency: payout.currency ?? null,
        totalAmount: payout.amount !== undefined ? Number(payout.amount) : null,
        payoutDate: payout.arrival_date ? new Date(payout.arrival_date) : null,
        type: payout.type ?? payout.payout_type ?? null,
      }

      await prisma.payout.upsert({
        where: { id: payoutId },
        update: payoutData,
        create: {
          id: payoutId,
          ...payoutData,
        },
      })

      payoutsProcessed += 1

      const { transactions = [] } = await fetchShopifyPayoutTransactions(payoutId)

      for (const transaction of transactions) {
        const transactionId = String(transaction.id)
        const shopifyOrderId = transaction.source_order_id ? String(transaction.source_order_id) : null
        const amount = transaction.amount !== undefined ? Number(transaction.amount) : null
        const net = transaction.net !== undefined ? Number(transaction.net) : null
        const fee = transaction.fee !== undefined ? Number(transaction.fee) : null
        const processedAt = transaction.processed_at ? new Date(transaction.processed_at) : null
        const adjustmentReason = transaction.adjustment_reason ? String(transaction.adjustment_reason) : null

        let orderLineId: number | null = null
        if (shopifyOrderId) {
          const orderLine = await prisma.orderLine.findFirst({
            where: { shopifyOrderId, isDeleted: false },
            select: { id: true },
          })
          orderLineId = orderLine?.id ?? null
        }

        await prisma.payoutTransaction.upsert({
          where: { id: transactionId },
          update: {
            payoutId,
            shopifyOrderId,
            orderLineId,
            amount,
            net,
            fee,
            type: transaction.type ?? null,
            currency: transaction.currency ?? payout.currency ?? null,
            processedAt,
            adjustmentReason,
          },
          create: {
            id: transactionId,
            payoutId,
            shopifyOrderId,
            orderLineId,
            amount,
            net,
            fee,
            type: transaction.type ?? null,
            currency: transaction.currency ?? payout.currency ?? null,
            processedAt,
            adjustmentReason,
          },
        })

        if (orderLineId && shopifyOrderId) {
          await prisma.orderLine.updateMany({
            where: { shopifyOrderId },
            data: {
              shopifyPayoutId: payoutId,
              shopifyPayoutStatus: payout.status ?? null,
              expectedPayoutAmount: amount,
              actualDepositAmount: net,
              varianceAmount: amount !== null && net !== null ? net - amount : null,
              depositCreatedAt: processedAt ?? payoutData.payoutDate,
              syncedShopifyAt: new Date(),
            },
          })
        }

        transactionsProcessed += 1
      }
    }

    return NextResponse.json({ payoutsProcessed, transactionsProcessed })
  } catch (error) {
    console.error('❌ Failed to import Shopify payouts', error)
    return NextResponse.json({ error: 'Failed to import Shopify payouts' }, { status: 500 })
  }
}
