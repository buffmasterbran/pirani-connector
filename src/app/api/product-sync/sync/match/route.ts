import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { matchBySkuForStore } from '@/lib/product-sync/sku-matcher'

/**
 * Match NetSuite items to Shopify variants by SKU.
 * Requires Shopify to be connected.
 */
export async function POST(request: NextRequest) {
  try {
    const { storeConfigId } = await request.json()

    if (!storeConfigId) {
      return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
    }

    const result = await matchBySkuForStore(storeConfigId)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[product-sync] SKU matching failed (Shopify may be disconnected):', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
