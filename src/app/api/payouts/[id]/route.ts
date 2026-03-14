import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id
    const body = await request.json()

    // Clear netsuiteDepositId if requested
    if (body.clearNetsuiteDepositId === true) {
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          netsuiteDepositId: null,
          pushedToNsBy: null,
          pushedToNsAt: null,
        },
      })

      return NextResponse.json({
        success: true,
        message: `Successfully cleared NetSuite deposit ID for payout ${payoutId}`,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  } catch (error) {
    console.error('❌ Error updating payout:', error)
    return NextResponse.json(
      {
        error: 'Failed to update payout',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    console.log(`🗑️ Deleting payout ${payoutId} and its transactions from database...`)

    const deletedTransactions = await prisma.payoutTransaction.deleteMany({
      where: { payoutId },
    })

    const deletedPayout = await prisma.payout.delete({
      where: { id: payoutId },
    })

    await prisma.orderLine.updateMany({
      where: { shopifyPayoutId: payoutId },
      data: {
        shopifyPayoutId: null,
        shopifyPayoutStatus: null,
        expectedPayoutAmount: null,
        actualDepositAmount: null,
        varianceAmount: null,
        depositCreatedAt: null,
      },
    })

    console.log(`✅ Deleted payout ${payoutId} from database`)

    return NextResponse.json({
      success: true,
      message: `Successfully deleted payout ${payoutId} and ${deletedTransactions.count} transactions`,
      deletedPayout: deletedPayout.id,
      deletedTransactions: deletedTransactions.count,
    })
  } catch (error) {
    console.error('❌ Error deleting payout:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete payout from database',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
