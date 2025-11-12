import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const { transactionId } = params
    const { feeDescription } = await request.json()

    const updatedTransaction = await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        feeDescription: feeDescription || null,
      },
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


