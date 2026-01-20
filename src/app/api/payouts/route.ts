import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const toISO = (date: Date | null | undefined) => (date ? date.toISOString() : null)

export async function GET() {
  try {
    // Debug: Log database connection info (sanitized)
    const dbUrl = process.env.DATABASE_URL || 'NOT_SET'
    const sanitizedDbUrl = dbUrl.replace(/:[^:@]+@/, ':****@') // Hide password
    console.log('🔍 [DEBUG] DATABASE_URL:', sanitizedDbUrl)
    console.log('🔍 [DEBUG] Environment:', process.env.NODE_ENV)
    
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

    console.log('🔍 [DEBUG] Raw payouts count from DB:', payouts.length)
    console.log('🔍 [DEBUG] Payout IDs found:', payouts.map(p => p.id).join(', '))
    
    if (payouts.length === 0) {
      console.warn('⚠️ [DEBUG] No payouts found in database!')
    }

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
          includeInNetSuite: transaction.includeInNetSuite ?? true,
          adjustmentReason: transaction.adjustmentReason ?? null,
          otherFeesDescription: transaction.otherFeesDescription ?? null,
          amountDescription: transaction.amountDescription ?? null,
          feeDescription: transaction.feeDescription ?? null,
        }
      })

      const expectedDepositAmount = transactions.reduce((acc, current) => acc + (current.amount ?? 0), 0)
      const actualDepositAmount = transactions.reduce((acc, current) => acc + (current.net ?? 0), 0)
      const varianceAmount = actualDepositAmount - expectedDepositAmount
      
      // Use Shopify's payout totalAmount if available, otherwise fall back to calculated actualDepositAmount
      const payoutAmount = payout.totalAmount ?? actualDepositAmount

      return {
        id: payout.id,
        internalId: payout.id,
        shopifyPayoutId: payout.id,
        date: toISO(payout.payoutDate) ?? toISO(payout.updatedAt),
        amount: payoutAmount,
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

    console.log('🔍 [DEBUG] Final payload count:', payload.length)
    console.log('🔍 [DEBUG] Final payload payout IDs:', payload.map(p => p.id).join(', '))
    
    const response = NextResponse.json({ payouts: payload })
    console.log('🔍 [DEBUG] Response status:', response.status)
    
    return response
  } catch (error) {
    console.error('❌ Failed to load payouts', error)
    console.error('❌ [DEBUG] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 })
  }
}
