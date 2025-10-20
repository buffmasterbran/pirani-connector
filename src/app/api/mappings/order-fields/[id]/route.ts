import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update an order field mapping
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { 
      mappingType, 
      shopifyCode, 
      shopifyValue, 
      netsuiteId, 
      applyToAllAccounts, 
      isActive,
      customFieldId 
    } = body
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    const mapping = await prisma.orderFieldMapping.update({
      where: { id },
      data: {
        ...(mappingType && { mappingType }),
        ...(shopifyCode !== undefined && { shopifyCode }),
        ...(shopifyValue !== undefined && { shopifyValue }),
        ...(netsuiteId && { netsuiteId }),
        ...(applyToAllAccounts !== undefined && { applyToAllAccounts }),
        ...(isActive !== undefined && { isActive }),
        ...(customFieldId !== undefined && { customFieldId })
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error updating order field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update order field mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an order field mapping
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    await prisma.orderFieldMapping.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete order field mapping' },
      { status: 500 }
    )
  }
}
