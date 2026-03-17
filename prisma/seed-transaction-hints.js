const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const defaultHints = [
  {
    code: 'excluded',
    label: 'Excluded from Deposit',
    message: 'Excluded from NetSuite deposit. Change the dropdown to re-include.',
    icon: '\u26AA',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-500',
    sortOrder: 1,
  },
  {
    code: 'dropdown_assigned',
    label: 'Dropdown Assigned',
    message: 'Mapped to a deposit dropdown \u2014 will go in the "Other" section of the deposit.',
    icon: '\u2705',
    bgColor: 'bg-green-50/50',
    textColor: 'text-green-700',
    sortOrder: 2,
  },
  {
    code: 'edited_mismatch',
    label: 'Edited Order + Mismatch',
    message: 'Edited order with amount mismatch. Try merging with the other charge for this order. If it spans multiple payouts, you may need to delete the cash sale and invoice in NS, then re-process using Process Marketplace Order.',
    icon: '\u270F\uFE0F',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    sortOrder: 3,
  },
  {
    code: 'mismatch',
    label: 'Amount Mismatch',
    message: 'Amount mismatch! NetSuite amount differs from Shopify. Check if the order was edited or split across payouts.',
    icon: '\u26A0\uFE0F',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    sortOrder: 4,
  },
  {
    code: 'has_splits',
    label: 'Split Transaction',
    message: 'This transaction is split. Expand to see individual NS IDs. Each split needs its own NS transaction.',
    icon: '\u2702\uFE0F',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    sortOrder: 5,
  },
  {
    code: 'edited_missing',
    label: 'Edited Order - Missing NS ID',
    message: 'Edited order \u2014 customer changed their order after purchase, creating extra charges. Try merging with the other line for this order. If it spans multiple payouts, you may need to delete the cash sale/invoice in NS and re-process.',
    icon: '\u270F\uFE0F',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-800',
    sortOrder: 6,
  },
  {
    code: 'marketplace_charge',
    label: 'Marketplace Charge - Missing NS ID',
    message: 'Marketplace order missing NS ID. Click the store icon to run Process Marketplace Order (deletes cash sale, edits SO, creates invoice + payment).',
    icon: '\uD83C\uDFEA',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    sortOrder: 7,
  },
  {
    code: 'marketplace_credit',
    label: 'Marketplace Credit - Missing NS ID',
    message: 'Marketplace credit missing NS ID. Click the store icon to process \u2014 if the invoice exists, it will create a payment for this amount.',
    icon: '\uD83C\uDFEA',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    sortOrder: 8,
  },
  {
    code: 'adjustment',
    label: 'Adjustment - Missing NS ID',
    message: 'This is a "{reason}" adjustment. Use the dropdown to map it to the correct GL account, or click + to manually add a NS transaction.',
    icon: '\uD83D\uDCCB',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    sortOrder: 9,
  },
  {
    code: 'charge_refund_missing',
    label: 'Charge/Refund - Missing NS ID',
    message: 'Missing NetSuite ID. Try "Get Missing NS Transactions" first. If not found, use + to manually add or the store icon for marketplace orders.',
    icon: '\u2753',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    sortOrder: 10,
  },
  {
    code: 'other_missing',
    label: 'Other - Missing NS ID',
    message: 'No NetSuite ID. Use the dropdown to map to a GL account, or + to add manually.',
    icon: '\u2753',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    sortOrder: 11,
  },
]

async function main() {
  console.log('Seeding transaction hints...')

  for (const hint of defaultHints) {
    await prisma.transactionHint.upsert({
      where: { code: hint.code },
      update: {},  // Don't overwrite existing edits
      create: hint,
    })
    console.log(`  \u2713 ${hint.code}: ${hint.label}`)
  }

  console.log(`Done! ${defaultHints.length} hints seeded.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
