import { NextRequest, NextResponse } from 'next/server'
import { fetchShopifyPayoutTransactions, fetchShopifyPayoutTransactionsPage } from '@/lib/shopify'

export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const paginated = searchParams.get('paginated') === 'true'
    const cursor = searchParams.get('cursor') || undefined

    if (paginated) {
      const { transactions, nextCursor } = await fetchShopifyPayoutTransactionsPage(id, cursor)
      return NextResponse.json({ transactions, nextCursor })
    }

    const { transactions } = await fetchShopifyPayoutTransactions(id)
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('❌ Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions from Shopify' },
      { status: 500 },
    )
  }
}
