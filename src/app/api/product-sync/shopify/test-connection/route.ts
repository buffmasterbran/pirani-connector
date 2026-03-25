import { NextRequest, NextResponse } from 'next/server'
import { getShopifyStore, testConnection } from '@/lib/product-sync/shopify-graphql'

export async function POST(request: NextRequest) {
  try {
    const { storeConfigId } = await request.json()
    if (!storeConfigId) {
      return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
    }

    const store = await getShopifyStore(storeConfigId)
    const result = await testConnection(store)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[product-sync] Shopify test-connection error:', err.message || err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
