/**
 * Deep verification script to check all data saved from order import
 * 
 * This script verifies:
 * - OrderLine records
 * - Customer records
 * - CustomerAddress records (with new boolean flags)
 * - PayoutTransaction records (if any)
 * - Data integrity and relationships
 * 
 * Run with: tsx scripts/verify-order-import.ts [orderId]
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function verifyOrderImport(orderId?: string) {
  console.log('🔍 Starting deep verification of order import...\n')
  
  try {
    // 1. Check OrderLine records
    console.log('📦 Checking OrderLine records...')
    const orderLines = orderId
      ? await prisma.orderLine.findMany({
          where: { shopifyOrderId: orderId },
        })
      : await prisma.orderLine.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
        })
    
    console.log(`   Found ${orderLines.length} OrderLine record(s)`)
    
    if (orderLines.length > 0) {
      const sampleLine = orderLines[0]
      console.log(`\n   Sample OrderLine:`)
      console.log(`   - ID: ${sampleLine.id}`)
      console.log(`   - Shopify Order ID: ${sampleLine.shopifyOrderId}`)
      console.log(`   - Order Name: ${sampleLine.shopifyOrderName}`)
      console.log(`   - Line Item ID: ${sampleLine.lineItemId}`)
      console.log(`   - Line Item Name: ${sampleLine.lineItemName}`)
      console.log(`   - Customer ID: ${sampleLine.customerId}`)
      console.log(`   - Customer Email: ${sampleLine.customerEmail}`)
      console.log(`   - Order Total: ${sampleLine.orderTotal}`)
      console.log(`   - Created At: ${sampleLine.createdAt}`)
      
      // Check for all line items
      const uniqueOrders = new Set(orderLines.map(ol => ol.shopifyOrderId))
      console.log(`\n   Unique Orders: ${uniqueOrders.size}`)
      uniqueOrders.forEach(orderId => {
        const lines = orderLines.filter(ol => ol.shopifyOrderId === orderId)
        console.log(`   - Order ${orderId}: ${lines.length} line item(s)`)
      })
    }
    
    // 2. Check Customer records
    console.log('\n👥 Checking Customer records...')
    const customers = await prisma.customer.findMany({
      take: 10,
      orderBy: { createdAtDb: 'desc' },
      include: {
        addresses: true,
        _count: {
          select: {
            addresses: true,
          },
        },
      },
    })
    
    console.log(`   Found ${customers.length} Customer record(s)`)
    
    if (customers.length > 0) {
      customers.forEach((customer, idx) => {
        console.log(`\n   Customer ${idx + 1}:`)
        console.log(`   - ID: ${customer.id}`)
        console.log(`   - Shopify Customer ID: ${customer.shopifyCustomerId}`)
        console.log(`   - Name: ${customer.firstName} ${customer.lastName}`)
        console.log(`   - Email: ${customer.email}`)
        console.log(`   - Phone: ${customer.phone}`)
        console.log(`   - NetSuite Customer ID: ${customer.netsuiteCustomerId || 'None'}`)
        console.log(`   - Address Count: ${customer._count.addresses}`)
        console.log(`   - Created At: ${customer.createdAtDb}`)
        
        if (customer.addresses.length > 0) {
          console.log(`   - Addresses:`)
          customer.addresses.forEach((addr, addrIdx) => {
            console.log(`     ${addrIdx + 1}. Address ID: ${addr.id}`)
            console.log(`        - isDefaultBilling: ${addr.isDefaultBilling}`)
            console.log(`        - isDefaultShipping: ${addr.isDefaultShipping}`)
            console.log(`        - isSavedAddress: ${addr.isSavedAddress}`)
            console.log(`        - Address: ${addr.address1}, ${addr.city}, ${addr.zip}`)
            console.log(`        - Shopify Address ID: ${addr.shopifyAddressId || 'None'}`)
          })
        } else {
          console.log(`   ⚠️  No addresses found for this customer!`)
        }
      })
    }
    
    // 3. Check CustomerAddress records
    console.log('\n📍 Checking CustomerAddress records...')
    const addresses = await prisma.customerAddress.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    
    console.log(`   Found ${addresses.length} CustomerAddress record(s)`)
    
    if (addresses.length > 0) {
      console.log(`\n   Address breakdown:`)
      const billingCount = addresses.filter(a => a.isDefaultBilling).length
      const shippingCount = addresses.filter(a => a.isDefaultShipping).length
      const savedCount = addresses.filter(a => a.isSavedAddress).length
      const bothFlagsCount = addresses.filter(a => a.isDefaultBilling && a.isDefaultShipping).length
      
      console.log(`   - Default Billing: ${billingCount}`)
      console.log(`   - Default Shipping: ${shippingCount}`)
      console.log(`   - Saved Address: ${savedCount}`)
      console.log(`   - Both Billing & Shipping: ${bothFlagsCount}`)
      
      console.log(`\n   Sample Address:`)
      const sampleAddr = addresses[0]
      console.log(`   - ID: ${sampleAddr.id}`)
      console.log(`   - Customer: ${sampleAddr.customer.firstName} ${sampleAddr.customer.lastName} (${sampleAddr.customer.email})`)
      console.log(`   - Flags: Billing=${sampleAddr.isDefaultBilling}, Shipping=${sampleAddr.isDefaultShipping}, Saved=${sampleAddr.isSavedAddress}`)
      console.log(`   - Address: ${sampleAddr.address1}, ${sampleAddr.city}, ${sampleAddr.zip}`)
      console.log(`   - Created At: ${sampleAddr.createdAt}`)
    } else {
      console.log(`   ⚠️  No addresses found! This might indicate an issue with address saving.`)
    }
    
    // 4. Check PayoutTransaction records
    console.log('\n💰 Checking PayoutTransaction records...')
    const transactions = await prisma.payoutTransaction.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        orderLine: {
          select: {
            id: true,
            shopifyOrderId: true,
            shopifyOrderName: true,
          },
        },
      },
    })
    
    console.log(`   Found ${transactions.length} PayoutTransaction record(s)`)
    
    if (transactions.length > 0) {
      const sampleTx = transactions[0]
      console.log(`\n   Sample Transaction:`)
      console.log(`   - ID: ${sampleTx.id}`)
      console.log(`   - Shopify Order ID: ${sampleTx.shopifyOrderId}`)
      console.log(`   - Order Line ID: ${sampleTx.orderLineId || 'None'}`)
      console.log(`   - Amount: ${sampleTx.amount}`)
      console.log(`   - Type: ${sampleTx.type}`)
    }
    
    // 5. Data integrity checks
    console.log('\n🔗 Checking data integrity...')
    
    // Check for orphaned addresses
    const orphanedAddresses = await prisma.customerAddress.findMany({
      where: {
        customer: null,
      },
    })
    console.log(`   Orphaned addresses: ${orphanedAddresses.length} (should be 0)`)
    
    // Check for OrderLines without customer info
    const orderLinesWithoutCustomer = await prisma.orderLine.findMany({
      where: {
        customerId: null,
      },
      take: 5,
    })
    console.log(`   OrderLines without customerId: ${orderLinesWithoutCustomer.length}`)
    
    // Check for addresses with all flags false
    const addressesWithNoFlags = await prisma.customerAddress.findMany({
      where: {
        isDefaultBilling: false,
        isDefaultShipping: false,
        isSavedAddress: false,
      },
    })
    console.log(`   Addresses with no flags set: ${addressesWithNoFlags.length}`)
    
    // Summary
    console.log('\n📊 Summary:')
    console.log(`   ✅ OrderLine records: ${orderLines.length}`)
    console.log(`   ✅ Customer records: ${customers.length}`)
    console.log(`   ${addresses.length > 0 ? '✅' : '⚠️ '} CustomerAddress records: ${addresses.length}`)
    console.log(`   ✅ PayoutTransaction records: ${transactions.length}`)
    
    if (addresses.length === 0 && customers.length > 0) {
      console.log('\n⚠️  WARNING: Customers exist but no addresses found!')
      console.log('   This might indicate an issue with the address saving logic.')
    }
    
  } catch (error) {
    console.error('❌ Error during verification:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Get order ID from command line args if provided
const orderId = process.argv[2]

verifyOrderImport(orderId)
  .catch((error) => {
    console.error('Verification failed:', error)
    process.exit(1)
  })

