import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    // Get payout with all transactions
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        transactions: {
          orderBy: {
            processedAt: 'asc',
          },
        },
      },
    })

    if (!payout) {
      return NextResponse.json(
        { success: false, error: 'Payout not found' },
        { status: 404 }
      )
    }

    // Get ALL transactions with NetSuite IDs (cash sales, refunds, and payments) that are included
    const transactionsWithNS = payout.transactions.filter(
      (txn) => 
        txn.netsuiteTransactionId && 
        txn.netsuiteTransactionId.trim() !== '' &&
        (txn.includeInNetSuite !== false)
    )

    // Separate transactions by type for different handling
    const cashSalesAndRefunds = transactionsWithNS.filter((txn) => {
      const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
      return name.startsWith('CS') || name.startsWith('RFND') || 
             name.includes('CASH SALE') || name.includes('CASH REFUND')
    })
    
    const payments = transactionsWithNS.filter((txn) => {
      const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
      return name.startsWith('PYMT') || name.startsWith('CUSTPYMT') || 
             name.includes('PAYMENT')
    })

    if (transactionsWithNS.length === 0) {
      const totalTransactions = payout.transactions.length
      return NextResponse.json(
        {
          success: false,
          error: `No transactions with NetSuite IDs found. Found ${totalTransactions} total transaction(s).`,
        },
        { status: 400 }
      )
    }

    // Calculate total fees (negative amount for "other" items) - only from included transactions
    const totalFees = payout.transactions
      .filter((txn) => txn.includeInNetSuite !== false)
      .reduce((sum, txn) => {
        return sum + (txn.fee || 0)
      }, 0)

    // Get payout mappings to resolve dropdown selections to account IDs and descriptions
    const payoutMappings = await prisma.payoutMapping.findMany({
      where: { isActive: true },
    })

    // Helper function to find mapping by netsuiteId or description
    const findMapping = (value: string | null | undefined) => {
      if (!value) return null
      return payoutMappings.find(
        (m) => m.netsuiteId === value || m.description === value
      )
    }

    // Collect transactions with dropdown selections and group by mapping
    const includedTransactions = payout.transactions.filter(
      (txn) => txn.includeInNetSuite !== false
    )

    // Map to store grouped dropdown items: key = netsuiteId, value = { description, totalAmount }
    const dropdownItemsMap = new Map<string, { description: string; amount: number }>()

    includedTransactions.forEach((txn) => {
      // Check amountDescription dropdown
      if (txn.amountDescription) {
        const mapping = findMapping(txn.amountDescription)
        if (mapping && mapping.netsuiteId) {
          const key = mapping.netsuiteId
          const existing = dropdownItemsMap.get(key) || { description: mapping.description || '', amount: 0 }
          existing.amount += Number(txn.amount) || 0
          dropdownItemsMap.set(key, existing)
        }
      }

      // Check feeDescription dropdown
      if (txn.feeDescription) {
        const mapping = findMapping(txn.feeDescription)
        if (mapping && mapping.netsuiteId) {
          const key = mapping.netsuiteId
          const existing = dropdownItemsMap.get(key) || { description: mapping.description || '', amount: 0 }
          existing.amount += Number(txn.fee) || 0
          dropdownItemsMap.set(key, existing)
        }
      }

      // Check otherFeesDescription dropdown
      if (txn.otherFeesDescription) {
        const mapping = findMapping(txn.otherFeesDescription)
        if (mapping && mapping.netsuiteId) {
          const key = mapping.netsuiteId
          const existing = dropdownItemsMap.get(key) || { description: mapping.description || '', amount: 0 }
          // For otherFeesDescription, use the amount field (or fee if amount is 0)
          const amountToUse = Number(txn.amount) || Number(txn.fee) || 0
          existing.amount += amountToUse
          dropdownItemsMap.set(key, existing)
        }
      }
    })

    // Prepare deposit request
    const payoutDate = payout.payoutDate || new Date()
    
    // Get NetSuite transaction IDs for cash sales, refunds, and payments - convert string to number
    // All transaction types go into payment.items with deposit: true
    const allDepositTransactions = [...cashSalesAndRefunds, ...payments]
    const depositItems = allDepositTransactions
      .map((txn) => {
        const nsId = txn.netsuiteTransactionId
        if (!nsId) return null
        const idNum = parseInt(nsId, 10)
        if (isNaN(idNum)) {
          return null
        }
        // Cash sales, refunds, and payments are all included as deposit items
        return { deposit: true, id: idNum }
      })
      .filter((item): item is { deposit: true; id: number } => item !== null)
      // Remove duplicates (in case same NetSuite transaction ID appears multiple times)
      .filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      )

    if (depositItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid NetSuite transaction IDs found',
        },
        { status: 400 }
      )
    }

    const depositRequest: {
      account: { id: string }
      trandate: string
      memo: string
      payment: { items: Array<{ deposit: boolean; id: number }> }
      other?: { items: Array<{ description: string; amount: number; account: { id: string } }> }
    } = {
      account: { id: '217' }, // Default account ID
      trandate: payoutDate.toISOString(),
      memo: `Shopify payout ${payoutId.slice(-8)}`,
      payment: {
        items: depositItems,
      },
    }

    // Build "other.items" array
    const otherItems: Array<{ description: string; amount: number; account: { id: string } }> = []

    // Add fees if there are any (always as negative value)
    if (totalFees !== 0) {
      otherItems.push({
        description: 'Shopify Fees',
        amount: totalFees < 0 ? totalFees : -Math.abs(totalFees), // Ensure negative
        account: { id: '989' }, // Fees account
      })
    }

    // Add dropdown items (grouped and summed)
    dropdownItemsMap.forEach((item, netsuiteId) => {
      if (item.amount !== 0) {
        otherItems.push({
          description: item.description,
          amount: item.amount,
          account: { id: netsuiteId },
        })
      }
    })

    // Only add "other" section if there are items
    if (otherItems.length > 0) {
      depositRequest.other = {
        items: otherItems,
      }
    }

    return NextResponse.json({
      success: true,
      depositRequest,
      stats: {
        totalTransactions: payout.transactions.length,
        transactionsWithNS: transactionsWithNS.length,
        totalFees,
        depositItemsCount: depositItems.length,
      },
    })
  } catch (error) {
    console.error('❌ Error previewing NetSuite deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to preview NetSuite deposit',
      },
      { status: 500 }
    )
  }
}

