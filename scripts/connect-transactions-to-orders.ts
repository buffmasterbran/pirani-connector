import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function connectTransactionsToOrders() {
  try {
    console.log('🔗 Connecting PayoutTransactions to OrderLines...')
    
    // Get all transactions without orderLineId
    const transactions = await prisma.payoutTransaction.findMany({
      where: {
        orderLineId: null,
        shopifyOrderId: { not: null }
      },
      select: {
        id: true,
        shopifyOrderId: true,
        payoutId: true
      }
    })
    
    console.log(`📋 Found ${transactions.length} transactions without orderLineId`)
    
    let connected = 0
    let notFound = 0
    
    for (const transaction of transactions) {
      if (!transaction.shopifyOrderId) continue
      
      // Find matching OrderLine
      const orderLine = await prisma.orderLine.findFirst({
        where: {
          shopifyOrderId: transaction.shopifyOrderId,
          isDeleted: false
        },
        select: { id: true }
      })
      
      if (orderLine) {
        // Update transaction with orderLineId
        await prisma.payoutTransaction.update({
          where: { id: transaction.id },
          data: { orderLineId: orderLine.id }
        })
        connected++
        console.log(`✅ Connected transaction ${transaction.id} to OrderLine ${orderLine.id}`)
      } else {
        notFound++
        if (notFound <= 5) {
          console.log(`⚠️  No OrderLine found for transaction ${transaction.id} (shopifyOrderId: ${transaction.shopifyOrderId})`)
        }
      }
    }
    
    console.log(`\n📊 Summary:`)
    console.log(`   Total transactions processed: ${transactions.length}`)
    console.log(`   Successfully connected: ${connected}`)
    console.log(`   No matching OrderLine found: ${notFound}`)
    
    if (notFound > 0) {
      console.log(`\n💡 Tip: Import the missing orders first, then run this script again to connect them.`)
    }
    
  } catch (error) {
    console.error('❌ Error connecting transactions:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

connectTransactionsToOrders()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

