import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // First, try to get all mappings (including inactive) to debug
    const allMappings = await prisma.payoutMapping.findMany({
      orderBy: {
        mappingType: 'asc',
      },
    })

    console.log('All payout mappings found:', allMappings.length, allMappings)

    // Get active mappings
    const mappings = await prisma.payoutMapping.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        mappingType: 'asc',
      },
    })

    console.log('Active payout mappings found:', mappings.length)

    // Group by mappingType (normalize to lowercase with underscores for consistency)
    const grouped = mappings.reduce((acc, mapping) => {
      // Normalize mappingType: "Fees Description" -> "fees_description", "fees_description" -> "fees_description"
      const normalizedType = mapping.mappingType
        .toLowerCase()
        .replace(/\s+/g, '_')
      
      if (!acc[normalizedType]) {
        acc[normalizedType] = []
      }
      acc[normalizedType].push({
        id: mapping.id,
        netsuiteId: mapping.netsuiteId,
        description: mapping.description,
        isActive: mapping.isActive,
      })
      return acc
    }, {} as Record<string, any[]>)

    console.log('Grouped mappings:', grouped)

    return NextResponse.json({ success: true, data: grouped })
  } catch (error) {
    console.error('Error fetching payout mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payout mappings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// POST - Create a new payout mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mappingType, netsuiteId, description, isActive } = body

    if (!mappingType) {
      return NextResponse.json(
        { success: false, error: 'Mapping type is required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.payoutMapping.create({
      data: {
        mappingType,
        netsuiteId: netsuiteId || '',
        description: description || null,
        isActive: isActive !== undefined ? isActive : true
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error creating payout mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create payout mapping', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

