import { NextRequest, NextResponse } from 'next/server'
import { getTransactionsByPayout } from '@/lib/shopify'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const transactions = await getTransactionsByPayout(id)
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions from Shopify' },
      { status: 500 }
    )
  }
}
