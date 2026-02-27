import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const storeConfigId = sp.get('storeConfigId')
  const search = sp.get('search')
  const matchStatus = sp.get('matchStatus')
  const syncStatus = sp.get('syncStatus')
  const lowStock = sp.get('lowStock')
  const page = parseInt(sp.get('page') || '1')
  const pageSize = parseInt(sp.get('pageSize') || '50')
  const sortBy = sp.get('sortBy') || 'netsuiteSku'
  const sortOrder = (sp.get('sortOrder') || 'asc') as 'asc' | 'desc'

  if (!storeConfigId) {
    return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
  }

  const where: Prisma.ProductSyncMappingWhereInput = { storeConfigId }

  if (search) {
    where.OR = [
      { netsuiteSku: { contains: search, mode: 'insensitive' } },
      { netsuiteName: { contains: search, mode: 'insensitive' } },
      { netsuiteColor: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (matchStatus) {
    where.matchStatus = matchStatus as any
  }

  if (syncStatus) {
    where.lastSyncStatus = syncStatus as any
  }

  const flagged = sp.get('flagged')
  if (flagged === 'true') {
    where.netsuiteFlagValue = { not: null }
  }

  if (lowStock === 'true') {
    const config = await prisma.productSyncStoreConfig.findUnique({
      where: { id: storeConfigId },
    })
    if (config) {
      where.lastSyncedQuantity = { lt: config.lowStockThreshold }
    }
  }

  const [items, total, summaryStats, lastFullLog, lastJob] =
    await Promise.all([
      prisma.productSyncMapping.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productSyncMapping.count({ where }),
      prisma.$queryRaw<Array<{
        matched: bigint
        unmatched: bigint
        multiple_matches: bigint
        errors: bigint
      }>>`
        SELECT
          COUNT(*) FILTER (WHERE "matchStatus" = 'matched') AS matched,
          COUNT(*) FILTER (WHERE "matchStatus" = 'unmatched') AS unmatched,
          COUNT(*) FILTER (WHERE "matchStatus" = 'multiple_matches') AS multiple_matches,
          COUNT(*) FILTER (WHERE "lastSyncStatus" = 'error') AS errors
        FROM "ProductSyncMapping"
        WHERE "storeConfigId" = ${storeConfigId}
      `,
      prisma.productSyncLog.findFirst({
        where: { storeConfigId, syncType: 'full' },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.productSyncJob.findFirst({
        where: { storeConfigId, jobType: 'scheduled' },
      }),
    ])

  const stats = summaryStats[0]
  const matched = Number(stats?.matched ?? 0)
  const unmatched = Number(stats?.unmatched ?? 0)
  const multipleMatches = Number(stats?.multiple_matches ?? 0)
  const errorCount = Number(stats?.errors ?? 0)

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    summary: {
      total: matched + unmatched + multipleMatches,
      matched,
      unmatched,
      multipleMatches,
      priceOutOfSync: 0,
      qtyOutOfSync: 0,
      errors: errorCount,
      lastFullSync: lastFullLog?.completedAt?.toISOString() || null,
      nextSync: lastJob?.nextRunAt?.toISOString() || null,
    },
  })
}
