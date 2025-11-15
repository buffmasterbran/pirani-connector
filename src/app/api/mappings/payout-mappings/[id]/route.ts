import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update a payout mapping
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { mappingType, netsuiteId, description, isActive, isDefaultDepositAccount, isDefaultFeesAccount } = body
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    // If setting as default, unset all other defaults (regardless of mapping type)
    if (isDefaultDepositAccount === true) {
      await (prisma.payoutMapping.updateMany as any)({
        where: {
          id: { not: id }
        },
        data: {
          isDefaultDepositAccount: false
        }
      })
    }

    if (isDefaultFeesAccount === true) {
      await (prisma.payoutMapping.updateMany as any)({
        where: {
          id: { not: id }
        },
        data: {
          isDefaultFeesAccount: false
        }
      })
    }

    const mapping = await (prisma.payoutMapping.update as any)({
      where: { id },
      data: {
        ...(mappingType && { mappingType }),
        ...(netsuiteId !== undefined && { netsuiteId }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefaultDepositAccount !== undefined && { isDefaultDepositAccount }),
        ...(isDefaultFeesAccount !== undefined && { isDefaultFeesAccount })
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

