import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'Invalid rule ID' }, { status: 400 })
    }

    const body = await request.json()
    const { name, conditionType, conditionAdjustmentReason, conditionSourceName, targetField, targetMappingId, priority, isActive } = body

    const rule = await prisma.autoAssignRule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(conditionType !== undefined && { conditionType: conditionType || null }),
        ...(conditionAdjustmentReason !== undefined && { conditionAdjustmentReason: conditionAdjustmentReason || null }),
        ...(conditionSourceName !== undefined && { conditionSourceName: conditionSourceName || null }),
        ...(targetField !== undefined && { targetField }),
        ...(targetMappingId !== undefined && { targetMappingId: parseInt(targetMappingId) }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { targetMapping: true },
    })

    return NextResponse.json({ success: true, data: rule })
  } catch (error) {
    console.error('Error updating auto-assign rule:', error)
    return NextResponse.json({ success: false, error: 'Failed to update rule' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'Invalid rule ID' }, { status: 400 })
    }

    await prisma.autoAssignRule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting auto-assign rule:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete rule' }, { status: 500 })
  }
}
