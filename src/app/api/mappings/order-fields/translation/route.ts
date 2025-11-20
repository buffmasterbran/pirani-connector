import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get all unique Shopify values for a field from imported orders
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const shopifyCode = searchParams.get('shopifyCode')

    if (!shopifyCode) {
      return NextResponse.json(
        { success: false, error: 'shopifyCode parameter is required' },
        { status: 400 }
      )
    }

    // Get all unique values for this Shopify field from OrderLine table
    // Map common shopifyCode values to OrderLine columns
    let shopifyValues: string[] = []

    try {
      if (shopifyCode === 'financial_status') {
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, financialStatus: { not: null } },
          select: { financialStatus: true },
          distinct: ['financialStatus'],
        })
        shopifyValues = values.map(v => v.financialStatus).filter(Boolean) as string[]
      } else if (shopifyCode === 'fulfillment_status') {
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, fulfillmentStatus: { not: null } },
          select: { fulfillmentStatus: true },
          distinct: ['fulfillmentStatus'],
        })
        shopifyValues = values.map(v => v.fulfillmentStatus).filter(Boolean) as string[]
      } else if (shopifyCode === 'currency') {
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, currency: { not: null } },
          select: { currency: true },
          distinct: ['currency'],
        })
        shopifyValues = values.map(v => v.currency).filter(Boolean) as string[]
      } else if (shopifyCode === 'customer.id') {
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, customerId: { not: null } },
          select: { customerId: true },
          distinct: ['customerId'],
        })
        shopifyValues = values.map(v => v.customerId).filter(Boolean) as string[]
      } else if (shopifyCode === 'customer.email') {
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, customerEmail: { not: null } },
          select: { customerEmail: true },
          distinct: ['customerEmail'],
        })
        shopifyValues = values.map(v => v.customerEmail).filter(Boolean) as string[]
      } else if (shopifyCode === 'payment_gateway_names') {
        // This is stored as JSON string, need to parse it
        const values = await prisma.orderLine.findMany({
          where: { isDeleted: false, paymentGatewayNames: { not: null } },
          select: { paymentGatewayNames: true },
        })
        const allValues: string[] = []
        for (const line of values) {
          if (line.paymentGatewayNames) {
            try {
              const parsed = JSON.parse(line.paymentGatewayNames)
              if (Array.isArray(parsed)) {
                allValues.push(...parsed.map(String))
              }
            } catch {
              // If not JSON, treat as string
              allValues.push(line.paymentGatewayNames)
            }
          }
        }
        shopifyValues = [...new Set(allValues)].sort()
      }
    } catch (error) {
      console.error('Error fetching Shopify values:', error)
    }

    return NextResponse.json({ success: true, data: shopifyValues })
  } catch (error) {
    console.error('Error fetching Shopify values:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Shopify values' },
      { status: 500 }
    )
  }
}

// POST - Save translation mappings for an order field mapping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderFieldMappingId, translationMappings, defaultValue } = body

    if (!orderFieldMappingId) {
      return NextResponse.json(
        { success: false, error: 'orderFieldMappingId is required' },
        { status: 400 }
      )
    }

    const mappingId = parseInt(orderFieldMappingId.toString())
    if (isNaN(mappingId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid orderFieldMappingId' },
        { status: 400 }
      )
    }

    // Update default value
    if (defaultValue !== undefined) {
      await prisma.orderFieldMapping.update({
        where: { id: mappingId },
        data: { translationDefaultValue: defaultValue || null },
      })
    }

    // Delete existing translation mappings
    await prisma.orderFieldTranslationMapping.deleteMany({
      where: { orderFieldMappingId: mappingId },
    })

    // Create new translation mappings
    if (translationMappings && Array.isArray(translationMappings) && translationMappings.length > 0) {
      await prisma.orderFieldTranslationMapping.createMany({
        data: translationMappings
          .filter((tm: any) => tm.shopifyValue && tm.netsuiteValue)
          .map((tm: any) => ({
            orderFieldMappingId: mappingId,
            shopifyValue: tm.shopifyValue,
            netsuiteValue: tm.netsuiteValue,
            isActive: tm.isActive !== false,
          })),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving translation mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save translation mappings' },
      { status: 500 }
    )
  }
}

