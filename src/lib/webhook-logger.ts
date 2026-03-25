import prisma from '@/lib/prisma'

const MAX_LOGS = 50

export async function logWebhook(opts: {
  endpoint: string
  method?: string
  requestPayload: any
  responsePayload: any
  responseStatus: number
  durationMs: number
  source?: string
  itemCount?: number
  summary?: string
}) {
  try {
    await prisma.webhookLog.create({
      data: {
        endpoint: opts.endpoint,
        method: opts.method || 'POST',
        requestPayload: opts.requestPayload,
        responsePayload: opts.responsePayload,
        responseStatus: opts.responseStatus,
        durationMs: opts.durationMs,
        source: opts.source,
        itemCount: opts.itemCount,
        summary: opts.summary,
      },
    })

    // Purge old entries beyond MAX_LOGS
    const count = await prisma.webhookLog.count()
    if (count > MAX_LOGS) {
      const oldest = await prisma.webhookLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: count - MAX_LOGS,
        select: { id: true },
      })
      if (oldest.length > 0) {
        await prisma.webhookLog.deleteMany({
          where: { id: { in: oldest.map(o => o.id) } },
        })
      }
    }
  } catch (err) {
    console.warn('[webhook-logger] Failed to log webhook:', err)
  }
}
