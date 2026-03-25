import { NextRequest, NextResponse } from 'next/server'
import { getShopifyStore, fetchShopifyLocations } from '@/lib/product-sync/shopify-graphql'

export async function GET(request: NextRequest) {
  try {
    const storeConfigId = request.nextUrl.searchParams.get('storeConfigId')
    if (!storeConfigId) {
      return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
    }

    const store = await getShopifyStore(storeConfigId)
    const locations = await fetchShopifyLocations(store)
    return NextResponse.json(locations)
  } catch (err: any) {
    console.error('[product-sync] Shopify locations error:', err.message || err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
