import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all shipment method mappings
export async function GET() {
  try {
    const mappings = await prisma.shipmentMethodMapping.findMany({
      orderBy: { createdAt: 'asc' }
    })
    
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching shipment method mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shipment method mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new shipment method mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shopifyCode, netsuiteId, isActive = true } = body

    if (!shopifyCode || !netsuiteId) {
      return NextResponse.json(
        { success: false, error: 'shopifyCode and netsuiteId are required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.shipmentMethodMapping.create({
      data: {
        shopifyCode,
        netsuiteId,
        isActive
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error creating shipment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create shipment method mapping' },
      { status: 500 }
    )
  }
}