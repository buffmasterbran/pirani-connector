import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/mappings/shipment-methods/unmapped
 * Returns all unique shipping methods from orders that don't have a mapping
 */
export async function GET() {
  try {
    // Get all shipping lines from orders
    const orders = await prisma.orderLine.findMany({
      where: { isDeleted: false },
      select: { shippingLines: true },
      distinct: ['shippingLines'],
    })

    // Parse shipping lines and extract unique shipping method codes
    const allShippingMethods = new Set<string>()
    orders.forEach((order) => {
      if (order.shippingLines) {
        try {
          const lines = JSON.parse(order.shippingLines)
          if (Array.isArray(lines)) {
            lines.forEach((line: any) => {
              // Shopify shipping lines have 'code' or 'title'
              const code = line.code || line.title
              if (code && code.trim()) {
                allShippingMethods.add(code.trim())
              }
            })
          }
        } catch {
          // If not JSON, try as a plain string
          const code = order.shippingLines.trim()
          if (code) {
            allShippingMethods.add(code)
          }
        }
      }
    })

    // Get all existing mappings
    const existingMappings = await prisma.shipmentMethodMapping.findMany({
      where: { isActive: true },
      select: { shopifyCode: true },
    })

    const mappedCodes = new Set(existingMappings.map((m) => m.shopifyCode))

    // Filter out already-mapped shipping methods
    const unmapped = Array.from(allShippingMethods).filter(
      (sm) => !mappedCodes.has(sm)
    )

    return NextResponse.json({
      success: true,
      unmapped: unmapped.sort(),
      all: Array.from(allShippingMethods).sort(),
    })
  } catch (error) {
    console.error('Error fetching unmapped shipping methods:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unmapped shipping methods' },
      { status: 500 },
    )
  }
}
