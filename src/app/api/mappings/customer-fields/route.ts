import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all customer field mappings
export async function GET() {
  try {
    const mappings = await prisma.customerFieldMapping.findMany({
      orderBy: { createdAt: 'asc' }
    })
    
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching customer field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch customer field mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new customer field mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      mappingType = 'Fixed', 
      shopifyCode, 
      shopifyValue, 
      netsuiteId, 
      applyToAllAccounts = false, 
      isActive = true,
      customFieldId 
    } = body

    if (!netsuiteId || (!shopifyCode && !shopifyValue)) {
      return NextResponse.json(
        { success: false, error: 'netsuiteId and either shopifyCode or shopifyValue are required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.customerFieldMapping.create({
      data: {
        mappingType,
        shopifyCode,
        shopifyValue,
        netsuiteId,
        applyToAllAccounts,
        isActive,
        customFieldId
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error creating customer field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create customer field mapping' },
      { status: 500 }
    )
  }
}