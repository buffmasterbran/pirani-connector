import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logTransactionChange } from '@/lib/audit-log'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { otherFeesDescription } = await request.json()
    const transactionId = params.transactionId

    if (otherFeesDescription === undefined) {
      return NextResponse.json(
        { success: false, error: 'otherFeesDescription is required' },
        { status: 400 }
      )
    }

    const before = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
      select: { otherFeesDescription: true, payoutId: true },
    })

    const transaction = await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        otherFeesDescription: otherFeesDescription || null,
      },
    })

    logTransactionChange(transactionId, transaction.payoutId, 'set_other_fees_desc', {
      before: before?.otherFeesDescription ?? null,
      after: otherFeesDescription || null,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: transaction.id,
        otherFeesDescription: transaction.otherFeesDescription,
      },
    })
  } catch (error) {
    console.error('Error updating other fees description:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update other fees description' },
      { status: 500 }
    )
  }
}

