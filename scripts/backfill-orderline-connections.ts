import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Backfills orderLineId for PayoutTransaction records that have shopifyOrderId
 * but don't have orderLineId set. This connects transactions to OrderLines
 * that were imported after the payouts.
 */
async function backfillOrderLineConnections() {
  try {
    console.log('🔄 Starting backfill of orderLineId connections...\n')

    // Find all transactions that have shopifyOrderId but no orderLineId
    const transactions = await prisma.payoutTransaction.findMany({
      where: {
        shopifyOrderId: { not: null },
        orderLineId: null,
      },
      select: {
        id: true,
        shopifyOrderId: true,
      },
    })

    console.log(`📋 Found ${transactions.length} transactions without orderLineId\n`)

    if (transactions.length === 0) {
      console.log('✅ All transactions already have orderLineId set!')
      return
    }

    let connected = 0
    let notFound = 0

    for (const transaction of transactions) {
      if (!transaction.shopifyOrderId) continue

      // Find matching OrderLine
      const orderLine = await prisma.orderLine.findFirst({
        where: {
          shopifyOrderId: transaction.shopifyOrderId,
          isDeleted: false,
        },
        select: {
          id: true,
          shopifyOrderName: true,
        },
      })

      if (orderLine) {
        // Update transaction with orderLineId
        await prisma.payoutTransaction.update({
          where: { id: transaction.id },
          data: { orderLineId: orderLine.id },
        })
        connected++
        console.log(`✅ Connected transaction ${transaction.id} to OrderLine ${orderLine.id} (${orderLine.shopifyOrderName})`)
      } else {
        notFound++
        console.log(`⚠️  No OrderLine found for transaction ${transaction.id} (shopifyOrderId: ${transaction.shopifyOrderId})`)
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   Connected: ${connected}`)
    console.log(`   Not found: ${notFound}`)
    console.log(`   Total: ${transactions.length}`)

    if (connected > 0) {
      console.log(`\n✅ Successfully connected ${connected} transactions to OrderLines!`)
    }
  } catch (error) {
    console.error('❌ Error during backfill:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

backfillOrderLineConnections()

