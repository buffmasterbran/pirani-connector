import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sourceTransactionIds, targetTransactionId } = body

    if (!Array.isArray(sourceTransactionIds) || sourceTransactionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Source transaction IDs must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!targetTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Target transaction ID is required' },
        { status: 400 }
      )
    }

    if (sourceTransactionIds.includes(targetTransactionId)) {
      return NextResponse.json(
        { success: false, error: 'Target transaction cannot be in source transactions list' },
        { status: 400 }
      )
    }

    // Fetch all transactions
    const allTransactionIds = [...sourceTransactionIds, targetTransactionId]
    const transactions = await prisma.payoutTransaction.findMany({
      where: {
        id: { in: allTransactionIds },
      },
    })

    if (transactions.length !== allTransactionIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more transactions not found' },
        { status: 404 }
      )
    }

    const targetTransaction = transactions.find(t => t.id === targetTransactionId)
    if (!targetTransaction) {
      return NextResponse.json(
        { success: false, error: 'Target transaction not found' },
        { status: 404 }
      )
    }

    const sourceTransactions = transactions.filter(t => sourceTransactionIds.includes(t.id))

    // Validate all transactions are from the same order (optional but recommended)
    const orderIds = new Set([
      ...sourceTransactions.map(t => t.shopifyOrderId).filter(Boolean),
      targetTransaction.shopifyOrderId,
    ])
    if (orderIds.size > 1) {
      return NextResponse.json(
        { success: false, error: 'All transactions must be from the same order' },
        { status: 400 }
      )
    }

    // Calculate combined totals
    const combinedAmount = sourceTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) + (targetTransaction.amount || 0)
    const combinedFee = sourceTransactions.reduce((sum, t) => sum + (t.fee || 0), 0) + (targetTransaction.fee || 0)
    const combinedNet = sourceTransactions.reduce((sum, t) => sum + (t.net || 0), 0) + (targetTransaction.net || 0)

    // Determine which NetSuite data to keep (prefer target's, fallback to source's if target doesn't have one)
    let netsuiteTransactionId = targetTransaction.netsuiteTransactionId
    let netsuiteTransactionName = targetTransaction.netsuiteTransactionName
    let netsuiteAmount = targetTransaction.netsuiteAmount

    // If target doesn't have NetSuite ID but a source does, use the source's
    if (!netsuiteTransactionId) {
      const sourceWithNetSuite = sourceTransactions.find(t => t.netsuiteTransactionId)
      if (sourceWithNetSuite) {
        netsuiteTransactionId = sourceWithNetSuite.netsuiteTransactionId
        netsuiteTransactionName = sourceWithNetSuite.netsuiteTransactionName
        netsuiteAmount = sourceWithNetSuite.netsuiteAmount
      }
    }

    // Recalculate amountMismatch after merge
    let amountMismatch = false
    if (netsuiteAmount !== null && netsuiteAmount !== undefined) {
      amountMismatch = Math.abs(combinedAmount - Math.abs(netsuiteAmount)) > 0.01
    }

    // Combine dropdown descriptions (prefer target's, fallback to source's)
    let amountDescription = targetTransaction.amountDescription
    let feeDescription = targetTransaction.feeDescription
    let otherFeesDescription = targetTransaction.otherFeesDescription

    if (!amountDescription) {
      const sourceWithAmountDesc = sourceTransactions.find(t => t.amountDescription)
      if (sourceWithAmountDesc) amountDescription = sourceWithAmountDesc.amountDescription
    }

    if (!feeDescription) {
      const sourceWithFeeDesc = sourceTransactions.find(t => t.feeDescription)
      if (sourceWithFeeDesc) feeDescription = sourceWithFeeDesc.feeDescription
    }

    if (!otherFeesDescription) {
      const sourceWithOtherFeesDesc = sourceTransactions.find(t => t.otherFeesDescription)
      if (sourceWithOtherFeesDesc) otherFeesDescription = sourceWithOtherFeesDesc.otherFeesDescription
    }

    // Update target transaction with combined data
    await prisma.payoutTransaction.update({
      where: { id: targetTransactionId },
      data: {
        amount: combinedAmount,
        fee: combinedFee,
        net: combinedNet,
        netsuiteTransactionId,
        netsuiteTransactionName,
        netsuiteAmount,
        amountMismatch,
        amountDescription,
        feeDescription,
        otherFeesDescription,
        // Keep target's includeInNetSuite unless all sources are excluded
        includeInNetSuite: targetTransaction.includeInNetSuite !== false,
      },
    })

    // Delete source transactions
    await prisma.payoutTransaction.deleteMany({
      where: {
        id: { in: sourceTransactionIds },
      },
    })

    logTransactionChange(targetTransactionId, targetTransaction.payoutId, 'merge', {
      sourceTransactionIds,
      before: {
        target: { amount: targetTransaction.amount, fee: targetTransaction.fee, net: targetTransaction.net },
        sources: sourceTransactions.map(t => ({ id: t.id, type: t.type, amount: t.amount, fee: t.fee, net: t.net })),
      },
      after: { amount: combinedAmount, fee: combinedFee, net: combinedNet },
    })

    return NextResponse.json({
      success: true,
      message: `Successfully merged ${sourceTransactionIds.length} transaction(s) into target transaction`,
      mergedTransaction: {
        id: targetTransactionId,
        amount: combinedAmount,
        fee: combinedFee,
        net: combinedNet,
      },
    })
  } catch (error) {
    console.error('Error merging transactions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge transactions',
      },
      { status: 500 }
    )
  }
}

