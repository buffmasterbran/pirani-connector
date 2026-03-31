import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'

/**
 * POST /api/tiktok/payouts/[id]/clear-deposit
 * Clear the NetSuite deposit reference so the payout can be re-deposited.
 * Does NOT delete the deposit in NetSuite — do that manually first.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payout = await prisma.tikTokPayout.findUnique({
      where: { id: params.id },
      select: { netsuiteDepositId: true },
    })

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    if (!payout.netsuiteDepositId) {
      return NextResponse.json({ error: 'No deposit to clear' }, { status: 400 })
    }

    const oldDepositId = payout.netsuiteDepositId

    await prisma.tikTokPayout.update({
      where: { id: params.id },
      data: {
        netsuiteDepositId: null,
        pushedToNsBy: null,
        pushedToNsAt: null,
      },
    })

    console.log(`[TikTok] Cleared deposit ${oldDepositId} from payout ${params.id}`)

    return NextResponse.json({
      success: true,
      clearedDepositId: oldDepositId,
    })
  } catch (error) {
    return handleApiError(error, `POST /api/tiktok/payouts/${params.id}/clear-deposit`)
  }
}
