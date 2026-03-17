import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function POST(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { transactionId } = params
    const { netsuiteTransactionId, netsuiteTransactionName, netsuiteAmount, netsuiteTransactionType } = await request.json()

    if (!netsuiteTransactionId || !netsuiteTransactionName || netsuiteAmount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get the transaction to calculate amount mismatch
    const transaction = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      )
    }

    if (transaction.netsuiteTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction already has a NetSuite ID' },
        { status: 400 }
      )
    }

    // Calculate amount mismatch
    // NS payments reflect full invoice amount, so always compare on amount (not net)
    const shopifyAmount = transaction.amount || transaction.net || 0

    const netsuiteAmountNum = typeof netsuiteAmount === 'string' ? parseFloat(netsuiteAmount) : netsuiteAmount

    // Compare absolute values for amount difference
    const shopifyAmountAbs = Math.abs(shopifyAmount)
    const netsuiteAmountAbs = Math.abs(netsuiteAmountNum)
    const amountDiff = Math.abs(shopifyAmountAbs - netsuiteAmountAbs) > 0.01
    // Also flag if signs disagree (e.g., Shopify -44.53 vs NS +44.53)
    const signMismatch = shopifyAmount !== 0 && netsuiteAmountNum !== 0 &&
      ((shopifyAmount > 0) !== (netsuiteAmountNum > 0))
    const amountMismatch = amountDiff || signMismatch

    // Update the transaction
    await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        netsuiteTransactionId: String(netsuiteTransactionId),
        netsuiteTransactionName: netsuiteTransactionName,
        netsuiteTransactionType: netsuiteTransactionType || null,
        netsuiteAmount: netsuiteAmountNum,
        amountMismatch,
      },
    })

    logTransactionChange(transactionId, transaction.payoutId, 'add_netsuite', {
      netsuiteTransactionId,
      netsuiteTransactionName,
      netsuiteAmount: netsuiteAmountNum,
      amountMismatch,
    })

    return NextResponse.json({
      success: true,
      message: 'NetSuite transaction added successfully',
      warning: signMismatch
        ? `Sign mismatch: Shopify amount is ${shopifyAmount.toFixed(2)} but NS amount is ${netsuiteAmountNum.toFixed(2)}`
        : undefined,
      data: {
        transactionId,
        netsuiteTransactionId,
        netsuiteTransactionName,
        netsuiteAmount: netsuiteAmountNum,
        amountMismatch,
      },
    })
  } catch (error) {
    console.error('Error adding NetSuite transaction:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add NetSuite transaction',
      },
      { status: 500 }
    )
  }
}

