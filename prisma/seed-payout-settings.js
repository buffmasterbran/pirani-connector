const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedPayoutSettings() {
  console.log('🌱 Seeding payout settings...')
  
  try {
    // Clear existing payout settings
    await prisma.payoutSettings.deleteMany({})
    console.log('🗑️ Cleared existing payout settings')

    // Define the initial payout settings based on Shopify configuration
    const payoutSettings = [
      {
        settingName: 'payout_base_account',
        settingDescription: 'Payout base account for main transactions',
        netsuiteAccountId: '217',
        settingType: 'account',
        defaultValue: '217',
        currentValue: '217',
        isActive: true
      },
      {
        settingName: 'payout_cash_back_account',
        settingDescription: 'Account for cash back transactions',
        netsuiteAccountId: '989',
        settingType: 'account',
        defaultValue: '989',
        currentValue: '989',
        isActive: true
      },
      {
        settingName: 'payout_other_account',
        settingDescription: 'Account for other types of transactions',
        netsuiteAccountId: '989',
        settingType: 'account',
        defaultValue: '989',
        currentValue: '989',
        isActive: true
      },
      {
        settingName: 'payout_undeposited_account',
        settingDescription: 'Account for undeposited funds',
        netsuiteAccountId: '989',
        settingType: 'account',
        defaultValue: '989',
        currentValue: '989',
        isActive: true
      },
      {
        settingName: 'payout_delay_factor',
        settingDescription: 'Delay factor for payouts in hours',
        netsuiteAccountId: '',
        settingType: 'delay',
        defaultValue: '36',
        currentValue: '36',
        isActive: true
      },
      {
        settingName: 'sum_fees_and_add_fee_line',
        settingDescription: 'Sum fees and add a fee line to payout',
        netsuiteAccountId: '',
        settingType: 'boolean',
        defaultValue: 'true',
        currentValue: 'true',
        isActive: true
      },
      {
        settingName: 'order_fee_name',
        settingDescription: 'Name for the order fee line item',
        netsuiteAccountId: '',
        settingType: 'text',
        defaultValue: 'fee',
        currentValue: 'fee',
        isActive: true
      },
      {
        settingName: 'add_non_imported_transactions',
        settingDescription: 'Add non-imported transactions as standalone lines',
        netsuiteAccountId: '',
        settingType: 'boolean',
        defaultValue: 'true',
        currentValue: 'true',
        isActive: true
      }
    ]

    // Insert the payout settings
    for (const setting of payoutSettings) {
      await prisma.payoutSettings.create({
        data: setting
      })
      console.log(`✅ Created setting: ${setting.settingName}`)
    }

    console.log('🎉 Payout settings seeded successfully!')
    
  } catch (error) {
    console.error('❌ Error seeding payout settings:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the seed function
seedPayoutSettings()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
