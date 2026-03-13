import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { transactionId } = params
    const { feeDescription } = await request.json()

    const before = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
      select: { feeDescription: true, payoutId: true },
    })

    const updatedTransaction = await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        feeDescription: feeDescription || null,
      },
    })

    logTransactionChange(transactionId, updatedTransaction.payoutId, 'set_fee_desc', {
      before: before?.feeDescription ?? null,
      after: feeDescription || null,
    })

    return NextResponse.json({ success: true, data: updatedTransaction })
  } catch (error) {
    console.error('Error updating fee description:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update fee description' },
      { status: 500 }
    )
  }
}


