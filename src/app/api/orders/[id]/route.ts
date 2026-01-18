import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shopifyOrderId = params.id
    
    console.log(`🗑️ Deleting order ${shopifyOrderId} from database...`)
    
    // Soft delete all order lines for this order
    const deletedLines = await prisma.orderLine.updateMany({
      where: { shopifyOrderId, isDeleted: false },
      data: { isDeleted: true }
    })
    
    console.log(`✅ Soft deleted ${deletedLines.count} order line(s) for order ${shopifyOrderId}`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully deleted order ${shopifyOrderId}`,
      deletedCount: deletedLines.count
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
