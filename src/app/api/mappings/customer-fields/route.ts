import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { getMappings, upsertMappings } from '@/lib/mapping-crud'

export async function GET() {
  return getMappings(prisma.customerFieldMapping, 'customerFieldMapping', {
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      mappingType = 'Fixed',
      shopifyCode,
      shopifyValue,
      netsuiteId,
      applyToAllAccounts = true,
      isActive = true,
      customFieldId,
    } = body

    if (!netsuiteId || (!shopifyCode && !shopifyValue && mappingType !== 'Fixed')) {
      return NextResponse.json(
        { success: false, error: 'netsuiteId and either shopifyCode or shopifyValue are required (unless Fixed type)' },
        { status: 400 },
      )
    }

    const newMapping = await prisma.customerFieldMapping.create({
      data: {
        mappingType,
        shopifyCode: shopifyCode || null,
        shopifyValue: shopifyValue || null,
        netsuiteId,
        applyToAllAccounts,
        isActive,
        customFieldId: customFieldId || null,
      },
    })

    return NextResponse.json({ success: true, data: newMapping })
  } catch (error) {
    return handleApiError(error, 'POST customerFieldMapping')
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  return upsertMappings(
    prisma.customerFieldMapping,
    body.mappings,
    (m) => ({
      mappingType: m.mappingType || 'Fixed',
      shopifyCode: m.shopifyCode || null,
      shopifyValue: m.shopifyValue || null,
      netsuiteId: m.netsuiteId,
      applyToAllAccounts: typeof m.applyToAllAccounts === 'boolean' ? m.applyToAllAccounts : undefined,
      isActive: typeof m.isActive === 'boolean' ? m.isActive : undefined,
      customFieldId: m.customFieldId || null,
    }),
    'customerFieldMapping',
    (m) => !!(m.netsuiteId && (m.shopifyCode || m.shopifyValue || m.mappingType === 'Fixed'))
  )
}
