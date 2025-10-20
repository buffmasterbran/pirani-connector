import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const { orders } = await request.json()
    
    console.log(`💾 Saving ${orders.length} orders to database...`)
    
    const savedOrders = []
    
    try {
      for (const order of orders) {
        try {
          // Check if order already exists
          const existingOrder = await prisma.order.findUnique({
            where: { id: BigInt(order.id) }
          })
          
          if (existingOrder) {
            console.log(`⚠️ Order ${order.id} already exists in database`)
            savedOrders.push({ ...order, inDatabase: true, addedToDatabaseAt: existingOrder.createdAt.toISOString() })
            continue
          }
          
          // Create the order
          const createdOrder = await prisma.order.create({
            data: {
              id: BigInt(order.id),
              name: order.name,
              financial_status: order.financial_status,
              fulfillment_status: order.fulfillment_status,
              total_price: Number(order.total_price),
              currency: order.currency,
              created_at: new Date(order.created_at),
              netsuiteDepositNumber: order.netsuiteDepositNumber || null,
            }
          })
          
          console.log(`✅ Saved order ${order.id} to database`)
          savedOrders.push({ 
            ...order, 
            inDatabase: true, 
            addedToDatabaseAt: createdOrder.createdAt.toISOString() 
          })
          
        } catch (orderError) {
          console.error(`❌ Failed to save order ${order.id}:`, orderError)
          savedOrders.push({ ...order, inDatabase: false })
        }
      }
      
      console.log(`💾 Successfully processed ${savedOrders.length} orders`)
      
      return NextResponse.json({ 
        success: true, 
        orders: savedOrders,
        message: `Processed ${savedOrders.length} orders`
      })
      
    } catch (dbError: any) {
      // If the table doesn't exist yet, return orders as not saved
      if (dbError.message && dbError.message.includes('no such table: Order')) {
        console.log('⚠️ Order table does not exist yet, marking orders as not saved')
        const notSavedOrders = orders.map(order => ({ ...order, inDatabase: false }))
        return NextResponse.json({ 
          success: false, 
          orders: notSavedOrders,
          message: 'Order table does not exist yet'
        })
      }
      throw dbError // Re-throw if it's a different error
    }
    
  } catch (error) {
    console.error('❌ Error saving orders:', error)
    return NextResponse.json(
      { 
        error: 'Failed to save orders to database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
