import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { payout, transactions, orderDetails } = await request.json()
    
    console.log('=== SAVING PAYOUT ===')
    console.log('Payout ID:', payout?.id)
    console.log('Payout Amount:', payout?.amount)
    console.log('Transactions Count:', transactions?.length)
    
    // Debug: Check for null values in transactions
    if (transactions?.length > 0) {
      const nullIds = transactions.filter(t => !t.id).length
      const nullSourceIds = transactions.filter(t => !t.source_order_id).length
      const nullDates = transactions.filter(t => !t.processed_at).length
      console.log(`🔍 Transaction data check: ${nullIds} null IDs, ${nullSourceIds} null source_order_ids, ${nullDates} null dates`)
    }
    
    // Check if payout already exists
    const existingPayout = await prisma.payout.findUnique({
      where: { id: BigInt(payout.id) }
    })
    
    if (existingPayout) {
      console.log('❌ Payout already exists, skipping save')
      return NextResponse.json({ 
        message: 'Payout already exists', 
        payout: existingPayout 
      })
    }

    // Create payout and transactions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the payout
      const createdPayout = await tx.payout.create({
        data: {
          id: BigInt(payout.id),
          status: payout.status,
          date: new Date(payout.date),
          amount: Number(payout.amount),
          currency: payout.currency,
        },
      })

      // Create the transactions (filter out any with null IDs)
      const validTransactions = transactions.filter((transaction: any) => 
        transaction.id && transaction.source_order_id && transaction.processed_at
      )
      
      console.log(`📊 Filtered ${validTransactions.length} valid transactions out of ${transactions.length} total`)
      
      const createdTransactions = await Promise.all(
        validTransactions.map((transaction: any) =>
          tx.transaction.create({
            data: {
              id: BigInt(transaction.id),
              payoutId: BigInt(payout.id),
              sourceOrderId: BigInt(transaction.source_order_id),
              amount: Number(transaction.amount),
              fee: Number(transaction.fee),
              net: Number(transaction.net),
              type: transaction.type,
              currency: transaction.currency,
              processedAt: new Date(transaction.processed_at),
            },
          })
        )
      )

      return { payout: createdPayout, transactions: createdTransactions }
    })

    console.log('✅ Successfully saved payout and transactions to database')

    // Convert BigInt values to strings for JSON serialization
    const serializedPayout = {
      ...result.payout,
      id: result.payout.id.toString(),
    }

    const serializedTransactions = result.transactions.map(transaction => ({
      ...transaction,
      id: transaction.id.toString(),
      payoutId: transaction.payoutId.toString(),
      sourceOrderId: transaction.sourceOrderId.toString(),
    }))

    return NextResponse.json({
      message: 'Payout and transactions saved successfully',
      payout: serializedPayout,
      transactions: serializedTransactions,
    })
  } catch (error) {
    console.error('❌ Detailed error saving payout:', error)
    console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { 
        error: 'Failed to save payout and transactions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
