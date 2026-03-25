import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const mappings = await prisma.shipmentMethodMapping.findMany({
      where: { isActive: true },
      orderBy: { shopifyCode: 'asc' },
    })
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching shipment method mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shipment method mappings' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { shopifyCode, netsuiteId, isActive = true } = body

    if (!shopifyCode || !netsuiteId) {
      return NextResponse.json(
        { success: false, error: 'shopifyCode and netsuiteId are required' },
        { status: 400 },
      )
    }

    const mapping = await prisma.shipmentMethodMapping.create({
      data: { shopifyCode, netsuiteId, isActive },
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A mapping for this Shopify shipping code already exists' },
        { status: 409 },
      )
    }
    console.error('Error creating shipment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create shipment method mapping' },
      { status: 500 },
    )
  }
}
