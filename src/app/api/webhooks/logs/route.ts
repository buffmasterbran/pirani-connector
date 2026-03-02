import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
    const endpoint = request.nextUrl.searchParams.get('endpoint')

    const where = endpoint ? { endpoint } : {}

    const logs = await prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('[webhook-logs] Error fetching logs:', error)
    return NextResponse.json({ logs: [], error: 'Failed to fetch logs' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await prisma.webhookLog.deleteMany()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[webhook-logs] Error clearing logs:', error)
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 })
  }
}
