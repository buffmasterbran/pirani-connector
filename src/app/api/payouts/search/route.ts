import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Search payout transactions by order name/number or shopify order ID.
 * Returns the payout IDs that contain matching transactions, plus match details.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    if (!q) {
      return NextResponse.json({ results: [] })
    }

    // Search for matching order lines by order name (e.g. "#57414" or "57414")
    const searchName = q.startsWith('#') ? q : `#${q}`
    const searchNameNoHash = q.replace(/^#/, '')

    // Find matching transactions via OrderLine join and direct shopifyOrderId match
    const matches: any[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT
         pt."payoutId",
         pt."shopifyOrderId",
         ol."shopifyOrderName",
         pt."amount",
         pt."type",
         pt."id" as "transactionId"
       FROM "PayoutTransaction" pt
       LEFT JOIN "OrderLine" ol ON pt."orderLineId" = ol."id"
       WHERE (
         ol."shopifyOrderName" ILIKE $1
         OR pt."shopifyOrderId" = $2
         OR pt."shopifyOrderId" LIKE $3
       )
       ORDER BY pt."payoutId" DESC
       LIMIT 100`,
      `%${searchNameNoHash}%`,
      searchNameNoHash,
      `%${searchNameNoHash}`,
    )

    // Group by payoutId
    const payoutMap = new Map<string, { payoutId: string; matches: any[] }>()
    for (const m of matches) {
      const existing = payoutMap.get(m.payoutId)
      const match = {
        transactionId: m.transactionId,
        shopifyOrderId: m.shopifyOrderId,
        orderName: m.shopifyOrderName || `#${m.shopifyOrderId}`,
        amount: m.amount,
        type: m.type,
      }
      if (existing) {
        existing.matches.push(match)
      } else {
        payoutMap.set(m.payoutId, { payoutId: m.payoutId, matches: [match] })
      }
    }

    return NextResponse.json({ results: [...payoutMap.values()] })
  } catch (error) {
    console.error('Error searching payout transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 },
    )
  }
}
