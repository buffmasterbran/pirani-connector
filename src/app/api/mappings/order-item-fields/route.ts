import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { upsertMappings } from '@/lib/mapping-crud'

// GET - Fetch all order item field mappings
export async function GET() {
  try {
    const mappings = await prisma.orderItemFieldMapping.findMany({
      orderBy: {
        id: 'asc',
      },
    })

    // Convert to the format expected by the frontend
    const formattedMappings = mappings.map((m) => ({
      id: String(m.id),
      mappingType: m.mappingType,
      shopifyCode: m.shopifyCode || undefined,
      shopifyValue: m.shopifyValue || undefined,
      netsuiteId: m.netsuiteId,
      applyToAllAccounts: m.applyToAllAccounts,
      isActive: m.isActive,
      customFieldId: m.customFieldId || undefined,
    }))

    return NextResponse.json({ success: true, data: formattedMappings })
  } catch (error) {
    return handleApiError(error, 'GET orderItemFieldMapping')
  }
}

// POST - Create a new order item field mapping
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

    if (!netsuiteId) {
      return NextResponse.json(
        { success: false, error: 'netsuiteId is required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.orderItemFieldMapping.create({
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

    // Convert to the format expected by the frontend
    const formattedMapping = {
      id: String(mapping.id),
      mappingType: mapping.mappingType,
      shopifyCode: mapping.shopifyCode || undefined,
      shopifyValue: mapping.shopifyValue || undefined,
      netsuiteId: mapping.netsuiteId,
      applyToAllAccounts: mapping.applyToAllAccounts,
      isActive: mapping.isActive,
      customFieldId: mapping.customFieldId || undefined,
    }

    return NextResponse.json({ success: true, data: formattedMapping })
  } catch (error) {
    return handleApiError(error, 'POST orderItemFieldMapping')
  }
}

// PUT - Batch save/update order item field mappings
export async function PUT(request: NextRequest) {
  const body = await request.json()
  return upsertMappings(
    prisma.orderItemFieldMapping,
    body.mappings,
    (m) => ({
      mappingType: m.mappingType || 'Fixed',
      shopifyCode: m.shopifyCode || null,
      shopifyValue: m.shopifyValue || null,
      netsuiteId: m.netsuiteId,
      applyToAllAccounts: m.applyToAllAccounts ?? true,
      isActive: m.isActive ?? true,
      customFieldId: m.customFieldId || null,
    }),
    'orderItemFieldMapping',
    (m) => !!m.netsuiteId
  )
}
