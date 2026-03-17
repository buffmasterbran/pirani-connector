import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  filterValidTransactions,
  buildDepositItems,
  buildDropdownItems,
  buildOtherItems,
  buildDepositPayload,
  getUndepositedIds,
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

    // Validate deposit items against NetSuite (check for stale/already-deposited IDs)
    const allIds = depositItems.map(i => i.id)
    const { valid: validIds, skipped } = await getUndepositedIds(allIds)

    const notFound = skipped.filter(s => s.reason === 'Not found in NetSuite')
    const alreadyDeposited = skipped.filter(s => s.reason !== 'Not found in NetSuite')

    // Enrich not-found with DB info
    const notFoundDetails = notFound.map(s => {
      const dbTxn = payout.transactions.find(
        (t: any) => t.netsuiteTransactionId && parseInt(t.netsuiteTransactionId, 10) === s.id
      )
      return {
        nsId: s.id,
        tranid: s.tranid,
        nsName: dbTxn?.netsuiteTransactionName || null,
        nsType: dbTxn?.netsuiteTransactionType || null,
        shopifyOrderId: dbTxn?.shopifyOrderId || null,
        shopifyType: dbTxn?.type || null,
        amount: dbTxn?.amount ?? null,
      }
    })

    // Block if any NS IDs don't exist
    if (notFound.length > 0) {
      return NextResponse.json({
        success: false,
        error: `${notFound.length} transaction(s) reference NetSuite IDs that no longer exist. Fix these before pushing.`,
        notFound: notFoundDetails,
        skipped,
      }, { status: 400 })
    }

    const validDepositItems = depositItems.filter(i => validIds.has(i.id))

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
      validDepositItems,
      otherItems,
    )

    return NextResponse.json({
      success: true,
      depositRequest,
      stats: {
        totalTransactions: payout.transactions.length,
        transactionsWithNS: transactionsWithNS.length,
        totalFees,
        depositItemsCount: validDepositItems.length,
      },
      validation: {
        totalChecked: depositItems.length,
        valid: validDepositItems.length,
        skippedCount: skipped.length,
        alreadyDeposited: alreadyDeposited.length > 0 ? alreadyDeposited : undefined,
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
