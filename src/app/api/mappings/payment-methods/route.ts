import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all payment method mappings
export async function GET() {
  try {
    const mappings = await prisma.paymentMethodMapping.findMany({
      orderBy: { id: 'asc' }
    })

    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching payment method mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment method mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new payment method mapping
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

    const mapping = await prisma.paymentMethodMapping.create({
      data: {
        shopifyCode,
        netsuiteId,
        isActive
      }
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error creating payment method mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create payment method mapping' },
      { status: 500 }
    )
  }
}
