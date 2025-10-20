const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedMappings() {
  console.log('🌱 Seeding mapping data...')

  try {
    // Clear existing mapping data
    await prisma.paymentMethodMapping.deleteMany()
    await prisma.shipmentMethodMapping.deleteMany()
    await prisma.orderFieldMapping.deleteMany()
    await prisma.orderItemFieldMapping.deleteMany()
    await prisma.customerFieldMapping.deleteMany()
    await prisma.mappingDefaults.deleteMany()

    // Payment Method Mappings - Updated to use Shopify codes and NetSuite IDs
    const paymentMappings = [
      { shopifyCode: 'shopify_payments', netsuiteId: '177' },
      { shopifyCode: 'visa', netsuiteId: '228' },
      { shopifyCode: 'mastercard', netsuiteId: '228' },
      { shopifyCode: 'american_express', netsuiteId: '228' },
      { shopifyCode: 'discover', netsuiteId: '228' },
      { shopifyCode: 'unknown', netsuiteId: '0' },
      { shopifyCode: 'blank', netsuiteId: '0' }
    ]

    for (const mapping of paymentMappings) {
      await prisma.paymentMethodMapping.create({ data: mapping })
    }

    // Shipment Method Mappings - Updated to use Shopify codes and NetSuite IDs
    const shipmentMappings = [
      { shopifyCode: 'free_shipping', netsuiteId: '293' },
      { shopifyCode: 'standard_shipping', netsuiteId: '288' },
      { shopifyCode: 'local_pickup', netsuiteId: '1035' },
      { shopifyCode: 'asheville', netsuiteId: '1035' },
      { shopifyCode: 'flat_rate', netsuiteId: '288' },
      { shopifyCode: 'ups_ground', netsuiteId: '4' },
      { shopifyCode: 'dhl', netsuiteId: '1222' },
      { shopifyCode: 'dhl_express_worldwide', netsuiteId: '1222' },
      { shopifyCode: 'economy_international', netsuiteId: '1036' }
    ]

    for (const mapping of shipmentMappings) {
      await prisma.shipmentMethodMapping.create({ data: mapping })
    }

    // Order Field Mappings - Updated to use Shopify codes/values and NetSuite IDs
    const orderMappings = [
      { shopifyValue: 'Online Sales', netsuiteId: '11', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Unchecked', netsuiteId: 'false', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Default Location', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyCode: 'order_id', netsuiteId: 'otherRefNum', mappingType: 'Order Header', applyToAllAccounts: false },
      { shopifyValue: 'Checked', netsuiteId: 'true', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Pending Fulfillment', netsuiteId: '_pendingFulfillment', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Direct to Consumer', netsuiteId: '1833', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Pirani Website', netsuiteId: '12', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'Urgent', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyCode: 'created_at', netsuiteId: 'custbody_pir_shop_order_date', mappingType: 'Order Header', applyToAllAccounts: true },
      { shopifyValue: 'Sales Channel', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyValue: 'SO Category', netsuiteId: '28', mappingType: 'Fixed', applyToAllAccounts: true },
      { shopifyCode: 'id', netsuiteId: 'custbody_shopify_source_order_id', mappingType: 'Order Header', applyToAllAccounts: true },
      { shopifyCode: 'name', netsuiteId: 'custbody_fa_channel_order', mappingType: 'Order Header', applyToAllAccounts: true }
    ]

    for (const mapping of orderMappings) {
      await prisma.orderFieldMapping.create({ data: mapping })
    }

    // Order Item Field Mappings - Updated to use Shopify codes/values and NetSuite IDs
    const orderItemMappings = [
      { shopifyValue: 'Base Rate (MSRP)', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: false },
      { shopifyCode: 'properties._pca_preview_url', netsuiteId: 'custcol_custom_image_url', mappingType: 'Order Line', applyToAllAccounts: false },
      { shopifyCode: 'properties._pca_barcode', netsuiteId: 'custcol_customization_barcode', mappingType: 'Order Line', applyToAllAccounts: false },
      { shopifyCode: 'properties.CustomizationType', netsuiteId: 'custcol_item_notes', mappingType: 'Order Line', applyToAllAccounts: false },
      { shopifyCode: 'properties.CustomizationValue', netsuiteId: 'custcol_item_notes_2', mappingType: 'Order Line', applyToAllAccounts: false },
      { shopifyCode: 'properties.CustomizationFont', netsuiteId: 'custcol_item_notes_font', mappingType: 'Order Line', applyToAllAccounts: false }
    ]

    for (const mapping of orderItemMappings) {
      await prisma.orderItemFieldMapping.create({ data: mapping })
    }

    // Customer Field Mappings - Updated to use Shopify codes/values and NetSuite IDs
    const customerMappings = [
      { shopifyValue: '6 Pirani Life : Websales', netsuiteId: '1833', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true },
      { shopifyValue: 'Base Rate (MSRP)', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true },
      { shopifyValue: 'Pirani Life, Inc', netsuiteId: '2', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true },
      { shopifyValue: 'Direct to Consumer', netsuiteId: '28', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true },
      { shopifyValue: 'Direct to Consumer', netsuiteId: '1', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true },
      { shopifyValue: 'Pirani Website', netsuiteId: '12', mappingType: 'Fixed', applyToAllAccounts: true, isActive: true }
    ]

    for (const mapping of customerMappings) {
      await prisma.customerFieldMapping.create({ data: mapping })
    }

    // Mapping Defaults
    const defaults = [
      { mappingType: 'payment', defaultShopifyValue: 'Do Not Post', defaultNetsuiteValue: 'do_not_post' },
      { mappingType: 'shipment', defaultShopifyValue: 'Do Not Post', defaultNetsuiteValue: 'do_not_post' },
      { mappingType: 'order', defaultShopifyValue: 'Fixed', defaultNetsuiteValue: 'fixed' },
      { mappingType: 'order_item', defaultShopifyValue: 'Fixed', defaultNetsuiteValue: 'fixed' },
      { mappingType: 'customer', defaultShopifyValue: 'Fixed', defaultNetsuiteValue: 'fixed' }
    ]

    for (const defaultMapping of defaults) {
      await prisma.mappingDefaults.create({ data: defaultMapping })
    }

    console.log('✅ Mapping data seeded successfully!')
    console.log(`📊 Created:`)
    console.log(`   - ${paymentMappings.length} Payment Method Mappings`)
    console.log(`   - ${shipmentMappings.length} Shipment Method Mappings`)
    console.log(`   - ${orderMappings.length} Order Field Mappings`)
    console.log(`   - ${orderItemMappings.length} Order Item Field Mappings`)
    console.log(`   - ${customerMappings.length} Customer Field Mappings`)
    console.log(`   - ${defaults.length} Mapping Defaults`)

  } catch (error) {
    console.error('❌ Error seeding mapping data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedMappings()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
