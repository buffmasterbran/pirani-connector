import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    console.log('=== FETCHING SAVED ORDERS FROM DATABASE ===')
    
    // Try to fetch orders, but handle the case where the Order table might not exist yet
    let orders = []
    
    try {
      orders = await prisma.order.findMany({
        orderBy: {
          created_at: 'desc'
        }
      })
      console.log(`✅ Found ${orders.length} saved orders in database`)
    } catch (dbError: any) {
      // If the table doesn't exist yet, return empty array
      if (dbError.message && dbError.message.includes('no such table: Order')) {
        console.log('⚠️ Order table does not exist yet, returning empty array')
        return NextResponse.json({ orders: [] })
      }
      throw dbError // Re-throw if it's a different error
    }
    
    // Convert BigInt to string for JSON serialization
    const serializedOrders = orders.map(order => ({
      id: order.id.toString(),
      name: order.name,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      total_price: order.total_price,
      currency: order.currency,
      created_at: order.created_at.toISOString(),
      netsuiteDepositNumber: order.netsuiteDepositNumber,
      inDatabase: true,
      addedToDatabaseAt: order.createdAt.toISOString()
    }))
    
    return NextResponse.json({ orders: serializedOrders })
  } catch (error) {
    console.error('❌ Error fetching orders from database:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders from database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
