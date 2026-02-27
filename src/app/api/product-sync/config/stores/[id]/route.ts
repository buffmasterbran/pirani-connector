import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const store = await prisma.productSyncStoreConfig.findUnique({
    where: { id: params.id },
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
      locationMappings: true,
    },
  })

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  return NextResponse.json(store)
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  const data: any = { ...body }

  if (body.shopifyAccessToken) {
    data.shopifyAccessTokenEncrypted = encrypt(body.shopifyAccessToken)
    delete data.shopifyAccessToken
  }

  delete data.id
  delete data.createdAt
  delete data.updatedAt

  const store = await prisma.productSyncStoreConfig.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ id: store.id, storeName: store.storeName })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  await prisma.productSyncStoreConfig.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
