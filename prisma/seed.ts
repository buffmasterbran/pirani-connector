import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.payoutTransaction.deleteMany()
  await prisma.payout.deleteMany()
  await prisma.orderLine.deleteMany()

  await prisma.orderLine.createMany({
    data: [
          {
        shopifyOrderId: '6517771272449',
        shopifyOrderName: '#PCA-10234',
        shopifyOrderNumber: 10234,
        financialStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
            currency: 'USD',
        orderCreatedAt: new Date('2025-01-15T21:30:00Z'),
        orderSubtotal: 210,
        orderTax: 12.5,
        orderShipping: 12.99,
        orderDiscount: 0,
        orderTotal: 235.49,
        netsuiteSalesOrderId: 'SO-98123',
        netsuiteSalesOrderName: 'SO-98123',
        netsuiteDepositId: 'NSDEP123456',
        shopifyPayoutId: '126882971905',
        shopifyPayoutStatus: 'paid',
        expectedPayoutAmount: 235.49,
        actualDepositAmount: 235.49,
        varianceAmount: 0,
        depositCreatedAt: new Date('2025-01-16T15:30:00Z'),
        syncedShopifyAt: new Date('2025-01-15T12:05:00Z'),
        syncedNetsuiteAt: new Date('2025-01-16T16:00:00Z'),
        status: 'paid',
        paymentGatewayNames: JSON.stringify(['shopify_payments']),
        shippingLines: JSON.stringify([{ title: 'UPS Ground', price: '12.99' }]),
        customerId: '6978452019',
        customerEmail: 'operations@pirani.life',
        customerFirstName: 'Pirani',
        customerLastName: 'Operations',
        shippingAddress: JSON.stringify({
          first_name: 'Pirani',
          last_name: 'Operations',
          address1: '401 Biscayne Blvd',
          address2: 'Suite R-100',
          city: 'Miami',
          province: 'FL',
          zip: '33132',
          country: 'United States',
        }),
        lineItemId: '149921122001',
        lineItemSku: 'PCA-16OZ-SS',
        lineItemName: 'Pirani Party Tumbler',
        lineItemQuantity: 2,
        lineItemPrice: 35,
        lineItemTotal: 70,
        lineItemNet: 70,
        lineItemMetadata: JSON.stringify({}),
      },
      {
        shopifyOrderId: '6517771272449',
        shopifyOrderName: '#PCA-10234',
        shopifyOrderNumber: 10234,
        financialStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
            currency: 'USD',
        orderCreatedAt: new Date('2025-01-15T21:30:00Z'),
        orderSubtotal: 210,
        orderTax: 12.5,
        orderShipping: 12.99,
        orderDiscount: 0,
        orderTotal: 235.49,
        netsuiteSalesOrderId: 'SO-98123',
        netsuiteSalesOrderName: 'SO-98123',
        netsuiteDepositId: 'NSDEP123456',
        shopifyPayoutId: '126882971905',
        shopifyPayoutStatus: 'paid',
        expectedPayoutAmount: 235.49,
        actualDepositAmount: 235.49,
        varianceAmount: 0,
        depositCreatedAt: new Date('2025-01-16T15:30:00Z'),
        syncedShopifyAt: new Date('2025-01-15T12:05:00Z'),
        syncedNetsuiteAt: new Date('2025-01-16T16:00:00Z'),
        status: 'paid',
        paymentGatewayNames: JSON.stringify(['shopify_payments']),
        shippingLines: JSON.stringify([{ title: 'UPS Ground', price: '12.99' }]),
        customerId: '6978452019',
        customerEmail: 'operations@pirani.life',
        customerFirstName: 'Pirani',
        customerLastName: 'Operations',
        shippingAddress: JSON.stringify({
          first_name: 'Pirani',
          last_name: 'Operations',
          address1: '401 Biscayne Blvd',
          address2: 'Suite R-100',
          city: 'Miami',
          province: 'FL',
          zip: '33132',
          country: 'United States',
        }),
        lineItemId: '149921122002',
        lineItemSku: 'PCA-LID-BLK',
        lineItemName: 'Pirani Splash-Proof Lid',
        lineItemQuantity: 2,
        lineItemPrice: 8.5,
        lineItemTotal: 17,
        lineItemNet: 17,
        lineItemMetadata: JSON.stringify({}),
      },
      {
        shopifyOrderId: '6517771272450',
        shopifyOrderName: '#PCA-10235',
        shopifyOrderNumber: 10235,
        financialStatus: 'paid',
        fulfillmentStatus: 'unfulfilled',
            currency: 'USD',
        orderCreatedAt: new Date('2025-01-18T18:05:00Z'),
        orderSubtotal: 89.46,
        orderShipping: 9.99,
        orderTotal: 98.43,
        netsuiteSalesOrderId: null,
        netsuiteSalesOrderName: null,
        netsuiteDepositId: null,
        status: 'paid',
        paymentGatewayNames: JSON.stringify(['shopify_payments']),
        shippingLines: JSON.stringify([{ title: 'USPS Priority', price: '9.99' }]),
        customerId: '1452983102',
        customerEmail: 'jordan@pirani.life',
        customerFirstName: 'Jordan',
        customerLastName: 'Smith',
        shippingAddress: JSON.stringify({
          first_name: 'Jordan',
          last_name: 'Smith',
          address1: '100 Main Street',
          city: 'Asheville',
          province: 'NC',
          zip: '28801',
          country: 'United States',
        }),
        lineItemId: '149921122101',
        lineItemSku: 'PCA-16OZ-FOREST',
        lineItemName: 'Pirani Party Tumbler',
        lineItemQuantity: 3,
        lineItemPrice: 29.95,
        lineItemTotal: 89.85,
        lineItemNet: 89.85,
        lineItemMetadata: JSON.stringify({}),
    },
    ],
  })

  const createdLines = await prisma.orderLine.findMany({ where: { shopifyPayoutId: '126882971905' } })

  const payout = await prisma.payout.create({
    data: {
      id: '126882971905',
      status: 'paid',
      currency: 'USD',
      totalAmount: 235.49,
      payoutDate: new Date('2025-01-16T15:30:00Z'),
      type: 'deposit',
      transactions: {
        create: createdLines.map((line) => ({
          id: `txn-${line.lineItemId}`,
          shopifyOrderId: line.shopifyOrderId,
          orderLineId: line.id,
          amount: line.expectedPayoutAmount ?? line.lineItemTotal ?? 0,
          fee: 0,
          net: line.actualDepositAmount ?? line.lineItemNet ?? 0,
            type: 'charge',
          currency: line.currency,
          processedAt: line.depositCreatedAt ?? new Date('2025-01-16T15:30:00Z'),
        })),
      },
    },
  })

  console.log(`Seeded ${createdLines.length} order lines and payout ${payout.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
