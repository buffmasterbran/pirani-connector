import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch a specific payment method mapping
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const mapping = await prisma.paymentMethodMapping.findUnique({
      where: { id: parseInt(params.id) }
    })

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: 'Payment method mapping not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error fetching payment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment method mapping' },
      { status: 500 }
    )
  }
}

// PUT - Update a payment method mapping
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { shopifyCode, netsuiteId, isActive } = body

    const mapping = await prisma.paymentMethodMapping.update({
      where: { id: parseInt(params.id) },
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
    await prisma.paymentMethodMapping.delete({
      where: { id: parseInt(params.id) }
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
