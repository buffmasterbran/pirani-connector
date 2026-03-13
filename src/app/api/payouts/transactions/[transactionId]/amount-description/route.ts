import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { transactionId } = params
    const { amountDescription } = await request.json()

    const before = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
      select: { amountDescription: true, payoutId: true },
    })

    const updatedTransaction = await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        amountDescription: amountDescription || null,
      },
    })

    logTransactionChange(transactionId, updatedTransaction.payoutId, 'set_amount_desc', {
      before: before?.amountDescription ?? null,
      after: amountDescription || null,
    })

    return NextResponse.json({ success: true, data: updatedTransaction })
  } catch (error) {
    console.error('Error updating amount description:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update amount description' },
      { status: 500 }
    )
  }
}


