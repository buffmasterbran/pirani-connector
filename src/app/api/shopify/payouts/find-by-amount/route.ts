import { NextRequest, NextResponse } from 'next/server'
import { fetchAllShopifyPayouts } from '@/lib/shopify/payouts'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const amountStr = searchParams.get('amount')

    if (!amountStr) {
      return NextResponse.json({ error: 'amount parameter is required' }, { status: 400 })
    }

    const targetAmount = parseFloat(amountStr.replace(/,/g, ''))
    if (isNaN(targetAmount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Fetch all payouts from Shopify (paginated)
    const { payouts } = await fetchAllShopifyPayouts()

    // Deduplicate (since_id pagination can return overlapping results)
    const seen = new Set<string>()
    const uniquePayouts = payouts.filter(p => {
      const id = String(p.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

    // Filter by amount (exact match on cents to avoid floating point issues)
    const targetCents = Math.round(targetAmount * 100)
    const matches = uniquePayouts.filter(p => {
      const payoutCents = Math.round(parseFloat(p.amount) * 100)
      return payoutCents === targetCents
    })

    // Check which ones are already in the database
    const matchIds = matches.map((p: any) => String(p.id))
    const existingPayouts = await prisma.payout.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, netsuiteDepositId: true },
    })
    const existingMap = new Map(existingPayouts.map(p => [p.id, p]))

    const results = matches.map((p: any) => {
      const existing = existingMap.get(String(p.id))
      return {
        id: String(p.id),
        status: p.status,
        amount: parseFloat(p.amount),
        currency: p.currency,
        date: p.date,
        inDatabase: !!existing,
        netsuiteDepositId: existing?.netsuiteDepositId || null,
      }
    })

    // Sort by date descending (most recent first)
    results.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      success: true,
      amount: targetAmount,
      totalPayoutsFetched: uniquePayouts.length,
      matchCount: results.length,
      results,
    })
  } catch (error) {
    console.error('Error finding payouts by amount:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search payouts' },
      { status: 500 },
    )
  }
}
