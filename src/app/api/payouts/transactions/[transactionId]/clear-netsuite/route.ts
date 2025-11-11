import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const transactionId = params.transactionId

    // Verify transaction exists
    const transaction = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      )
    }

    // Clear NetSuite-related fields
    await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        netsuiteTransactionId: null,
        netsuiteTransactionName: null,
        netsuiteAmount: null,
        amountMismatch: false,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'NetSuite transaction data cleared successfully',
    })
  } catch (error) {
    console.error('Error clearing NetSuite transaction data:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

