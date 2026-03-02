import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.NETSUITE_WEBHOOK_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')

    const storeConfig = storeId
      ? await prisma.productSyncStoreConfig.findFirst({
          where: { storeName: storeId, isActive: true },
          include: {
            locationMappings: { where: { isActive: true } },
            fieldMappings: { where: { isEnabled: true } },
          },
        })
      : await prisma.productSyncStoreConfig.findFirst({
          where: { isActive: true },
          include: {
            locationMappings: { where: { isActive: true } },
            fieldMappings: { where: { isEnabled: true } },
          },
        })

    if (!storeConfig) {
      return NextResponse.json({ error: 'No active store configured' }, { status: 404 })
    }

    // Fetch field mappings: store-specific + global (storeConfigId is null)
    const allFieldMappings = await prisma.productSyncFieldMapping.findMany({
      where: {
        isEnabled: true,
        OR: [
          { storeConfigId: storeConfig.id },
          { storeConfigId: null },
        ],
      },
    })

    const locationIds = storeConfig.locationMappings
      .map(lm => String(lm.netsuiteLocationId))
      .join(',')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (request.headers.get('host') ? `https://${request.headers.get('host')}` : null)

    const webhookUrl = baseUrl
      ? `${baseUrl.replace(/\/+$/, '')}/api/webhooks/inventory-update`
      : null

    const config = {
      storeId: storeConfig.storeName,
      storeConfigId: storeConfig.id,
      flagFieldId: storeConfig.netsuiteFlagFieldId,
      priceLevelId: storeConfig.netsuitePriceLevelId,
      comparePriceLevelId: storeConfig.netsuiteComparePriceLevelId || null,
      locationIds,
      webhookUrl,
      includeNonInventory: storeConfig.includeNonInventory,
      fieldMappings: allFieldMappings.map(fm => ({
        shopifyField: fm.shopifyField,
        netsuiteFieldId: fm.netsuiteFieldId,
        mappingType: fm.mappingType,
        defaultValue: fm.defaultValue,
        specialConfig: fm.specialConfig,
      })),
    }

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error loading sync config:', error)
    return NextResponse.json(
      { error: 'Failed to load sync configuration' },
      { status: 500 },
    )
  }
}
