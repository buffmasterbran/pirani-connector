import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  filterValidTransactions,
  buildDepositItems,
  buildDropdownItems,
  buildOtherItems,
  buildDepositPayload,
} from '@/lib/deposit-helpers'

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

    // Use shared helpers to filter and classify transactions
    const transactionsWithNS = filterValidTransactions(payout.transactions)

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

    // Build deposit items using shared helper
    const depositItems = buildDepositItems(transactionsWithNS)

    if (depositItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid NetSuite transaction IDs found',
        },
        { status: 400 }
      )
    }

    // Calculate total fees from included transactions
    const totalFees = payout.transactions
      .filter((txn) => txn.includeInNetSuite !== false)
      .reduce((sum, txn) => {
        return sum + (txn.fee || 0)
      }, 0)

    // Get payout mappings and build dropdown items using shared helpers
    const payoutMappings = await prisma.payoutMapping.findMany({
      where: { isActive: true },
    })
    const includedTransactions = payout.transactions.filter(
      (txn) => txn.includeInNetSuite !== false
    )
    const dropdownItems = buildDropdownItems(includedTransactions, payoutMappings)
    const otherItems = buildOtherItems(totalFees, dropdownItems, '989')

    // Build the full deposit payload using shared helper
    const payoutDate = payout.payoutDate || new Date()
    const depositRequest = buildDepositPayload(
      payoutId,
      payoutDate.toISOString(),
      depositItems,
      otherItems,
    )

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
