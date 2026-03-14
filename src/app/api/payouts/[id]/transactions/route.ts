import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toISO } from '@/lib/api-helpers'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    // Handle both sync and async params (Next.js 14 vs 15)
    const resolvedParams = params instanceof Promise ? await params : params
    const payoutId = resolvedParams.id
    
    if (!payoutId) {
      return NextResponse.json({ error: 'Payout ID is required' }, { status: 400 })
    }
    
    // Verify Prisma client is properly initialized (use type assertion to bypass TS errors if client is out of sync)
    const prismaClient = prisma as any
    if (!prismaClient || !prismaClient.payoutTransaction) {
      console.error('❌ Prisma client not properly initialized. payoutTransaction model not found.')
      console.error('Please stop the dev server and run: npx prisma generate')
      return NextResponse.json({ 
        error: 'Database client not initialized',
        details: 'Prisma client may need to be regenerated. Stop the server and run: npx prisma generate'
      }, { status: 500 })
    }
    
    // Fetch transactions with payout data and split children included
    const transactions = await prismaClient.payoutTransaction.findMany({
      where: { payoutId },
      orderBy: [{ processedAt: 'desc' }, { id: 'asc' }],
      include: {
        orderLine: true,
        payout: true,
        children: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    
    // Verify payout exists (check if we got any transactions or if payout exists)
    if (transactions.length === 0) {
      // Check if payout exists at all - use a simpler query without select
      const payoutExists = await prismaClient.payout.findUnique({
        where: { id: payoutId },
      })
      
      if (!payoutExists) {
        return NextResponse.json({ 
          error: `Payout ${payoutId} not found in database`,
          transactions: [],
          payoutTotalAmount: null,
          payoutCurrency: 'USD',
        }, { status: 404 })
      }
      
      // If payout exists but no transactions, return empty array with payout data
      return NextResponse.json({ 
        transactions: [],
        payoutTotalAmount: payoutExists.totalAmount ?? null,
        payoutCurrency: payoutExists.currency ?? 'USD',
      })
    }

    // Get all unique shopifyOrderIds that don't have orderLine relation
    const missingOrderIds = transactions
      .filter((t: any) => t.shopifyOrderId && !t.orderLine)
      .map((t: any) => t.shopifyOrderId!)
      .filter((id: string, index: number, self: string[]) => self.indexOf(id) === index) // unique

    // Lookup order names for transactions without orderLine relation
    const orderNameMap = new Map<string, { name: string; sourceName: string | null; appId: number | null }>()
    if (missingOrderIds.length > 0) {
      try {
        // Try to fetch with new fields first (if Prisma client is up to date)
        const orderLines = await prismaClient.orderLine.findMany({
          where: {
            shopifyOrderId: { in: missingOrderIds },
            isDeleted: false,
          },
          select: {
            shopifyOrderId: true,
            shopifyOrderName: true,
            sourceName: true,
            appId: true,
          },
        })
        
        for (const orderLine of orderLines) {
          orderNameMap.set(orderLine.shopifyOrderId, {
            name: orderLine.shopifyOrderName,
            sourceName: (orderLine as any).sourceName ?? null,
            appId: (orderLine as any).appId ?? null,
          })
        }
      } catch (error: any) {
        // If the above fails (Prisma client not regenerated), fetch without new fields
        if (error.message?.includes('sourceName') || error.message?.includes('appId') || error.message?.includes('Unknown arg')) {
          console.warn('⚠️ Prisma client not regenerated with new fields, falling back to basic query. Please run: npx prisma generate')
          const orderLines = await prismaClient.orderLine.findMany({
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
            orderNameMap.set(orderLine.shopifyOrderId, {
              name: orderLine.shopifyOrderName,
              sourceName: null,
              appId: null,
            })
          }
        } else {
          throw error
        }
      }
    }

    // Get payout data from transaction relation (should be available if transactions exist)
    const payoutData = transactions[0]?.payout

    const mapTransaction = (transaction: any) => {
      const orderLineData = transaction.orderLine
        ? {
            name: transaction.orderLine.shopifyOrderName,
            sourceName: (transaction.orderLine as any).sourceName ?? null,
            appId: (transaction.orderLine as any).appId ?? null,
            tags: (transaction.orderLine as any).tags ?? null,
          }
        : (transaction.shopifyOrderId ? orderNameMap.get(transaction.shopifyOrderId) : null)

      const orderName = orderLineData?.name ?? null
      const sourceName = orderLineData?.sourceName ?? null
      const appId = orderLineData?.appId ?? null
      const tags = (orderLineData as any)?.tags ?? null
      const isWebOrder = sourceName === 'web' || sourceName === 'checkout'
      const orderEdited = tags ? /orderediting/.test(tags) : false

      return {
        id: transaction.id,
        source_order_id: transaction.shopifyOrderId ?? 'N/A',
        order_name: orderName,
        source_name: sourceName,
        app_id: appId,
        is_web_order: isWebOrder,
        order_edited: orderEdited,
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
        otherFeesDescription: (transaction as any).otherFeesDescription ?? null,
        amountDescription: (transaction as any).amountDescription ?? null,
        feeDescription: (transaction as any).feeDescription ?? null,
        parentTransactionId: transaction.parentTransactionId ?? null,
        children: (transaction.children ?? []).map((child: any) => ({
          id: child.id,
          netsuiteTransactionId: child.netsuiteTransactionId ?? null,
          netsuiteTransactionName: child.netsuiteTransactionName ?? null,
          netsuiteAmount: child.netsuiteAmount ?? null,
          amount: child.amount ?? 0,
        })),
      }
    }

    // Only return top-level transactions (exclude children, they're nested under parents)
    const topLevelTransactions = transactions.filter((t: any) => !t.parentTransactionId)
    const payload = topLevelTransactions.map(mapTransaction)

    return NextResponse.json({ 
      transactions: payload,
      payoutTotalAmount: payoutData?.totalAmount ?? null,
      payoutCurrency: payoutData?.currency ?? 'USD',
    })
  } catch (error) {
    console.error('❌ Failed to load payout transactions', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = error instanceof Error ? error.stack : String(error)
    console.error('Error details:', errorDetails)
    return NextResponse.json({ 
      error: 'Failed to load payout transactions',
      details: errorMessage 
    }, { status: 500 })
  }
}
