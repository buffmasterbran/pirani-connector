import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all order field mappings from database
export async function GET() {
  try {
    const mappings = await prisma.orderFieldMapping.findMany({
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
    console.error('Error fetching order field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch order field mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new order field mapping
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
        { status: 400 },
      )
    }

    const mapping = await prisma.orderFieldMapping.create({
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
    console.error('Error creating order field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create order field mapping' },
      { status: 500 }
    )
  }
}

// PUT - Batch save/update order field mappings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mappings } = body

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { success: false, error: 'mappings must be an array' },
        { status: 400 }
      )
    }

    const results = []

    for (const mapping of mappings) {
      const {
        id,
        mappingType,
        shopifyCode,
        shopifyValue,
        netsuiteId,
        applyToAllAccounts = true,
        isActive = true,
        customFieldId,
      } = mapping

      if (!netsuiteId) {
        console.warn(`Skipping mapping with missing netsuiteId:`, mapping)
        continue
      }

      // Check if ID starts with "temp-" (new mapping) or is a number (existing)
      if (id && id.toString().startsWith('temp-')) {
        // Create new mapping
        const newMapping = await prisma.orderFieldMapping.create({
          data: {
            mappingType: mappingType || 'Fixed',
            shopifyCode: shopifyCode || null,
            shopifyValue: shopifyValue || null,
            netsuiteId,
            applyToAllAccounts,
            isActive,
            customFieldId: customFieldId || null,
          },
        })
        results.push({
          oldId: id,
          newId: String(newMapping.id),
          action: 'created',
        })
      } else if (id) {
        // Update existing mapping
        const mappingId = parseInt(id.toString())
        if (!isNaN(mappingId)) {
          await prisma.orderFieldMapping.update({
            where: { id: mappingId },
            data: {
              mappingType: mappingType || 'Fixed',
              shopifyCode: shopifyCode !== undefined ? shopifyCode : null,
              shopifyValue: shopifyValue !== undefined ? shopifyValue : null,
              netsuiteId,
              applyToAllAccounts,
              isActive,
              customFieldId: customFieldId !== undefined ? customFieldId : null,
            },
          })
          results.push({
            id: String(mappingId),
            action: 'updated',
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} mappings`,
      results,
    })
  } catch (error) {
    console.error('Error batch saving order field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save order field mappings' },
      { status: 500 }
    )
  }
}