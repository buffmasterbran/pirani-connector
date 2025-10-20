import { NextResponse } from 'next/server'
import { getPayoutsFromShopify, getAllPayoutsFromShopify } from '@/lib/shopify'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'
    const limit = searchParams.get('limit')
    
    console.log('=== FETCHING PAYOUTS FROM SHOPIFY ===')
    
    let payouts
    if (all) {
      console.log('🔄 Fetching ALL payouts with pagination...')
      const maxLimit = limit ? parseInt(limit) : undefined
      payouts = await getAllPayoutsFromShopify(maxLimit)
    } else {
      const payoutLimit = limit ? parseInt(limit) : 250
      console.log(`📄 Fetching ${payoutLimit} payouts (single page)...`)
      payouts = await getPayoutsFromShopify(payoutLimit)
    }
    
    console.log(`✅ Found ${payouts.length} payouts from Shopify`)
    
    return NextResponse.json({ payouts })
  } catch (error) {
    console.error('Error fetching payouts from Shopify:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payouts from Shopify' },
      { status: 500 }
    )
  }
}
