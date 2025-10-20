import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// Verify webhook signature for security
function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body, 'utf8')
  const hash = hmac.digest('base64')
  return hash === signature
}

export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Received Shopify order webhook')
    
    // Get the raw body for signature verification
    const body = await request.text()
    
    // Get the webhook signature from headers
    const signature = request.headers.get('x-shopify-hmac-sha256')
    
    if (!signature) {
      console.error('❌ Missing webhook signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    
    // Verify webhook signature (bypass for testing with 'test-signature')
    if (signature !== 'test-signature') {
      const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET
      if (!webhookSecret) {
        console.error('❌ Missing SHOPIFY_WEBHOOK_SECRET environment variable')
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
      }
      
      if (!verifyWebhookSignature(body, signature, webhookSecret)) {
        console.error('❌ Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      console.log('🧪 Bypassing signature verification for testing')
    }
    
    // Parse the order data
    const orderData = JSON.parse(body)
    const order = orderData.order || orderData // Shopify sends different formats
    
    console.log(`📦 Processing new order: ${order.name} (ID: ${order.id})`)
    
    // Check if order already exists in database
    const existingOrder = await prisma.order.findUnique({
      where: { id: BigInt(order.id) }
    })
    
    if (existingOrder) {
      console.log(`⚠️ Order ${order.name} already exists in database, skipping`)
      return NextResponse.json({ message: 'Order already exists' }, { status: 200 })
    }
    
    // Prepare order data for database
    const orderToSave = {
      id: BigInt(order.id),
      name: order.name,
      financial_status: order.financial_status || 'pending',
      fulfillment_status: order.fulfillment_status || null,
      total_price: parseFloat(order.total_price) || 0,
      currency: order.currency || 'USD',
      created_at: new Date(order.created_at),
      payment_gateway_names: order.payment_gateway_names ? JSON.stringify(order.payment_gateway_names) : null,
      shipping_lines: order.shipping_lines ? JSON.stringify(order.shipping_lines) : null,
    }
    
    // Save order to database
    const savedOrder = await prisma.order.create({
      data: orderToSave
    })
    
    console.log(`✅ Successfully saved new order: ${savedOrder.name}`)
    
    // Here you can add additional processing logic:
    // - Send notifications
    // - Update inventory
    // - Trigger other integrations
    // - etc.
    
    return NextResponse.json({ 
      message: 'Order processed successfully',
      orderId: savedOrder.id.toString()
    }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}
