import { NextRequest, NextResponse } from 'next/server'
import { runFullSync, runIncrementalSync, syncSingleItem } from '@/lib/product-sync/sync-engine'

export async function POST(request: NextRequest) {
  try {
    const { storeConfigId, syncType, itemSku } = await request.json()

    if (!storeConfigId || !syncType) {
      return NextResponse.json({ error: 'Missing storeConfigId or syncType' }, { status: 400 })
    }

    let result
    switch (syncType) {
      case 'full':
        result = await runFullSync(storeConfigId)
        break
      case 'incremental':
        result = await runIncrementalSync(storeConfigId)
        break
      case 'single':
        if (!itemSku) {
          return NextResponse.json({ error: 'itemSku required for single sync' }, { status: 400 })
        }
        result = await syncSingleItem(storeConfigId, itemSku)
        break
      default:
        return NextResponse.json({ error: 'Invalid syncType' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
