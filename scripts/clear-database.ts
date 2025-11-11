import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearDatabase() {
  try {
    console.log('🗑️  Starting database cleanup...')
    
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
    
    // Optional: Delete mapping tables (uncomment if you want to clear these too)
    // console.log('🗺️  Deleting Mapping data...')
    // await prisma.paymentMethodMapping.deleteMany({})
    // await prisma.shipmentMethodMapping.deleteMany({})
    // await prisma.orderFieldMapping.deleteMany({})
    // await prisma.orderItemFieldMapping.deleteMany({})
    // await prisma.customerFieldMapping.deleteMany({})
    // await prisma.mappingDefaults.deleteMany({})
    // console.log('   ✅ Deleted all mapping data')
    
    console.log('\n✅ Database cleanup completed successfully!')
    console.log(`   - ${deletedTransactions.count} transactions deleted`)
    console.log(`   - ${deletedPayouts.count} payouts deleted`)
    console.log(`   - ${deletedOrderLines.count} order lines deleted`)
    
  } catch (error) {
    console.error('❌ Error clearing database:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

clearDatabase()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

