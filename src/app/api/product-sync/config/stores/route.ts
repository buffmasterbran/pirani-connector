import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export async function GET() {
  const stores = await prisma.productSyncStoreConfig.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      storeName: true,
      storeLabel: true,
      shopifyDomain: true,
      shopifyApiVersion: true,
      netsuiteFlagFieldId: true,
      netsuitePriceLevelId: true,
      netsuiteComparePriceLevelId: true,
      syncEnabled: true,
      syncIntervalMinutes: true,
      lowStockThreshold: true,
      lowStockIntervalMinutes: true,
      includeNonInventory: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return NextResponse.json({ stores })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    storeName,
    storeLabel,
    shopifyDomain,
    shopifyAccessToken,
    shopifyApiVersion,
    netsuiteFlagFieldId,
    netsuitePriceLevelId,
    netsuiteComparePriceLevelId,
    syncIntervalMinutes,
    lowStockThreshold,
    lowStockIntervalMinutes,
    includeNonInventory,
  } = body

  if (!storeName || !shopifyDomain || !shopifyAccessToken || !netsuiteFlagFieldId || !netsuitePriceLevelId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const store = await prisma.productSyncStoreConfig.create({
    data: {
      storeName,
      storeLabel: storeLabel || null,
      shopifyDomain,
      shopifyAccessTokenEncrypted: encrypt(shopifyAccessToken),
      shopifyApiVersion: shopifyApiVersion || '2025-10',
      netsuiteFlagFieldId,
      netsuitePriceLevelId,
      netsuiteComparePriceLevelId: netsuiteComparePriceLevelId || null,
      syncIntervalMinutes: syncIntervalMinutes || 15,
      lowStockThreshold: lowStockThreshold || 10,
      lowStockIntervalMinutes: lowStockIntervalMinutes || 5,
      includeNonInventory: includeNonInventory || false,
    },
  })

  return NextResponse.json({ id: store.id, storeName: store.storeName }, { status: 201 })
}
