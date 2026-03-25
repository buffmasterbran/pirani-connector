import { NextRequest, NextResponse } from 'next/server'
import { getShopifyCredentials } from '@/lib/shopify'

function buildHeaders(accessToken: string) {
  return {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const rawId = resolvedParams.id.replace(/^#/, '').trim()

    const creds = await getShopifyCredentials()
    if (!creds) {
      return NextResponse.json(
        { error: 'Shopify credentials missing. Connect a store or set env.' },
        { status: 503 }
      )
    }

    const headers = buildHeaders(creds.accessToken)

    // Try direct ID lookup first (works for Shopify internal IDs like 5551234567890)
    const directRes = await fetch(`${creds.baseUrl}/orders/${rawId}.json`, { headers })

    if (directRes.ok) {
      const data = await directRes.json()
      return NextResponse.json({ order: data.order })
    }

    // If 404, the ID might be an order number — search by order_number
    if (directRes.status === 404) {
      const searchRes = await fetch(
        `${creds.baseUrl}/orders.json?status=any&order_number=${rawId}&limit=5`,
        { headers }
      )
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const match = (searchData.orders || []).find(
          (o: any) =>
            String(o.order_number) === rawId ||
            o.name === `#${rawId}` ||
            o.name === rawId
        )
        if (match) {
          return NextResponse.json({ order: match })
        }
      }
      return NextResponse.json(
        { error: `Order not found for "${rawId}" (tried both ID and order number)` },
        { status: 404 }
      )
    }

    throw new Error(`Shopify API error: ${directRes.status} ${directRes.statusText}`)
  } catch (error) {
    console.error('Error fetching order:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch order from Shopify', details: errorMessage },
      { status: 500 }
    )
  }
}
