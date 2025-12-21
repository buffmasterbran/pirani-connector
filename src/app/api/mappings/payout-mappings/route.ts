import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get all mappings (including inactive) for the UI table
    const allMappings = await prisma.payoutMapping.findMany({
      orderBy: [
        { mappingType: 'asc' },
        { id: 'asc' },
      ],
    })

    console.log('All payout mappings found:', allMappings.length)

    // Return flat array for UI table display
    return NextResponse.json({ 
      success: true, 
      data: allMappings.map(m => {
        // Safely access fields that might not exist in older database schemas
        const mapping = m as any
        return {
          id: m.id,
          mappingType: m.mappingType,
          netsuiteId: m.netsuiteId,
          description: m.description,
          isActive: m.isActive,
          isDefaultDepositAccount: mapping.isDefaultDepositAccount ?? false,
          isDefaultFeesAccount: mapping.isDefaultFeesAccount ?? false,
        }
      })
    })
  } catch (error) {
    console.error('Error fetching payout mappings:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error stack:', errorStack)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch payout mappings', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}

// POST - Create a new payout mapping or set default
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Check if this is a request to set default accounts
    if (body.action === 'setDefault') {
      const { mappingId, defaultType } = body
      
      if (!mappingId || !defaultType) {
        return NextResponse.json(
          { success: false, error: 'Missing mappingId or defaultType' },
          { status: 400 }
        )
      }
      
      // Get the mapping to check its type
      const mapping = await prisma.payoutMapping.findUnique({
        where: { id: mappingId }
      })
      
      if (!mapping) {
        return NextResponse.json(
          { success: false, error: 'Mapping not found' },
          { status: 404 }
        )
      }
      
      // Unset all other defaults of the same type (regardless of mapping type)
      await prisma.payoutMapping.updateMany({
        where: {
          id: { not: mappingId }
        },
        data: {
          ...(defaultType === 'deposit_account' ? { isDefaultDepositAccount: false } : {}),
          ...(defaultType === 'fees_account' ? { isDefaultFeesAccount: false } : {})
        }
      })
      
      // Set this mapping as default
      const updated = await prisma.payoutMapping.update({
        where: { id: mappingId },
        data: {
          ...(defaultType === 'deposit_account' ? { isDefaultDepositAccount: true } : {}),
          ...(defaultType === 'fees_account' ? { isDefaultFeesAccount: true } : {})
        }
      })
      
      return NextResponse.json({ success: true, data: updated })
    }
    
    // Regular create mapping
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

