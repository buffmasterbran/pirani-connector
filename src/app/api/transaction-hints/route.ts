import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET — return all hints (for Settings UI and TransactionRow)
export async function GET() {
  try {
    const hints = await prisma.transactionHint.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({ success: true, data: hints })
  } catch (error) {
    console.error('Error fetching transaction hints:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH — update a hint by id
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, message, icon, bgColor, textColor, isActive } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const data: any = {}
    if (message !== undefined) data.message = message
    if (icon !== undefined) data.icon = icon
    if (bgColor !== undefined) data.bgColor = bgColor
    if (textColor !== undefined) data.textColor = textColor
    if (isActive !== undefined) data.isActive = isActive

    const updated = await prisma.transactionHint.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Error updating transaction hint:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
