import { NextRequest, NextResponse } from 'next/server'
import { buildNetSuiteSalesOrderPayload, createNetSuiteSalesOrder } from '@/lib/netsuite'
import { prisma } from '@/lib/prisma'

/**
 * API endpoint to push a Shopify order to NetSuite as a Sales Order
 * POST /api/netsuite/push-order
 * Body: { shopifyOrderId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shopifyOrderId } = body

    if (!shopifyOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'shopifyOrderId is required',
        },
        { status: 400 }
      )
    }

    console.log(`🚀 Building NetSuite sales order payload for Shopify order: ${shopifyOrderId}`)

    // Build the payload (resolveCustomer is called internally — 3-tier lookup/create)
    const { payload, errors, customerWasCreated } = await buildNetSuiteSalesOrderPayload(shopifyOrderId)

    // Log any warnings/errors
    if (errors.length > 0) {
      console.warn(`⚠️ Warnings while building payload:`, errors)
    }

    // Validate critical fields — customer resolution is now automatic, but can still fail
    if (!payload.entity.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not resolve NetSuite customer. Check warnings for details.',
          warnings: errors,
        },
        { status: 400 }
      )
    }

    if (!payload.item.items || payload.item.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid line items found. All items must have SKUs.',
          warnings: errors,
        },
        { status: 400 }
      )
    }

    console.log(`📦 NetSuite Sales Order Payload:`, JSON.stringify(payload, null, 2))

    // Create the sales order in NetSuite
    console.log(`📤 Creating sales order in NetSuite...`)
    const result = await createNetSuiteSalesOrder(payload)

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          warnings: errors,
          payload, // Include payload for debugging
        },
        { status: 500 }
      )
    }

    // Update order lines with NetSuite sales order ID
    if (result.salesOrderId) {
      await prisma.orderLine.updateMany({
        where: {
          shopifyOrderId,
          isDeleted: false,
        },
        data: {
          netsuiteSalesOrderId: result.salesOrderId,
          netsuiteSalesOrderName: result.salesOrderName || null,
          syncedNetsuiteAt: new Date(),
        },
      })

      console.log(`✅ Successfully created NetSuite sales order ${result.salesOrderId} for Shopify order ${shopifyOrderId}`)
    }

    return NextResponse.json({
      success: true,
      salesOrderId: result.salesOrderId,
      salesOrderName: result.salesOrderName,
      customerWasCreated,
      warnings: errors.length > 0 ? errors : undefined,
      payload, // Include payload for debugging/review
    })
  } catch (error) {
    console.error('❌ Error pushing order to NetSuite:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to preview the NetSuite sales order payload without creating it
 * GET /api/netsuite/push-order?shopifyOrderId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const shopifyOrderId = searchParams.get('shopifyOrderId')

    if (!shopifyOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'shopifyOrderId query parameter is required',
        },
        { status: 400 }
      )
    }

    console.log(`🔍 Previewing NetSuite sales order payload for Shopify order: ${shopifyOrderId}`)

    const { payload, errors, customerWasCreated } = await buildNetSuiteSalesOrderPayload(shopifyOrderId)

    // Fetch customer and address details for preview
    const orderLines = await prisma.orderLine.findMany({
      where: {
        shopifyOrderId,
        isDeleted: false,
      },
      take: 1,
    })

    let customerInfo = null
    let addressInfo = null

    if (orderLines.length > 0 && orderLines[0].customerId) {
      const customer = await prisma.customer.findUnique({
        where: {
          shopifyCustomerId: orderLines[0].customerId,
        },
        include: {
          addresses: {
            where: {
              OR: [
                { isDefaultBilling: true },
                { isDefaultShipping: true },
              ],
            },
          },
        },
      })

      if (customer) {
        customerInfo = {
          shopifyCustomerId: customer.shopifyCustomerId,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          netsuiteCustomerId: customer.netsuiteCustomerId,
        }

        const billingAddress = customer.addresses.find((addr) => addr.isDefaultBilling)
        const shippingAddress = customer.addresses.find((addr) => addr.isDefaultShipping)

        addressInfo = {
          billing: billingAddress ? {
            netsuiteAddressId: billingAddress.netsuiteAddressId,
            firstName: billingAddress.firstName,
            lastName: billingAddress.lastName,
            address1: billingAddress.address1,
            address2: billingAddress.address2,
            city: billingAddress.city,
            zip: billingAddress.zip,
            province: billingAddress.province,
            country: billingAddress.country,
            phone: billingAddress.phone,
          } : null,
          shipping: shippingAddress ? {
            netsuiteAddressId: shippingAddress.netsuiteAddressId,
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            address1: shippingAddress.address1,
            address2: shippingAddress.address2,
            city: shippingAddress.city,
            zip: shippingAddress.zip,
            province: shippingAddress.province,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
          } : null,
        }
      }
    }

    return NextResponse.json({
      success: true,
      payload,
      customerInfo,
      customerWasCreated,
      addressInfo,
      warnings: errors.length > 0 ? errors : undefined,
      validation: {
        hasCustomerId: !!payload.entity.id,
        hasBillingAddress: !!payload.billingAddress,
        hasShippingAddress: !!payload.shippingAddress,
        itemCount: payload.item.items.length,
        allItemsHaveSku: payload.item.items.every((item) => !!item.item.refName),
      },
    })
  } catch (error) {
    console.error('❌ Error previewing NetSuite sales order:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

