import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { fetchAndPopulateNetSuiteItems } from '@/lib/product-sync/sku-matcher'

/**
 * Pull items, prices, and inventory from NetSuite only. No Shopify calls.
 * Saves all data to the local database.
 */
export async function POST(request: NextRequest) {
  const start = Date.now()
  try {
    const { storeConfigId } = await request.json()

    if (!storeConfigId) {
      return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
    }

    console.info(`[product-sync] Pull requested for storeConfigId: ${storeConfigId}`)

    const storeConfig = await prisma.productSyncStoreConfig.findUniqueOrThrow({
      where: { id: storeConfigId },
    })

    const result = await fetchAndPopulateNetSuiteItems(storeConfig)

    console.info(`[product-sync] Pull finished in ${((Date.now() - start) / 1000).toFixed(1)}s`)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error(`[product-sync] Pull from NetSuite error (${((Date.now() - start) / 1000).toFixed(1)}s):`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
