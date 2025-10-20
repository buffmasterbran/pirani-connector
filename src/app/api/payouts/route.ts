import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('=== FETCHING PAYOUTS FROM DATABASE ===')
    const payouts = await prisma.payout.findMany({
      include: {
        transactions: true,
      },
      orderBy: {
        date: 'desc',
      },
    })

    // Convert BigInt values to strings for JSON serialization
    const serializedPayouts = payouts.map(payout => ({
      ...payout,
      id: payout.id.toString(),
      transactions: payout.transactions.map(transaction => ({
        ...transaction,
        id: transaction.id.toString(),
        payoutId: transaction.payoutId.toString(),
        sourceOrderId: transaction.sourceOrderId.toString(),
      }))
    }))

    console.log(`✅ Found ${serializedPayouts.length} payouts in database`)
    return NextResponse.json({ payouts: serializedPayouts })
  } catch (error) {
    console.error('Error fetching payouts from database:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payouts from database' },
      { status: 500 }
    )
  }
}
