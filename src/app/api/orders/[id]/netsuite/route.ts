import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { netsuiteDepositNumber } = await request.json()
    const shopifyOrderId = params.id
    
    console.log(`💾 Updating NetSuite deposit ID for order ${shopifyOrderId} to: ${netsuiteDepositNumber}`)
    
    const updatedLines = await prisma.orderLine.updateMany({
      where: { shopifyOrderId, isDeleted: false },
      data: { netsuiteDepositId: netsuiteDepositNumber || null }
    })
    
    console.log(`✅ Updated ${updatedLines.count} order line(s) for order ${shopifyOrderId}`)
    
    return NextResponse.json({ 
      success: true, 
      updatedCount: updatedLines.count
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
