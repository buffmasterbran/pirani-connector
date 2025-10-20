import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all order item field mappings
export async function GET() {
  try {
    const mappings = await prisma.orderItemFieldMapping.findMany({
      orderBy: { createdAt: 'asc' }
    })
    
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching order item field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch order item field mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new order item field mapping
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

    const mapping = await prisma.orderItemFieldMapping.create({
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
    console.error('Error creating order item field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create order item field mapping' },
      { status: 500 }
    )
  }
}