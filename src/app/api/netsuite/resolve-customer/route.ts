import { NextRequest, NextResponse } from 'next/server'
import { resolveCustomer } from '@/lib/netsuite'
import { prisma } from '@/lib/prisma'

/**
 * API endpoint to resolve a Shopify order's customer in NetSuite (Step 1 of order push workflow)
 * 3-tier resolution: Local DB -> SuiteQL email lookup -> Create new customer
 *
 * POST /api/netsuite/resolve-customer
 * Body: { shopifyOrderId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shopifyOrderId } = body

    if (!shopifyOrderId) {
      return NextResponse.json(
        { success: false, error: 'shopifyOrderId is required' },
        { status: 400 }
      )
    }

    console.log(`[resolve-customer] Starting customer resolution for order ${shopifyOrderId}`)

    // Fetch order lines to get customer info
    const orderLines = await prisma.orderLine.findMany({
      where: {
        shopifyOrderId,
        isDeleted: false,
      },
      take: 1,
    })

    if (orderLines.length === 0) {
      return NextResponse.json(
        { success: false, error: `No order lines found for Shopify order ID: ${shopifyOrderId}` },
        { status: 404 }
      )
    }

    const firstLine = orderLines[0]

    if (!firstLine.customerId) {
      return NextResponse.json(
        { success: false, error: 'Order has no customer ID' },
        { status: 400 }
      )
    }

    // Fetch customer data from local DB for name/phone
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: firstLine.customerId },
    })

    // Run 3-tier customer resolution
    const result = await resolveCustomer(
      firstLine.customerId,
      firstLine.customerEmail,
      {
        firstName: customer?.firstName,
        lastName: customer?.lastName,
        phone: customer?.phone,
      }
    )

    console.log(`[resolve-customer] Resolved: tier=${result.tier}, nsId=${result.netsuiteCustomerId}, created=${result.wasCreated}`)

    return NextResponse.json({
      success: true,
      tier: result.tier,
      tierDescription: result.tierDescription,
      netsuiteCustomerId: result.netsuiteCustomerId,
      wasCreated: result.wasCreated,
      shopifyCustomerId: firstLine.customerId,
      email: firstLine.customerEmail || customer?.email || null,
      customerName: customer
        ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || null
        : null,
      createDetails: result.createDetails || null,
    })
  } catch (error) {
    console.error('[resolve-customer] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
