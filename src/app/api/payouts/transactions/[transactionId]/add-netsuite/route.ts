import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function POST(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { transactionId } = params
    const { netsuiteTransactionId, netsuiteTransactionName, netsuiteAmount } = await request.json()

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
    
    // Compare absolute values for payments (amounts can be negative)
    const shopifyAmountAbs = Math.abs(shopifyAmount)
    const netsuiteAmountAbs = Math.abs(netsuiteAmountNum)
    const amountMismatch = Math.abs(shopifyAmountAbs - netsuiteAmountAbs) > 0.01 // Allow 1 cent tolerance

    // Update the transaction
    await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        netsuiteTransactionId: String(netsuiteTransactionId),
        netsuiteTransactionName: netsuiteTransactionName,
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

