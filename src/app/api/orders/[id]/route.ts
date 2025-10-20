import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = BigInt(params.id)
    
    console.log(`🗑️ Deleting order ${params.id} from database...`)
    
    // Delete the order
    const deletedOrder = await prisma.order.delete({
      where: { id: orderId }
    })
    console.log(`✅ Deleted order ${params.id} from database`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully deleted order ${params.id}`,
      deletedOrder: params.id
    })
    
  } catch (error) {
    console.error('❌ Error deleting order:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete order from database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
