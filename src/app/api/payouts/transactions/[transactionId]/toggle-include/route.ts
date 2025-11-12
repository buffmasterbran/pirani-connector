import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    const transactionId = params.transactionId
    const body = await request.json()
    const { includeInNetSuite } = body

    if (typeof includeInNetSuite !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'includeInNetSuite must be a boolean' },
        { status: 400 }
      )
    }

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

    // Update includeInNetSuite flag
    await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: {
        includeInNetSuite,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Transaction ${includeInNetSuite ? 'included' : 'excluded'} from NetSuite matching`,
    })
  } catch (error) {
    console.error('Error toggling includeInNetSuite:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

