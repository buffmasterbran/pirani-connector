import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update a payout mapping
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { mappingType, netsuiteId, description, isActive } = body
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    const mapping = await prisma.payoutMapping.update({
      where: { id },
      data: {
        ...(mappingType && { mappingType }),
        ...(netsuiteId !== undefined && { netsuiteId }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive })
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error updating payout mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update payout mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a payout mapping
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

    await prisma.payoutMapping.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payout mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete payout mapping' },
      { status: 500 }
    )
  }
}

