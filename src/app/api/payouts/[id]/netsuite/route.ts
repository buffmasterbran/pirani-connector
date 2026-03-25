import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id
    const { netsuiteDepositNumber } = await request.json()

    console.log(`💾 Setting NetSuite deposit ID for payout ${payoutId} to: ${netsuiteDepositNumber}`)

    await prisma.payout.update({
      where: { id: payoutId },
      data: { netsuiteDepositId: netsuiteDepositNumber || null },
    })

    return NextResponse.json({
      success: true,
      message: `Updated NetSuite deposit ID for payout ${payoutId}`,
    })
  } catch (error) {
    console.error('❌ Error updating payout NetSuite ID:', error)
    return NextResponse.json(
      {
        error: 'Failed to update payout NetSuite ID',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
