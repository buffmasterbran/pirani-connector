import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeAddresses = searchParams.get('includeAddresses') === 'true'

    const customers = await prisma.customer.findMany({
      include: {
        addresses: includeAddresses
          ? {
              orderBy: {
                createdAt: 'desc',
              },
            }
          : false,
        _count: {
          select: {
            addresses: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Get orders separately if needed (to avoid Prisma client issues)
    // Check if Order model exists in Prisma client
    const ordersMap = new Map<number, any[]>()
    const orderCountMap = new Map<number, number>()
    
    try {
      if (customers.length > 0 && (prisma as any).order) {
        const customerIds = customers.map((c) => c.id)
        const ordersByCustomer = await (prisma as any).order.findMany({
          where: {
            customerId: { in: customerIds },
          },
          select: {
            id: true,
            customerId: true,
            shopifyOrderId: true,
            shopifyOrderName: true,
            orderCreatedAt: true,
          },
          orderBy: {
            orderCreatedAt: 'desc',
          },
        })

        // Group orders by customer
        for (const order of ordersByCustomer) {
          if (!ordersMap.has(order.customerId)) {
            ordersMap.set(order.customerId, [])
          }
          const customerOrders = ordersMap.get(order.customerId)!
          if (customerOrders.length < 5) {
            // Limit to 5 most recent per customer
            customerOrders.push(order)
          }
        }

        // Get total order counts for all customers
        const allOrderCounts = await (prisma as any).order.groupBy({
          by: ['customerId'],
          _count: {
            customerId: true,
          },
        })
        for (const count of allOrderCounts) {
          orderCountMap.set(count.customerId, count._count.customerId)
        }
      }
    } catch (orderError) {
      // Order model might not exist in Prisma client yet - that's okay
      console.warn('Could not fetch orders (Prisma client may need regeneration):', orderError)
    }

    return NextResponse.json({
      success: true,
      customers: customers.map((customer) => ({
        id: customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        netsuiteCustomerId: customer.netsuiteCustomerId,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        addresses: includeAddresses
          ? customer.addresses.map((addr) => ({
              id: addr.id,
              isDefaultBilling: addr.isDefaultBilling,
              isDefaultShipping: addr.isDefaultShipping,
              isSavedAddress: addr.isSavedAddress,
              shopifyAddressId: addr.shopifyAddressId,
              netsuiteAddressId: addr.netsuiteAddressId,
              firstName: addr.firstName,
              lastName: addr.lastName,
              address1: addr.address1,
              address2: addr.address2,
              city: addr.city,
              province: addr.province,
              zip: addr.zip,
              country: addr.country,
              phone: addr.phone,
              isDefault: addr.isDefault,
              createdAt: addr.createdAt,
            }))
          : [],
        orders: ordersMap.get(customer.id) || [],
        addressCount: customer._count.addresses,
        orderCount: orderCountMap.get(customer.id) || 0,
      })),
    })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch customers',
      },
      { status: 500 }
    )
  }
}

