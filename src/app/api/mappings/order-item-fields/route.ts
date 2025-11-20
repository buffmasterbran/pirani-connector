import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    console.error('Error fetching order item field mappings:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch order item field mappings',
      },
      { status: 500 }
    )
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
    console.error('Error creating order item field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create order item field mapping' },
      { status: 500 }
    )
  }
}

// PUT - Batch save/update order item field mappings
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
      } = mapping as any

      if (!netsuiteId) {
        console.warn(`Skipping mapping with missing netsuiteId:`, mapping)
        continue
      }

      // Check if ID starts with "temp-" (new mapping) or is a number (existing)
      if (id && id.toString().startsWith('temp-')) {
        // Create new mapping
        const newMapping = await prisma.orderItemFieldMapping.create({
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
          mapping: {
            id: String(newMapping.id),
            mappingType: newMapping.mappingType,
            shopifyCode: newMapping.shopifyCode || undefined,
            shopifyValue: newMapping.shopifyValue || undefined,
            netsuiteId: newMapping.netsuiteId,
            applyToAllAccounts: newMapping.applyToAllAccounts,
            isActive: newMapping.isActive,
            customFieldId: newMapping.customFieldId || undefined,
          },
        })
      } else {
        // Update existing mapping
        const numericId = parseInt(id.toString(), 10)
        if (isNaN(numericId)) {
          console.warn(`Invalid mapping ID: ${id}`)
          continue
        }

        const updatedMapping = await prisma.orderItemFieldMapping.update({
          where: { id: numericId },
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
          id: String(updatedMapping.id),
          mapping: {
            id: String(updatedMapping.id),
            mappingType: updatedMapping.mappingType,
            shopifyCode: updatedMapping.shopifyCode || undefined,
            shopifyValue: updatedMapping.shopifyValue || undefined,
            netsuiteId: updatedMapping.netsuiteId,
            applyToAllAccounts: updatedMapping.applyToAllAccounts,
            isActive: updatedMapping.isActive,
            customFieldId: updatedMapping.customFieldId || undefined,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Successfully saved ${results.length} order item field mapping(s)`,
    })
  } catch (error) {
    console.error('Error saving order item field mappings:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save order item field mappings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
