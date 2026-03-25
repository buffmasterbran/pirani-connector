import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/mappings/shipment-methods/unmapped
 * Returns all unique shipping methods from orders that don't have a mapping,
 * with the shipping title and an example order name for each.
 */
export async function GET() {
  try {
    // Get all shipping lines from orders (include order name for examples)
    const orders = await prisma.orderLine.findMany({
      where: { isDeleted: false },
      select: { shippingLines: true, shopifyOrderName: true },
      distinct: ['shippingLines'],
    })

    // Parse shipping lines and extract unique codes with title + example order
    const shippingMethodInfo = new Map<string, { title: string | null; exampleOrder: string }>()
    orders.forEach((order) => {
      if (order.shippingLines) {
        try {
          const lines = JSON.parse(order.shippingLines)
          if (Array.isArray(lines)) {
            lines.forEach((line: any) => {
              const code = line.code || line.title
              if (code && code.trim()) {
                const trimmed = code.trim()
                if (!shippingMethodInfo.has(trimmed)) {
                  // Store the title (if different from code) and example order
                  const title = line.title?.trim() || null
                  shippingMethodInfo.set(trimmed, {
                    title: title && title !== trimmed ? title : null,
                    exampleOrder: order.shopifyOrderName,
                  })
                }
              }
            })
          }
        } catch {
          const code = order.shippingLines.trim()
          if (code && !shippingMethodInfo.has(code)) {
            shippingMethodInfo.set(code, { title: null, exampleOrder: order.shopifyOrderName })
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

    // Build unmapped list with title + example orders
    const allCodes = Array.from(shippingMethodInfo.keys()).sort()
    const unmapped = allCodes
      .filter((code) => !mappedCodes.has(code))
      .map((code) => {
        const info = shippingMethodInfo.get(code)!
        return {
          code,
          title: info.title,
          exampleOrder: info.exampleOrder,
        }
      })

    return NextResponse.json({
      success: true,
      unmapped,
      all: allCodes,
    })
  } catch (error) {
    console.error('Error fetching unmapped shipping methods:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unmapped shipping methods' },
      { status: 500 },
    )
  }
}
