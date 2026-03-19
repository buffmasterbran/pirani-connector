import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rules = await prisma.autoAssignRule.findMany({
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      include: { targetMapping: true },
    })

    // Fetch distinct values for condition dropdowns
    const [distinctTypes, distinctReasons, distinctSources] = await Promise.all([
      prisma.payoutTransaction.findMany({
        where: { type: { not: null } },
        select: { type: true },
        distinct: ['type'],
        orderBy: { type: 'asc' },
      }),
      prisma.payoutTransaction.findMany({
        where: { adjustmentReason: { not: null } },
        select: { adjustmentReason: true },
        distinct: ['adjustmentReason'],
        orderBy: { adjustmentReason: 'asc' },
      }),
      prisma.orderLine.findMany({
        where: { sourceName: { not: null } },
        select: { sourceName: true },
        distinct: ['sourceName'],
        orderBy: { sourceName: 'asc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: rules.map(r => ({
        id: r.id,
        name: r.name,
        conditionType: r.conditionType,
        conditionAdjustmentReason: r.conditionAdjustmentReason,
        conditionSourceName: r.conditionSourceName,
        targetField: r.targetField,
        targetMappingId: r.targetMappingId,
        targetMappingDescription: r.targetMapping.description || r.targetMapping.netsuiteId,
        priority: r.priority,
        isActive: r.isActive,
      })),
      conditionOptions: {
        types: distinctTypes.map(t => t.type!),
        adjustmentReasons: distinctReasons.map(r => r.adjustmentReason!),
        sourceNames: distinctSources.map(s => s.sourceName!),
      },
    })
  } catch (error) {
    return handleApiError(error, 'GET autoAssignRules')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, conditionType, conditionAdjustmentReason, conditionSourceName, targetField, targetMappingId, priority, isActive } = body

    if (!name || !targetField || !targetMappingId) {
      return NextResponse.json(
        { success: false, error: 'name, targetField, and targetMappingId are required' },
        { status: 400 }
      )
    }

    if (!['amountDescription', 'feeDescription', 'otherFeesDescription'].includes(targetField)) {
      return NextResponse.json(
        { success: false, error: 'targetField must be amountDescription, feeDescription, or otherFeesDescription' },
        { status: 400 }
      )
    }

    const rule = await prisma.autoAssignRule.create({
      data: {
        name,
        conditionType: conditionType || null,
        conditionAdjustmentReason: conditionAdjustmentReason || null,
        conditionSourceName: conditionSourceName || null,
        targetField,
        targetMappingId: parseInt(targetMappingId),
        priority: priority ?? 0,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: { targetMapping: true },
    })

    return NextResponse.json({ success: true, data: rule })
  } catch (error) {
    return handleApiError(error, 'POST autoAssignRule')
  }
}
