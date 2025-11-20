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
    
    // Delete Orders (must come before CustomerAddresses and Customers due to foreign keys)
    let deletedOrders = { count: 0 }
    try {
      if ((prisma as any).order) {
        console.log('📦 Deleting Orders...')
        deletedOrders = await (prisma as any).order.deleteMany({})
        console.log(`   ✅ Deleted ${deletedOrders.count} orders`)
      }
    } catch (error) {
      console.warn('   ⚠️  Could not delete Orders (model may not exist):', error)
    }
    
    // Delete CustomerAddresses (must come before Customers due to foreign keys)
    let deletedAddresses = { count: 0 }
    try {
      console.log('📍 Deleting CustomerAddresses...')
      deletedAddresses = await prisma.customerAddress.deleteMany({})
      console.log(`   ✅ Deleted ${deletedAddresses.count} customer addresses`)
    } catch (error) {
      console.warn('   ⚠️  Could not delete CustomerAddresses:', error)
    }
    
    // Delete Customers (last, as nothing depends on it)
    let deletedCustomers = { count: 0 }
    try {
      console.log('👥 Deleting Customers...')
      deletedCustomers = await prisma.customer.deleteMany({})
      console.log(`   ✅ Deleted ${deletedCustomers.count} customers`)
    } catch (error) {
      console.warn('   ⚠️  Could not delete Customers:', error)
    }
    
    console.log('\n✅ Database cleanup completed successfully!')
    
    return NextResponse.json({
      success: true,
      message: 'Database cleared successfully',
      stats: {
        transactions: deletedTransactions.count,
        payouts: deletedPayouts.count,
        orderLines: deletedOrderLines.count,
        orders: deletedOrders.count,
        customerAddresses: deletedAddresses.count,
        customers: deletedCustomers.count,
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

