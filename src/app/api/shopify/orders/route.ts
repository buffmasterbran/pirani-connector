import { NextResponse } from 'next/server'
import { getOrdersFromShopify, getAllOrdersFromShopify } from '@/lib/shopify'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'
    const limit = searchParams.get('limit')
    
    console.log('=== FETCHING ORDERS FROM SHOPIFY ===')
    
    let orders
    if (all) {
      console.log('🔄 Fetching ALL orders with pagination...')
      const maxLimit = limit ? parseInt(limit) : undefined
      orders = await getAllOrdersFromShopify(maxLimit)
    } else {
      const orderLimit = limit ? parseInt(limit) : 250
      console.log(`📄 Fetching ${orderLimit} orders (single page)...`)
      orders = await getOrdersFromShopify(orderLimit)
    }
    
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
