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

    // Get transactions that need NetSuite IDs (have order name but no NetSuite transaction ID, and are included)
    const transactionsNeedingNS = payout.transactions.filter(
      (txn) =>
        (txn.orderLine?.shopifyOrderName || txn.shopifyOrderId) &&
        !txn.netsuiteTransactionId &&
        (txn.includeInNetSuite !== false)
    )

    if (transactionsNeedingNS.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All transactions already have NetSuite IDs',
        updated: 0,
        errors: [],
      })
    }

    // Group transactions by type (charge/refund/payment) and collect order names
    const cashSales: string[] = []
    const refunds: string[] = []
    const payments: string[] = []

    for (const txn of transactionsNeedingNS) {
      const orderName =
        txn.orderLine?.shopifyOrderName ||
        (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)

      if (!orderName) continue

      // Determine transaction type based on transaction type or amount
      const isRefund =
        txn.type === 'refund' ||
        txn.amount === null ||
        (txn.amount !== null && txn.amount < 0)
      
      const isPayment =
        txn.type === 'payment' ||
        txn.type === 'custpymt' ||
        txn.type?.toLowerCase().includes('payment')

      if (isPayment) {
        payments.push(orderName)
      } else if (isRefund) {
        refunds.push(orderName)
      } else {
        cashSales.push(orderName)
      }
    }

    if (cashSales.length === 0 && refunds.length === 0 && payments.length === 0) {
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
      payments: payments.length > 0 ? payments : undefined,
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

    // Match NetSuite transactions to our transactions by order name AND transaction type
    // Store ALL transactions for each order name (not just one) since orders can have both charges and refunds
    const transactionMap = new Map<string, Array<typeof payout.transactions[0]>>()
    for (const txn of payout.transactions) {
      // Only include transactions that are marked for NetSuite matching
      if (txn.includeInNetSuite === false) continue
      
      const orderName =
        txn.orderLine?.shopifyOrderName ||
        (txn.shopifyOrderId ? `#${txn.shopifyOrderId}` : null)
      if (orderName) {
        // Normalize order name for consistent matching
        const normalizedOrderName = orderName.startsWith('#') ? orderName : `#${orderName}`
        
        if (!transactionMap.has(normalizedOrderName)) {
          transactionMap.set(normalizedOrderName, [])
        }
        transactionMap.get(normalizedOrderName)!.push(txn)
        
        // Also store without # for matching flexibility
        const orderNameWithoutHash = orderName.startsWith('#') ? orderName.substring(1) : orderName
        if (!transactionMap.has(orderNameWithoutHash)) {
          transactionMap.set(orderNameWithoutHash, [])
        }
        transactionMap.get(orderNameWithoutHash)!.push(txn)
      }
    }

    // Helper function to normalize order name for matching
    const normalizeOrderName = (orderName: string): string => {
      return orderName.startsWith('#') ? orderName : `#${orderName}`
    }

    // Helper function to determine if a transaction is a refund
    const isRefundTransaction = (txn: typeof payout.transactions[0]): boolean => {
      return txn.type === 'refund' || 
             txn.amount === null || 
             (txn.amount !== null && txn.amount < 0)
    }

    // Update transactions with NetSuite data
    let updated = 0
    const errors: string[] = []

    // Process cash sales - only match to charge transactions
    for (const cashSale of netsuiteData.details.cashsales) {
      const normalizedOrderName = normalizeOrderName(cashSale.otherrefnum)
      const transactions = transactionMap.get(normalizedOrderName) || transactionMap.get(cashSale.otherrefnum) || []
      
      // Find charge transactions (not refunds) for this order
      const chargeTransactions = transactions.filter(txn => !isRefundTransaction(txn))
      
      // Try to match by amount first (most accurate)
      let matchedTxn = chargeTransactions.find(txn => {
        const shopifyAmount = txn.amount || txn.net || 0
        const netsuiteAmount = cashSale.amount
        return Math.abs(shopifyAmount - netsuiteAmount) < 0.01 // Within 1 cent tolerance
      })
      
      // If no exact amount match, use the first charge transaction (fallback)
      if (!matchedTxn && chargeTransactions.length > 0) {
        matchedTxn = chargeTransactions[0]
      }
      
      if (matchedTxn) {
        const shopifyAmount = matchedTxn.amount || matchedTxn.net || 0
        const netsuiteAmount = cashSale.amount
        const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01 // Allow 1 cent tolerance

        await prisma.payoutTransaction.update({
          where: { id: matchedTxn.id },
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

    // Process refunds - only match to refund transactions
    for (const refund of netsuiteData.details.refunds) {
      const normalizedOrderName = normalizeOrderName(refund.otherrefnum)
      const transactions = transactionMap.get(normalizedOrderName) || transactionMap.get(refund.otherrefnum) || []
      
      // Find refund transactions for this order
      const refundTransactions = transactions.filter(txn => isRefundTransaction(txn))
      
      // Try to match by amount first (most accurate)
      let matchedTxn = refundTransactions.find(txn => {
        // Compare absolute values since Shopify might store refunds as positive or negative
        const shopifyAmount = Math.abs(txn.net || txn.amount || 0)
        const netsuiteAmount = Math.abs(refund.amount) // NetSuite refunds are negative
        return Math.abs(shopifyAmount - netsuiteAmount) < 0.01 // Within 1 cent tolerance
      })
      
      // If no exact amount match, use the first refund transaction (fallback)
      if (!matchedTxn && refundTransactions.length > 0) {
        matchedTxn = refundTransactions[0]
      }
      
      if (matchedTxn) {
        // Compare absolute values since Shopify might store refunds as positive or negative
        const shopifyAmount = Math.abs(matchedTxn.net || matchedTxn.amount || 0)
        const netsuiteAmount = Math.abs(refund.amount) // NetSuite refunds are negative
        const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01

        await prisma.payoutTransaction.update({
          where: { id: matchedTxn.id },
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

    // Process payments - match to payment transactions
    if (netsuiteData.details.payments) {
      for (const payment of netsuiteData.details.payments) {
        const normalizedOrderName = normalizeOrderName(payment.otherrefnum)
        const transactions = transactionMap.get(normalizedOrderName) || transactionMap.get(payment.otherrefnum) || []
        
        // Find payment transactions for this order
        const paymentTransactions = transactions.filter(txn => 
          txn.type === 'payment' ||
          txn.type === 'custpymt' ||
          txn.type?.toLowerCase().includes('payment')
        )
        
        // Try to match by amount first (most accurate)
        // For payments, use net amount (after fees) for matching, as NetSuite payment amounts typically match the net
        let matchedTxn = paymentTransactions.find(txn => {
          const shopifyAmount = Math.abs(txn.net || txn.amount || 0)
          const netsuiteAmount = Math.abs(payment.amount)
          return Math.abs(shopifyAmount - netsuiteAmount) < 0.01 // Within 1 cent tolerance
        })
        
        // If no exact amount match, use the first payment transaction (fallback)
        if (!matchedTxn && paymentTransactions.length > 0) {
          matchedTxn = paymentTransactions[0]
        }
        
        // If no payment transaction found, try matching to any transaction for this order
        if (!matchedTxn) {
          const allTransactions = transactions.filter(txn => !isRefundTransaction(txn))
          matchedTxn = allTransactions.find(txn => {
            const shopifyAmount = Math.abs(txn.net || txn.amount || 0)
            const netsuiteAmount = Math.abs(payment.amount)
            return Math.abs(shopifyAmount - netsuiteAmount) < 0.01
          }) || allTransactions[0]
        }
        
        if (matchedTxn) {
          // For payments, compare net amount (after fees) with NetSuite amount
          // This is consistent with how we match payments above
          const shopifyAmount = Math.abs(matchedTxn.net || matchedTxn.amount || 0)
          const netsuiteAmount = Math.abs(payment.amount)
          const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01

          await prisma.payoutTransaction.update({
            where: { id: matchedTxn.id },
            data: {
              netsuiteTransactionId: String(payment.id),
              netsuiteTransactionName: payment.tranid,
              netsuiteAmount: payment.amount,
              amountMismatch,
            },
          })

          updated++
          if (amountMismatch) {
            errors.push(
              `${payment.otherrefnum}: Amount mismatch - Shopify: ${shopifyAmount.toFixed(2)}, NetSuite: ${netsuiteAmount.toFixed(2)}`
            )
          }
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

