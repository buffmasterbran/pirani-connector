/**
 * Test script to directly test address saving functionality
 * This will help us debug why addresses aren't being saved
 */

// Environment variables are loaded automatically by Next.js/tsx
import { getOrderByNameFromShopify, saveCustomerAndAddresses } from '../src/lib/shopify'
import { prisma } from '../src/lib/prisma'

async function testAddressSaving() {
  const orderName = '#42256' // Use the order we've been testing
  
  console.log('='.repeat(80))
  console.log('🧪 TESTING ADDRESS SAVING')
  console.log('='.repeat(80))
  console.log(`\n📥 Fetching order ${orderName} from Shopify...`)
  
  try {
    // Step 1: Fetch order
    const order = await getOrderByNameFromShopify(orderName)
    
    if (!order) {
      console.error('❌ Order not found!')
      process.exit(1)
    }
    
    console.log(`✅ Order found: ${order.id} (${order.name})`)
    console.log(`   Has customer: ${!!order.customer}`)
    console.log(`   Has billing_address: ${!!order.billing_address}`)
    console.log(`   Has shipping_address: ${!!order.shipping_address}`)
    
    if (order.billing_address) {
      console.log(`   Billing: ${order.billing_address.address1}, ${order.billing_address.city}`)
    }
    if (order.shipping_address) {
      console.log(`   Shipping: ${order.shipping_address.address1}, ${order.shipping_address.city}`)
    }
    
    // Step 2: Check current state
    console.log(`\n📊 Current database state:`)
    const customerCount = await prisma.customer.count()
    const addressCount = await prisma.customerAddress.count()
    console.log(`   Customers: ${customerCount}`)
    console.log(`   Addresses: ${addressCount}`)
    
    if (order.customer?.id) {
      const shopifyCustomerId = String(order.customer.id)
      const existingCustomer = await prisma.customer.findUnique({
        where: { shopifyCustomerId },
        include: { addresses: true },
      })
      
      if (existingCustomer) {
        console.log(`   Customer ${shopifyCustomerId} exists with ${existingCustomer.addresses.length} addresses`)
        existingCustomer.addresses.forEach((addr, idx) => {
          console.log(`     Address ${idx + 1}: ${addr.address1}, ${addr.city} (Billing: ${addr.isDefaultBilling}, Shipping: ${addr.isDefaultShipping}, Saved: ${addr.isSavedAddress})`)
        })
      } else {
        console.log(`   Customer ${shopifyCustomerId} does not exist yet`)
      }
    }
    
    // Step 3: Save customer and addresses
    console.log(`\n💾 Calling saveCustomerAndAddresses...`)
    await saveCustomerAndAddresses(order)
    
    // Step 4: Check final state
    console.log(`\n📊 Final database state:`)
    const finalCustomerCount = await prisma.customer.count()
    const finalAddressCount = await prisma.customerAddress.count()
    console.log(`   Customers: ${finalCustomerCount}`)
    console.log(`   Addresses: ${finalAddressCount}`)
    
    if (order.customer?.id) {
      const shopifyCustomerId = String(order.customer.id)
      const finalCustomer = await prisma.customer.findUnique({
        where: { shopifyCustomerId },
        include: { addresses: true },
      })
      
      if (finalCustomer) {
        console.log(`   Customer ${shopifyCustomerId} now has ${finalCustomer.addresses.length} addresses:`)
        finalCustomer.addresses.forEach((addr, idx) => {
          console.log(`     Address ${idx + 1}:`)
          console.log(`       ID: ${addr.id}`)
          console.log(`       Address: ${addr.address1}, ${addr.city}, ${addr.zip}`)
          console.log(`       Flags: Billing=${addr.isDefaultBilling}, Shipping=${addr.isDefaultShipping}, Saved=${addr.isSavedAddress}`)
          console.log(`       Shopify Address ID: ${addr.shopifyAddressId || 'none'}`)
        })
      } else {
        console.error(`   ❌ Customer ${shopifyCustomerId} still does not exist!`)
      }
    }
    
    console.log(`\n✅ Test complete!`)
    
  } catch (error) {
    console.error('\n❌ Error during test:', error)
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`)
      console.error(`   Stack: ${error.stack}`)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testAddressSaving()

