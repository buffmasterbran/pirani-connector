import { NextResponse } from 'next/server'
import { getOrderByNameFromShopify } from '@/lib/shopify'

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const orderName = decodeURIComponent(params.name)
    console.log(`=== FETCHING ORDER BY NAME: ${orderName} ===`)
    console.log(`Raw params:`, params)
    console.log(`Decoded order name:`, orderName)
    
    const order = await getOrderByNameFromShopify(orderName)
    
    if (order) {
      console.log(`✅ Found order ${orderName} from Shopify:`, order.name)
      return NextResponse.json({ order })
    } else {
      console.log(`❌ Order ${orderName} not found`)
      return NextResponse.json(
        { error: `Order ${orderName} not found` },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error fetching order by name from Shopify:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order from Shopify' },
      { status: 500 }
    )
  }
}
