import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, toISO } from '@/lib/api-helpers'

/**
 * GET /api/tiktok/payouts/[id] — Get a single TikTok payout with all transactions
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payout = await prisma.tikTokPayout.findUnique({
      where: { id: params.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    return NextResponse.json({
      payout: {
        ...payout,
        payoutDate: toISO(payout.payoutDate),
        pushedToNsAt: toISO(payout.pushedToNsAt),
        createdAt: toISO(payout.createdAt),
        updatedAt: toISO(payout.updatedAt),
        transactions: payout.transactions.map(t => ({
          ...t,
          orderCreatedDate: toISO(t.orderCreatedDate),
          orderShipmentDate: toISO(t.orderShipmentDate),
          orderDeliveryDate: toISO(t.orderDeliveryDate),
          createdAt: toISO(t.createdAt),
        })),
      },
    })
  } catch (error) {
    return handleApiError(error, `GET /api/tiktok/payouts/${params.id}`)
  }
}
