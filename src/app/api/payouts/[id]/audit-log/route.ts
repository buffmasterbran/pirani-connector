import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    const logs = await prisma.transactionAuditLog.findMany({
      where: { payoutId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
