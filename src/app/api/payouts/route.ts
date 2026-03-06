import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toISO } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payouts = await prisma.payout.findMany({
      orderBy: { payoutDate: 'desc' },
      include: {
        _count: { select: { transactions: true } },
      },
    })

    if (payouts.length === 0) {
      return NextResponse.json({ payouts: [] })
    }

    const payoutIds = payouts.map(p => p.id)

    let aggregates: any[] = []
    try {
      aggregates = await prisma.$queryRawUnsafe(
        `SELECT "payoutId",
                COALESCE(SUM("amount"), 0)::float AS "sumAmount",
                COALESCE(SUM("net"), 0)::float AS "sumNet"
         FROM "PayoutTransaction"
         WHERE "payoutId" = ANY($1::text[])
           AND "parentTransactionId" IS NULL
         GROUP BY "payoutId"`,
        payoutIds,
      )
    } catch {
      aggregates = await prisma.$queryRawUnsafe(
        `SELECT "payoutId",
                COALESCE(SUM("amount"), 0)::float AS "sumAmount",
                COALESCE(SUM("net"), 0)::float AS "sumNet"
         FROM "PayoutTransaction"
         WHERE "payoutId" = ANY($1::text[])
         GROUP BY "payoutId"`,
        payoutIds,
      )
    }

    const aggMap = new Map<string, { sumAmount: number; sumNet: number }>()
    for (const a of aggregates) {
      aggMap.set(a.payoutId, { sumAmount: Number(a.sumAmount), sumNet: Number(a.sumNet) })
    }

    const payload = payouts.map((payout) => {
      const agg = aggMap.get(payout.id) ?? { sumAmount: 0, sumNet: 0 }
      const expectedDepositAmount = agg.sumAmount
      const actualDepositAmount = agg.sumNet
      const varianceAmount = actualDepositAmount - expectedDepositAmount
      const payoutAmount = payout.totalAmount ?? actualDepositAmount

      return {
        id: payout.id,
        internalId: payout.id,
        shopifyPayoutId: payout.id,
        date: toISO(payout.payoutDate) ?? toISO(payout.updatedAt),
        amount: payoutAmount,
        currency: payout.currency ?? 'USD',
        status: payout.status ?? 'pending',
        expectedDepositAmount,
        actualDepositAmount,
        varianceAmount,
        transactionCount: (payout as any)._count?.transactions ?? 0,
        netsuiteDepositNumber: payout.netsuiteDepositId ?? null,
        netsuiteDepositId: payout.netsuiteDepositId ?? null,
        createdAt: toISO(payout.createdAt),
        updatedAt: toISO(payout.updatedAt),
        transactions: [],
      }
    })

    return NextResponse.json({ payouts: payload })
  } catch (error) {
    console.error('❌ Failed to load payouts', error)
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 })
  }
}
