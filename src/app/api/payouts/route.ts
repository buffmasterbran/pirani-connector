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

    // Compute match status for each payout:
    // - Count transactions missing NS IDs (excluding payout-type and dropdown-assigned)
    // - Compare Shopify net total vs NetSuite amount total
    let matchStats: any[] = []
    try {
      matchStats = await prisma.$queryRawUnsafe(
        `SELECT
           "payoutId",
           COUNT(*) FILTER (
             WHERE "includeInNetSuite" = true
               AND "type" != 'payout'
               AND "amountDescription" IS NULL
               AND ("netsuiteTransactionId" IS NULL OR "netsuiteTransactionId" = '')
               AND "parentTransactionId" IS NULL
           )::int AS "missingNsCount",
           COALESCE(SUM("amount") FILTER (WHERE "includeInNetSuite" = true AND "parentTransactionId" IS NULL), 0)::float AS "shopifyTotal",
           COALESCE(SUM(CASE
             WHEN "netsuiteAmount" IS NOT NULL THEN "netsuiteAmount"
             ELSE "amount"
           END) FILTER (WHERE "includeInNetSuite" = true AND "parentTransactionId" IS NULL), 0)::float AS "nsTotal"
         FROM "PayoutTransaction"
         WHERE "payoutId" = ANY($1::text[])
         GROUP BY "payoutId"`,
        payoutIds,
      )
    } catch (err) {
      console.warn('⚠️ Match status query failed, skipping:', err)
    }

    const matchMap = new Map<string, { missingNsCount: number; matched: boolean }>()
    for (const m of matchStats) {
      const missing = Number(m.missingNsCount) || 0
      const shopifyTotal = Number(m.shopifyTotal) || 0
      const nsTotal = Number(m.nsTotal) || 0
      const amountsMatch = Math.abs(shopifyTotal - nsTotal) < 0.01
      matchMap.set(m.payoutId, { missingNsCount: missing, matched: missing === 0 && amountsMatch })
    }

    const payload = payouts.map((payout) => {
      const agg = aggMap.get(payout.id) ?? { sumAmount: 0, sumNet: 0 }
      const match = matchMap.get(payout.id) ?? { missingNsCount: 0, matched: false }
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
        pushedToNsBy: (payout as any).pushedToNsBy ?? null,
        pushedToNsAt: (payout as any).pushedToNsAt ? toISO((payout as any).pushedToNsAt) : null,
        createdAt: toISO(payout.createdAt),
        updatedAt: toISO(payout.updatedAt),
        matchStatus: match.matched ? 'matched' : 'mismatch',
        missingNsCount: match.missingNsCount,
        transactions: [],
      }
    })

    return NextResponse.json({ payouts: payload })
  } catch (error) {
    console.error('❌ Failed to load payouts', error)
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 })
  }
}
