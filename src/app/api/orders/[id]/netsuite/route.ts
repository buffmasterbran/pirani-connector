import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { netsuiteDepositNumber } = await request.json()
    const orderId = BigInt(params.id)
    
    console.log(`💾 Updating NetSuite ID for order ${params.id} to: ${netsuiteDepositNumber}`)
    
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { netsuiteDepositNumber }
    })
    
    console.log(`✅ Updated order ${params.id} NetSuite ID successfully`)
    
    return NextResponse.json({ 
      success: true, 
      order: {
        id: updatedOrder.id.toString(),
        netsuiteDepositNumber: updatedOrder.netsuiteDepositNumber
      }
    })
    
  } catch (error) {
    console.error('❌ Error updating order NetSuite ID:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update order NetSuite ID',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
