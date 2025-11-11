import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchNetSuiteTransactions, matchNetSuiteTransactions } from '@/lib/netsuite'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    // Get payout and transactions
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        transactions: {
          include: {
            orderLine: {
              select: {
                shopifyOrderName: true,
              },
            },
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

    // Get transactions that need NetSuite IDs (have order name but no NetSuite transaction ID)
    const transactionsNeedingNS = payout.transactions.filter(
      (txn) =>
        (txn.orderLine?.shopifyOrderName || txn.shopifyOrderId) &&
        !txn.netsuiteTransactionId
    )

    if (transactionsNeedingNS.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All transactions already have NetSuite IDs',
        updated: 0,
        errors: [],
      })
    }

    // Group transactions by type (charge/refund) and collect order names
    const cashSales: string[] = []
    const refunds: string[] = []

    for (const txn of transactionsNeedingNS) {
      const orderName =
        txn.orderLine?.shopifyOrderName ||
        (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)

      if (!orderName) continue

      // Determine if it's a refund or cash sale based on transaction type or amount
      const isRefund =
        txn.type === 'refund' ||
        txn.amount === null ||
        (txn.amount !== null && txn.amount < 0)

      if (isRefund) {
        refunds.push(orderName)
      } else {
        cashSales.push(orderName)
      }
    }

    if (cashSales.length === 0 && refunds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No transactions to fetch',
        updated: 0,
        errors: [],
      })
    }

    // Prepare NetSuite request
    const payoutDate = payout.payoutDate || new Date()
    const netsuiteRequest = {
      account: 217, // Default account ID, could be made configurable
      memo: `Shopify payout ${payoutId.slice(-8)}`,
      date: payoutDate.toISOString().split('T')[0], // YYYY-MM-DD format
      cashsales: cashSales,
      refunds: refunds,
    }

    // Fetch from NetSuite
    const netsuiteData = await fetchNetSuiteTransactions(netsuiteRequest)

    if (netsuiteData.status !== 'success') {
      return NextResponse.json(
        {
          success: false,
          error: netsuiteData.message || 'NetSuite API returned error',
        },
        { status: 500 }
      )
    }

    // Match NetSuite transactions to our transactions by order name
    const transactionMap = new Map<string, typeof payout.transactions[0]>()
    for (const txn of payout.transactions) {
      const orderName =
        txn.orderLine?.shopifyOrderName ||
        (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)
      if (orderName) {
        // Store both with and without # for matching flexibility
        transactionMap.set(orderName, txn)
        if (orderName.startsWith('#')) {
          transactionMap.set(orderName.substring(1), txn)
        } else {
          transactionMap.set(`#${orderName}`, txn)
        }
      }
    }

    // Update transactions with NetSuite data
    let updated = 0
    const errors: string[] = []

    // Process cash sales
    for (const cashSale of netsuiteData.details.cashsales) {
      const txn = transactionMap.get(cashSale.otherrefnum)
      if (txn) {
        const shopifyAmount = txn.amount || txn.net || 0
        const netsuiteAmount = cashSale.amount
        const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01 // Allow 1 cent tolerance

        await prisma.payoutTransaction.update({
          where: { id: txn.id },
          data: {
            netsuiteTransactionId: String(cashSale.id),
            netsuiteTransactionName: cashSale.tranid,
            netsuiteAmount: netsuiteAmount,
            amountMismatch,
          },
        })

        updated++
        if (amountMismatch) {
          errors.push(
            `${cashSale.otherrefnum}: Amount mismatch - Shopify: ${shopifyAmount.toFixed(2)}, NetSuite: ${netsuiteAmount.toFixed(2)}`
          )
        }
      }
    }

    // Process refunds
    for (const refund of netsuiteData.details.refunds) {
      const txn = transactionMap.get(refund.otherrefnum)
      if (txn) {
        // Compare absolute values since Shopify might store refunds as positive or negative
        const shopifyAmount = Math.abs(txn.net || txn.amount || 0)
        const netsuiteAmount = Math.abs(refund.amount) // NetSuite refunds are negative
        const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01

        await prisma.payoutTransaction.update({
          where: { id: txn.id },
          data: {
            netsuiteTransactionId: String(refund.id),
            netsuiteTransactionName: refund.tranid,
            netsuiteAmount: refund.amount, // Keep negative for refunds
            amountMismatch,
          },
        })

        updated++
        if (amountMismatch) {
          errors.push(
            `${refund.otherrefnum}: Amount mismatch - Shopify: ${shopifyAmount.toFixed(2)}, NetSuite: ${netsuiteAmount.toFixed(2)}`
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} transaction(s) with NetSuite IDs`,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('❌ Error fetching NetSuite transactions:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch NetSuite transactions',
      },
      { status: 500 }
    )
  }
}

