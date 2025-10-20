import { NextResponse } from 'next/server'
import { getOrdersFromShopify } from '@/lib/shopify'

export async function GET(request: Request) {
  try {
    console.log('=== FETCHING ORDERS FROM SHOPIFY ===')
    const orders = await getOrdersFromShopify()
    console.log(`✅ Found ${orders.length} orders from Shopify`)
    
    return NextResponse.json({ orders })
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders from Shopify' },
      { status: 500 }
    )
  }
}
