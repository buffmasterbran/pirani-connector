import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update a payment method mapping
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { shopifyCode, netsuiteId, isActive } = body
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    const mapping = await prisma.paymentMethodMapping.update({
      where: { id },
      data: {
        ...(shopifyCode && { shopifyCode }),
        ...(netsuiteId && { netsuiteId }),
        ...(isActive !== undefined && { isActive })
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error updating payment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update payment method mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a payment method mapping
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

    await prisma.paymentMethodMapping.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete payment method mapping' },
      { status: 500 }
    )
  }
}
