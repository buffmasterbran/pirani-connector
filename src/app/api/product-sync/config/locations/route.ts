import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const storeConfigId = request.nextUrl.searchParams.get('storeConfigId')
  const where = storeConfigId ? { storeConfigId } : {}
  const mappings = await prisma.productSyncLocationMapping.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(mappings)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { storeConfigId, netsuiteLocationId, netsuiteLocationName, shopifyLocationId, shopifyLocationName } = body

  if (!storeConfigId || !netsuiteLocationId || !shopifyLocationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const mapping = await prisma.productSyncLocationMapping.create({
    data: {
      storeConfigId,
      netsuiteLocationId,
      netsuiteLocationName: netsuiteLocationName || null,
      shopifyLocationId,
      shopifyLocationName: shopifyLocationName || null,
    },
  })

  return NextResponse.json(mapping, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  await prisma.productSyncLocationMapping.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
