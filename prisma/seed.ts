import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create sample payouts with transactions
  const payout1 = await prisma.payout.create({
    data: {
      id: BigInt('126882971905'),
      status: 'paid',
      date: new Date('2025-01-15'),
      amount: 1250.75,
      currency: 'USD',
      transactions: {
        create: [
          {
            id: BigInt('2599863681281'),
            sourceOrderId: BigInt('6517771272449'),
            amount: 67.90,
            fee: 2.10,
            net: 65.80,
            type: 'charge',
            currency: 'USD',
            processedAt: new Date('2025-01-15T19:31:36-04:00'),
          },
          {
            id: BigInt('2599863681282'),
            sourceOrderId: BigInt('6517771272450'),
            amount: 125.50,
            fee: 3.75,
            net: 121.75,
            type: 'charge',
            currency: 'USD',
            processedAt: new Date('2025-01-15T20:15:22-04:00'),
          },
          {
            id: BigInt('2599863681283'),
            sourceOrderId: BigInt('6517771272451'),
            amount: 89.99,
            fee: 2.70,
            net: 87.29,
            type: 'charge',
            currency: 'USD',
            processedAt: new Date('2025-01-15T21:45:11-04:00'),
          },
        ],
      },
    },
  })

  const payout2 = await prisma.payout.create({
    data: {
      id: BigInt('126882971906'),
      status: 'pending',
      date: new Date('2025-01-16'),
      amount: 890.25,
      currency: 'USD',
      transactions: {
        create: [
          {
            id: BigInt('2599863681284'),
            sourceOrderId: BigInt('6517771272452'),
            amount: 45.00,
            fee: 1.35,
            net: 43.65,
            type: 'charge',
            currency: 'USD',
            processedAt: new Date('2025-01-16T10:20:15-04:00'),
          },
          {
            id: BigInt('2599863681285'),
            sourceOrderId: BigInt('6517771272453'),
            amount: 78.50,
            fee: 2.35,
            net: 76.15,
            type: 'charge',
            currency: 'USD',
            processedAt: new Date('2025-01-16T14:30:45-04:00'),
          },
        ],
      },
    },
  })

  console.log('Sample data created successfully!')
  console.log('Payout 1:', payout1)
  console.log('Payout 2:', payout2)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
