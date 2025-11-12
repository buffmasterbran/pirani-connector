import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    // Get payout with all transactions
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        transactions: {
          orderBy: {
            processedAt: 'asc',
          },
        },
      },
    })

    if (!payout) {
      return NextResponse.json(
        { success: false, error: 'Payout not found' },
        { status: 404 }
      )
    }

    // Get ALL transactions with NetSuite IDs (both charges and refunds) that are included
    const transactionsWithNS = payout.transactions.filter(
      (txn) => 
        txn.netsuiteTransactionId && 
        txn.netsuiteTransactionId.trim() !== '' &&
        (txn.includeInNetSuite !== false)
    )

    if (transactionsWithNS.length === 0) {
      const totalTransactions = payout.transactions.length
      return NextResponse.json(
        {
          success: false,
          error: `No transactions with NetSuite IDs found. Found ${totalTransactions} total transaction(s).`,
        },
        { status: 400 }
      )
    }

    // Calculate total fees (negative amount for "other" items) - only from included transactions
    const totalFees = payout.transactions
      .filter((txn) => txn.includeInNetSuite !== false)
      .reduce((sum, txn) => {
        return sum + (txn.fee || 0)
      }, 0)

    // Prepare deposit request
    const payoutDate = payout.payoutDate || new Date()
    
    // Get ALL NetSuite transaction IDs (both charges and refunds) - convert string to number
    // All transactions go into payment.items with deposit: true
    const depositItems = transactionsWithNS
      .map((txn) => {
        const nsId = txn.netsuiteTransactionId
        if (!nsId) return null
        const idNum = parseInt(nsId, 10)
        if (isNaN(idNum)) {
          return null
        }
        // All transactions (charges and refunds) are included as deposit items
        return { deposit: true, id: idNum }
      })
      .filter((item): item is { deposit: true; id: number } => item !== null)
      // Remove duplicates (in case same NetSuite transaction ID appears multiple times)
      .filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      )

    if (depositItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid NetSuite transaction IDs found',
        },
        { status: 400 }
      )
    }

    const depositRequest = {
      account: { id: '217' }, // Default account ID
      trandate: payoutDate.toISOString(),
      memo: `Shopify payout ${payoutId.slice(-8)}`,
      payment: {
        items: depositItems,
      },
    }

    // Add fees if there are any (always as negative value)
    if (totalFees !== 0) {
      depositRequest.other = {
        items: [
          {
            description: 'Shopify Fees',
            amount: totalFees < 0 ? totalFees : -Math.abs(totalFees), // Ensure negative
            account: { id: '989' }, // Fees account
          },
        ],
      }
    }

    return NextResponse.json({
      success: true,
      depositRequest,
      stats: {
        totalTransactions: payout.transactions.length,
        transactionsWithNS: transactionsWithNS.length,
        totalFees,
        depositItemsCount: depositItems.length,
      },
    })
  } catch (error) {
    console.error('❌ Error previewing NetSuite deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to preview NetSuite deposit',
      },
      { status: 500 }
    )
  }
}

