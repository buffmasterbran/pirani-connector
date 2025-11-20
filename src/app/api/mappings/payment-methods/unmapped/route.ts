import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/mappings/payment-methods/unmapped
 * Returns all unique payment methods from orders that don't have a mapping
 */
export async function GET() {
  try {
    // Get all payment methods from orders
    const orders = await prisma.orderLine.findMany({
      where: { isDeleted: false },
      select: { paymentGatewayNames: true },
      distinct: ['paymentGatewayNames'],
    })

    // Parse payment gateway names and extract unique values
    const allPaymentMethods = new Set<string>()
    orders.forEach((order) => {
      if (order.paymentGatewayNames) {
        try {
          const paymentMethods = JSON.parse(order.paymentGatewayNames) as string[]
          if (Array.isArray(paymentMethods)) {
            paymentMethods.forEach((pm) => {
              if (pm && pm.trim()) {
                allPaymentMethods.add(pm.trim())
              }
            })
          }
        } catch (e) {
          // If it's not JSON, try as a single string
          if (typeof order.paymentGatewayNames === 'string') {
            const pm = order.paymentGatewayNames.trim()
            if (pm) {
              allPaymentMethods.add(pm)
            }
          }
        }
      }
    })

    // Get all existing mappings
    const existingMappings = await prisma.paymentMethodMapping.findMany({
      where: { isActive: true },
      select: { shopifyCode: true },
    })

    const mappedCodes = new Set(existingMappings.map((m) => m.shopifyCode))

    // Filter out mapped payment methods
    const unmapped = Array.from(allPaymentMethods).filter(
      (pm) => !mappedCodes.has(pm)
    )

    return NextResponse.json({
      success: true,
      unmapped: unmapped.sort(),
      all: Array.from(allPaymentMethods).sort(),
    })
  } catch (error) {
    console.error('Error fetching unmapped payment methods:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unmapped payment methods' },
      { status: 500 },
    )
  }
}

