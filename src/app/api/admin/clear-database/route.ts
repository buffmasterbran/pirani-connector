import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    console.log('🗑️  Starting database cleanup via API...')
    
    // Delete in order to respect foreign key constraints
    console.log('📦 Deleting PayoutTransactions...')
    const deletedTransactions = await prisma.payoutTransaction.deleteMany({})
    console.log(`   ✅ Deleted ${deletedTransactions.count} transactions`)
    
    console.log('💰 Deleting Payouts...')
    const deletedPayouts = await prisma.payout.deleteMany({})
    console.log(`   ✅ Deleted ${deletedPayouts.count} payouts`)
    
    console.log('📋 Deleting OrderLines...')
    const deletedOrderLines = await prisma.orderLine.deleteMany({})
    console.log(`   ✅ Deleted ${deletedOrderLines.count} order lines`)
    
    console.log('\n✅ Database cleanup completed successfully!')
    
    return NextResponse.json({
      success: true,
      message: 'Database cleared successfully',
      stats: {
        transactions: deletedTransactions.count,
        payouts: deletedPayouts.count,
        orderLines: deletedOrderLines.count,
      },
    })
  } catch (error) {
    console.error('❌ Error clearing database:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear database',
      },
      { status: 500 }
    )
  }
}

