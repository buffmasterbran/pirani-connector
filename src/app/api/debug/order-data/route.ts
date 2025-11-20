import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNameFromShopify } from '@/lib/shopify'

/**
 * Debug endpoint to inspect order data structure
 * Helps identify why addresses might not be saving
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderName = searchParams.get('orderName') || '#42256'

    console.log(`🔍 DEBUG: Fetching order data for ${orderName}`)
    
    const order = await getOrderByNameFromShopify(orderName)
    
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
      }, { status: 404 })
    }

    // Extract key information for debugging
    const debugInfo = {
      orderId: order.id,
      orderName: order.name,
      orderNumber: order.order_number,
      hasCustomer: !!order.customer,
      customerId: order.customer?.id,
      customerEmail: order.customer?.email,
      hasBillingAddress: !!order.billing_address,
      hasShippingAddress: !!order.shipping_address,
      hasDefaultAddress: !!order.customer?.default_address,
      billingAddress: order.billing_address ? {
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        city: order.billing_address.city,
        zip: order.billing_address.zip,
        province: order.billing_address.province,
        country: order.billing_address.country,
        hasRequiredFields: !!(order.billing_address.address1 || order.billing_address.city),
      } : null,
      shippingAddress: order.shipping_address ? {
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        zip: order.shipping_address.zip,
        province: order.shipping_address.province,
        country: order.shipping_address.country,
        hasRequiredFields: !!(order.shipping_address.address1 || order.shipping_address.city),
      } : null,
      defaultAddress: order.customer?.default_address ? {
        id: order.customer.default_address.id,
        address1: order.customer.default_address.address1,
        city: order.customer.default_address.city,
        zip: order.customer.default_address.zip,
        hasRequiredFields: !!(order.customer.default_address.address1 || order.customer.default_address.city),
      } : null,
      orderKeys: Object.keys(order).slice(0, 20), // First 20 keys
      customerKeys: order.customer ? Object.keys(order.customer).slice(0, 20) : null,
    }

    return NextResponse.json({
      success: true,
      debugInfo,
      // Include full order for detailed inspection (be careful with sensitive data)
      order: {
        id: order.id,
        name: order.name,
        customer: order.customer,
        billing_address: order.billing_address,
        shipping_address: order.shipping_address,
      },
    })
  } catch (error) {
    console.error('❌ Error in debug endpoint:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch order data',
      },
      { status: 500 }
    )
  }
}

