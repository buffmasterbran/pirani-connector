const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedPayoutMappings() {
  console.log('🌱 Seeding payout mapping data...')

  try {
    // Payout Mappings - using upsert to avoid duplicates
    const payoutMappings = [
      { mappingType: 'deposit_account', netsuiteId: '217', description: 'Default deposit account', isActive: true },
      { mappingType: 'fees_account', netsuiteId: '989', description: 'Shopify fees account', isActive: true },
      { mappingType: 'fees_description', netsuiteId: '', description: 'Shopify Fees', isActive: true },
    ]

    for (const mapping of payoutMappings) {
      // Check if this exact mapping already exists
      const existing = await prisma.payoutMapping.findFirst({
        where: {
          mappingType: mapping.mappingType,
          netsuiteId: mapping.netsuiteId,
          description: mapping.description
        }
      })

      if (existing) {
        // Update if exists
        await prisma.payoutMapping.update({
          where: { id: existing.id },
          data: mapping
        })
        console.log(`✅ Updated: ${mapping.mappingType}`)
      } else {
        // Create if doesn't exist
        await prisma.payoutMapping.create({
          data: mapping
        })
        console.log(`✅ Created: ${mapping.mappingType}`)
      }
    }

    console.log('✅ Payout mapping data seeded successfully!')
    console.log(`📊 Created/Updated: ${payoutMappings.length} Payout Mappings`)

  } catch (error) {
    console.error('❌ Error seeding payout mapping data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedPayoutMappings()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

