import prisma from '@/lib/prisma'
import { runIncrementalSync } from './sync-engine'

/**
 * Simple in-memory scheduler for the POC.
 * Production deployments should replace this with a proper job runner (Bull, pg-boss, or cron).
 */

const activeIntervals = new Map<string, NodeJS.Timeout>()

export function isSchedulerRunning(storeConfigId: string): boolean {
  return activeIntervals.has(storeConfigId)
}

export function getSchedulerStatus(): Array<{
  storeConfigId: string
  running: boolean
}> {
  return Array.from(activeIntervals.keys()).map((id) => ({
    storeConfigId: id,
    running: true,
  }))
}

export async function startScheduler(storeConfigId: string): Promise<void> {
  if (activeIntervals.has(storeConfigId)) {
    return // Already running
  }

  const config = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
  })

  if (!config.syncEnabled || !config.isActive) {
    throw new Error('Store sync is disabled or inactive')
  }

  await scheduleNextRun(storeConfigId, config.syncIntervalMinutes)

  // Upsert the job record
  await prisma.productSyncJob.upsert({
    where: {
      storeConfigId_jobType: { storeConfigId, jobType: 'scheduled' },
    },
    create: {
      storeConfigId,
      jobType: 'scheduled',
      status: 'running',
      nextRunAt: new Date(Date.now() + config.syncIntervalMinutes * 60_000),
    },
    update: {
      status: 'running',
      nextRunAt: new Date(Date.now() + config.syncIntervalMinutes * 60_000),
    },
  })
}

export function stopScheduler(storeConfigId: string): void {
  const interval = activeIntervals.get(storeConfigId)
  if (interval) {
    clearTimeout(interval)
    activeIntervals.delete(storeConfigId)
  }

  // Fire-and-forget the job status update
  prisma.productSyncJob
    .updateMany({
      where: { storeConfigId, jobType: 'scheduled' },
      data: { status: 'completed', nextRunAt: null },
    })
    .catch(() => {})
}

export function stopAllSchedulers(): void {
  Array.from(activeIntervals.keys()).forEach((id) => {
    stopScheduler(id)
  })
}

async function scheduleNextRun(
  storeConfigId: string,
  intervalMinutes: number
): Promise<void> {
  const timeout = setTimeout(async () => {
    try {
      const result = await runIncrementalSync(storeConfigId)

      // Update job record
      await prisma.productSyncJob.updateMany({
        where: { storeConfigId, jobType: 'scheduled' },
        data: {
          lastRunAt: new Date(),
          lastRunLogId: result.logId || undefined,
        },
      })

      // Determine next interval based on low stock
      const nextInterval = await determineNextInterval(storeConfigId)
      await scheduleNextRun(storeConfigId, nextInterval)

      // Update next run time
      await prisma.productSyncJob.updateMany({
        where: { storeConfigId, jobType: 'scheduled' },
        data: {
          nextRunAt: new Date(Date.now() + nextInterval * 60_000),
        },
      })
    } catch (err) {
      console.error(`Scheduled sync failed for store ${storeConfigId}:`, err)
      // Retry with standard interval
      const config = await prisma.productSyncStoreConfig.findUnique({
        where: { id: storeConfigId },
      })
      if (config?.syncEnabled && config?.isActive) {
        await scheduleNextRun(storeConfigId, config.syncIntervalMinutes)
      } else {
        activeIntervals.delete(storeConfigId)
      }
    }
  }, intervalMinutes * 60_000)

  activeIntervals.set(storeConfigId, timeout)
}

async function determineNextInterval(storeConfigId: string): Promise<number> {
  const config = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
  })

  // Check if any synced items have low stock
  const lowStockCount = await prisma.productSyncMapping.count({
    where: {
      storeConfigId,
      matchStatus: 'matched',
      lastSyncedQuantity: { lt: config.lowStockThreshold },
    },
  })

  if (lowStockCount > 0) {
    return config.lowStockIntervalMinutes
  }

  return config.syncIntervalMinutes
}
