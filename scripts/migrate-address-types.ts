/**
 * Migration script to convert addressType field to boolean flags
 * 
 * This script converts existing CustomerAddress records from the old addressType
 * string field to the new boolean flags: isDefaultBilling, isDefaultShipping, isSavedAddress
 * 
 * IMPORTANT: Run this AFTER updating the Prisma schema but BEFORE the old addressType
 * column is removed. The script uses raw SQL to read the old column.
 * 
 * Run with: tsx scripts/migrate-address-types.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateAddressTypes() {
  console.log('🔄 Starting address type migration...')
  
  try {
    // Check if addressType column still exists using raw SQL
    const columns = await prisma.$queryRaw<Array<{ name: string; type: string }>>`
      PRAGMA table_info(CustomerAddress)
    `
    
    const hasAddressType = columns.some(col => col.name === 'addressType')
    const addressCount = await prisma.customerAddress.count()
    
    console.log(`📊 Found ${addressCount} addresses in database`)
    
    if (addressCount === 0) {
      console.log('✅ No addresses to migrate')
      return
    }
    
    if (!hasAddressType) {
      console.log('⚠️  addressType column not found.')
      console.log('   This could mean:')
      console.log('   1. Migration was already run')
      console.log('   2. Schema was updated and column removed')
      console.log('\n   Checking if addresses need default values...')
      
      // Check if any addresses have all flags false (might need migration)
      const addressesNeedingDefaults = await prisma.customerAddress.findMany({
        where: {
          isDefaultBilling: false,
          isDefaultShipping: false,
          isSavedAddress: false,
        },
      })
      
      if (addressesNeedingDefaults.length > 0) {
        console.log(`   Found ${addressesNeedingDefaults.length} addresses with all flags false`)
        console.log('   Setting isSavedAddress = true as default...')
        
        await prisma.customerAddress.updateMany({
          where: {
            isDefaultBilling: false,
            isDefaultShipping: false,
            isSavedAddress: false,
          },
          data: {
            isSavedAddress: true,
          },
        })
        
        console.log('✅ Set default values')
      } else {
        console.log('✅ All addresses already have flags set')
      }
      
      return
    }
    
    // Read addresses with addressType using raw SQL
    console.log('📖 Reading addresses with old addressType values...')
    const addressesWithType = await prisma.$queryRaw<Array<{
      id: number
      addressType: string | null
    }>>`
      SELECT id, addressType FROM CustomerAddress
    `
    
    console.log(`📝 Migrating ${addressesWithType.length} addresses...`)
    
    let migrated = 0
    let billingCount = 0
    let shippingCount = 0
    let savedCount = 0
    let defaultCount = 0
    
    for (const addr of addressesWithType) {
      const addressType = addr.addressType
      
      // Map old addressType to new boolean flags
      let isDefaultBilling = false
      let isDefaultShipping = false
      let isSavedAddress = false
      
      if (addressType === 'billing') {
        isDefaultBilling = true
        billingCount++
      } else if (addressType === 'shipping') {
        isDefaultShipping = true
        shippingCount++
      } else if (addressType === 'saved') {
        isSavedAddress = true
        savedCount++
      } else if (addressType === 'default') {
        // Default means both billing and shipping
        isDefaultBilling = true
        isDefaultShipping = true
        defaultCount++
      }
      
      // Update using Prisma (new columns should exist after schema update)
      await prisma.customerAddress.update({
        where: { id: addr.id },
        data: {
          isDefaultBilling,
          isDefaultShipping,
          isSavedAddress,
        },
      })
      
      migrated++
    }
    
    console.log(`\n✅ Migration complete!`)
    console.log(`   Migrated: ${migrated} addresses`)
    console.log(`   - Billing: ${billingCount}`)
    console.log(`   - Shipping: ${shippingCount}`)
    console.log(`   - Saved: ${savedCount}`)
    console.log(`   - Default: ${defaultCount}`)
    console.log('\n💡 Tip: Re-import orders to get accurate flags for new addresses')
    
  } catch (error) {
    console.error('❌ Error during migration:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run migration
migrateAddressTypes()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })

