import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both sync and async params (Next.js 14 vs 15)
    const resolvedParams = params instanceof Promise ? await params : params
    const { id } = resolvedParams
    
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'https://pirani-life.myshopify.com'
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'
    
    const response = await fetch(
      `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders/${id}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return NextResponse.json({ order: data.order })
  } catch (error) {
    console.error('Error fetching order:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { 
        error: 'Failed to fetch order from Shopify',
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}
