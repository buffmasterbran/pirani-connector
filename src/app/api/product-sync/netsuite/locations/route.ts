import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { fetchLocations } from '@/lib/product-sync/netsuite'

function wrap(locations: { id: number; name: string }[]) {
  return NextResponse.json({ locations })
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true'

  try {
    if (!refresh) {
      const cached = await prisma.cachedNetSuiteLocation.findMany({ orderBy: { name: 'asc' } })
      if (cached.length > 0) {
        return wrap(cached.map((c) => ({ id: c.id, name: c.name })))
      }
      // Cache empty — fall through to fetch from NetSuite
    }

    const locations = await fetchLocations()

    await prisma.$transaction([
      prisma.cachedNetSuiteLocation.deleteMany(),
      ...locations.map((loc) =>
        prisma.cachedNetSuiteLocation.create({
          data: { id: Number(loc.id), name: loc.name, fetchedAt: new Date() },
        })
      ),
    ])

    return wrap(locations.map((l) => ({ id: Number(l.id), name: l.name })))
  } catch (err: any) {
    console.error('[product-sync] Failed to fetch NS locations:', err.message || err)
    const fallback = await prisma.cachedNetSuiteLocation.findMany({ orderBy: { name: 'asc' } })
    if (fallback.length > 0) {
      return wrap(fallback.map((c) => ({ id: c.id, name: c.name })))
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
