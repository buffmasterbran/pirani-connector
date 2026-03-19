import { NextRequest, NextResponse } from 'next/server'
import { runAutoAssignRules } from '@/lib/auto-assign'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { payoutId } = await request.json()

    if (!payoutId) {
      return NextResponse.json(
        { success: false, error: 'payoutId is required' },
        { status: 400 }
      )
    }

    const result = await runAutoAssignRules(payoutId)

    return NextResponse.json({
      success: true,
      applied: result.applied,
      skipped: result.skipped,
      details: result.details,
    })
  } catch (error) {
    console.error('Error running auto-assign:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to run auto-assign rules' },
      { status: 500 }
    )
  }
}
