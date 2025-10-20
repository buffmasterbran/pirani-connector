import { NextResponse } from 'next/server'
import { getPayoutsFromShopify } from '@/lib/shopify'

export async function GET() {
  try {
    const payouts = await getPayoutsFromShopify()
    return NextResponse.json({ payouts })
  } catch (error) {
    console.error('Error fetching payouts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payouts from Shopify' },
      { status: 500 }
    )
  }
}
