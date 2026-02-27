import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { fetchPriceLevels } from '@/lib/product-sync/netsuite'

function wrap(levels: { id: number; name: string }[]) {
  return NextResponse.json({ priceLevels: levels })
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true'

  try {
    if (!refresh) {
      const cached = await prisma.cachedNetSuitePriceLevel.findMany({ orderBy: { name: 'asc' } })
      if (cached.length > 0) {
        return wrap(cached.map((c) => ({ id: c.id, name: c.name })))
      }
      // Cache empty — fall through to fetch from NetSuite
    }

    const levels = await fetchPriceLevels()

    await prisma.$transaction([
      prisma.cachedNetSuitePriceLevel.deleteMany(),
      ...levels.map((lvl) =>
        prisma.cachedNetSuitePriceLevel.create({
          data: { id: Number(lvl.id), name: lvl.name, fetchedAt: new Date() },
        })
      ),
    ])

    return wrap(levels.map((l) => ({ id: Number(l.id), name: l.name })))
  } catch (err: any) {
    console.error('[product-sync] Failed to fetch price levels:', err.message || err)
    const fallback = await prisma.cachedNetSuitePriceLevel.findMany({ orderBy: { name: 'asc' } })
    if (fallback.length > 0) {
      return wrap(fallback.map((c) => ({ id: c.id, name: c.name })))
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
