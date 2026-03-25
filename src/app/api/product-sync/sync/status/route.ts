import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isSchedulerRunning } from '@/lib/product-sync/sync-scheduler'

export async function GET(request: NextRequest) {
  const storeConfigId = request.nextUrl.searchParams.get('storeConfigId')
  if (!storeConfigId) {
    return NextResponse.json({ error: 'Missing storeConfigId' }, { status: 400 })
  }

  const [job, lastLog] = await Promise.all([
    prisma.productSyncJob.findFirst({
      where: { storeConfigId, jobType: 'scheduled' },
    }),
    prisma.productSyncLog.findFirst({
      where: { storeConfigId },
      orderBy: { startedAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    schedulerRunning: isSchedulerRunning(storeConfigId),
    job,
    lastLog,
  })
}
