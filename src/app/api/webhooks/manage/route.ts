import { NextRequest, NextResponse } from 'next/server'
import { createWebhook, getWebhooks, deleteWebhook } from '@/lib/shopify'

export async function GET() {
  try {
    console.log('📋 Fetching existing webhooks...')
    const webhooks = await getWebhooks()
    
    return NextResponse.json({ webhooks })
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { webhookUrl, topic = 'orders/create' } = await request.json()
    
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Webhook URL is required' },
        { status: 400 }
      )
    }
    
    console.log(`🔗 Creating webhook for ${topic} at ${webhookUrl}`)
    const webhook = await createWebhook(webhookUrl, topic)
    
    return NextResponse.json({ 
      message: 'Webhook created successfully',
      webhook 
    })
  } catch (error) {
    console.error('Error creating webhook:', error)
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('id')
    
    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      )
    }
    
    console.log(`🗑️ Deleting webhook: ${webhookId}`)
    await deleteWebhook(webhookId)
    
    return NextResponse.json({ 
      message: 'Webhook deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting webhook:', error)
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    )
  }
}
