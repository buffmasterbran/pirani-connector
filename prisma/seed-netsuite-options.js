const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedNetSuiteOptions() {
  console.log('🌱 Seeding NetSuite options data...')

  try {
    // NetSuite Shipping Methods with Internal IDs
    const netsuiteShippingMethods = [
      { name: 'Do Not Post', id: null, type: 'shipment' },
      { name: 'Not Mapped', id: null, type: 'shipment' },
      { name: 'FedEx Standard Overnight®', id: '3', type: 'shipment' },
      { name: 'UPS® Ground', id: '4', type: 'shipment' },
      { name: 'Flate Rate', id: '288', type: 'shipment' },
      { name: 'Free Shipping', id: '293', type: 'shipment' },
      { name: 'LTL / Freight', id: '1031', type: 'shipment' },
      { name: 'Local Pickup', id: '1035', type: 'shipment' },
      { name: 'Economy International', id: '1036', type: 'shipment' },
      { name: 'Per Item Shipping', id: '1048', type: 'shipment' },
      { name: 'UPS® Ground + Freight Special ($750+)', id: '1055', type: 'shipment' },
      { name: 'DHL', id: '1222', type: 'shipment' },
      { name: 'UPS Worldwide Expedited®', id: '1238', type: 'shipment' }
    ]

    // NetSuite Payment Methods (from the previous image)
    const netsuitePaymentMethods = [
      { name: 'Shopify DTC Payout', id: 'shopify_dtc_payout', type: 'payment' },
      { name: '$0 Sales', id: 'zero_sales', type: 'payment' },
      { name: 'Cash', id: 'cash', type: 'payment' },
      { name: 'Credit Card', id: 'credit_card', type: 'payment' },
      { name: 'Deposit', id: 'deposit', type: 'payment' },
      { name: 'Other', id: 'other', type: 'payment' },
      { name: 'PayPal Express Checkout', id: 'paypal_express', type: 'payment' },
      { name: 'Check', id: 'check', type: 'payment' },
      { name: 'Wire Transfer', id: 'wire_transfer', type: 'payment' },
      { name: 'ACH', id: 'ach', type: 'payment' },
      { name: 'Money Order', id: 'money_order', type: 'payment' },
      { name: 'Bitcoin', id: 'bitcoin', type: 'payment' },
      { name: 'Gift Certificate', id: 'gift_certificate', type: 'payment' },
      { name: 'Store Credit', id: 'store_credit', type: 'payment' },
      { name: 'Refund', id: 'refund', type: 'payment' },
      { name: 'Chargeback', id: 'chargeback', type: 'payment' },
      { name: 'Adjustment', id: 'adjustment', type: 'payment' },
      { name: 'Fee', id: 'fee', type: 'payment' },
      { name: 'Discount', id: 'discount', type: 'payment' },
      { name: 'Tax', id: 'tax', type: 'payment' },
      { name: 'Shipping', id: 'shipping', type: 'payment' },
      { name: 'Handling', id: 'handling', type: 'payment' },
      { name: 'Insurance', id: 'insurance', type: 'payment' },
      { name: 'Duty', id: 'duty', type: 'payment' },
      { name: 'Custom Field 1', id: 'custom_field_1', type: 'payment' },
      { name: 'Custom Field 2', id: 'custom_field_2', type: 'payment' },
      { name: 'Custom Field 3', id: 'custom_field_3', type: 'payment' }
    ]

    console.log('✅ NetSuite options data prepared!')
    console.log(`📊 Available:`)
    console.log(`   - ${netsuiteShippingMethods.length} NetSuite Shipping Methods`)
    console.log(`   - ${netsuitePaymentMethods.length} NetSuite Payment Methods`)
    
    // Store this data in a format that can be used by the frontend
    console.log('\n🚚 NetSuite Shipping Methods:')
    netsuiteShippingMethods.forEach(method => {
      const displayName = method.id ? `${method.name} (IID: ${method.id})` : method.name
      console.log(`   - ${displayName}`)
    })
    
    console.log('\n💳 NetSuite Payment Methods:')
    netsuitePaymentMethods.forEach(method => {
      console.log(`   - ${method.name} (ID: ${method.id})`)
    })

  } catch (error) {
    console.error('❌ Error preparing NetSuite options data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedNetSuiteOptions()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
