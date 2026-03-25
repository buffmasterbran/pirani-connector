import { NextRequest, NextResponse } from 'next/server'
import { startScheduler, stopScheduler, isSchedulerRunning } from '@/lib/product-sync/sync-scheduler'

export async function POST(request: NextRequest) {
  try {
    const { storeConfigId, action } = await request.json()

    if (!storeConfigId || !action) {
      return NextResponse.json({ error: 'Missing storeConfigId or action' }, { status: 400 })
    }

    if (action === 'start') {
      await startScheduler(storeConfigId)
    } else if (action === 'stop') {
      stopScheduler(storeConfigId)
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({
      storeConfigId,
      schedulerRunning: isSchedulerRunning(storeConfigId),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
