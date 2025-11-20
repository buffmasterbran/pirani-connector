import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNameFromShopify, saveCustomerAndAddresses } from '@/lib/shopify'
import { prisma } from '@/lib/prisma'

/**
 * Debug endpoint to test address saving directly
 * GET /api/debug/test-address-save?orderName=#42256
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderName = searchParams.get('orderName') || '#42256'

    console.log(`\n${'='.repeat(80)}`)
    console.log(`🧪 TESTING ADDRESS SAVING FOR ORDER ${orderName}`)
    console.log('='.repeat(80))

    // Step 1: Fetch order
    console.log(`\n📥 Fetching order ${orderName} from Shopify...`)
    const order = await getOrderByNameFromShopify(orderName)

    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
      }, { status: 404 })
    }

    console.log(`✅ Order found: ${order.id} (${order.name})`)
    console.log(`   Has customer: ${!!order.customer}`)
    console.log(`   Has billing_address: ${!!order.billing_address}`)
    console.log(`   Has shipping_address: ${!!order.shipping_address}`)

    // Step 2: Check current state
    console.log(`\n📊 Current database state:`)
    const customerCount = await prisma.customer.count()
    const addressCount = await prisma.customerAddress.count()
    console.log(`   Customers: ${customerCount}`)
    console.log(`   Addresses: ${addressCount}`)

    let beforeAddresses: any[] = []
    if (order.customer?.id) {
      const shopifyCustomerId = String(order.customer.id)
      const existingCustomer = await prisma.customer.findUnique({
        where: { shopifyCustomerId },
      })

      if (existingCustomer) {
        // Fetch addresses separately to avoid Prisma client issues
        const addresses = await prisma.customerAddress.findMany({
          where: { customerId: existingCustomer.id },
        })
        beforeAddresses = addresses
        console.log(`   Customer ${shopifyCustomerId} exists with ${addresses.length} addresses`)
      } else {
        console.log(`   Customer ${shopifyCustomerId} does not exist yet`)
      }
    }

    // Step 3: Save customer and addresses
    console.log(`\n💾 Calling saveCustomerAndAddresses...`)
    await saveCustomerAndAddresses(order)

    // Step 4: Check final state
    console.log(`\n📊 Final database state:`)
    const finalCustomerCount = await prisma.customer.count()
    const finalAddressCount = await prisma.customerAddress.count()
    console.log(`   Customers: ${finalCustomerCount}`)
    console.log(`   Addresses: ${finalAddressCount}`)

    let afterAddresses: any[] = []
    if (order.customer?.id) {
      const shopifyCustomerId = String(order.customer.id)
      const finalCustomer = await prisma.customer.findUnique({
        where: { shopifyCustomerId },
      })

      if (finalCustomer) {
        // Fetch addresses separately to avoid Prisma client issues
        const addresses = await prisma.customerAddress.findMany({
          where: { customerId: finalCustomer.id },
        })
        afterAddresses = addresses
        console.log(`   Customer ${shopifyCustomerId} now has ${addresses.length} addresses`)
      } else {
        console.error(`   ❌ Customer ${shopifyCustomerId} still does not exist!`)
      }
    }

    console.log(`\n✅ Test complete!`)
    console.log('='.repeat(80))

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderName: order.name,
      before: {
        customerCount,
        addressCount,
        customerAddresses: beforeAddresses.length,
      },
      after: {
        customerCount: finalCustomerCount,
        addressCount: finalAddressCount,
        customerAddresses: afterAddresses.length,
      },
      addresses: afterAddresses.map(addr => ({
        id: addr.id,
        address1: addr.address1,
        city: addr.city,
        zip: addr.zip,
        isDefaultBilling: addr.isDefaultBilling,
        isDefaultShipping: addr.isDefaultShipping,
        isSavedAddress: addr.isSavedAddress,
        shopifyAddressId: addr.shopifyAddressId,
      })),
    })
  } catch (error) {
    console.error('\n❌ Error during test:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test address saving',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

