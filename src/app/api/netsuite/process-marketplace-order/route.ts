import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  checkOrderState,
  deleteCashSale,
  updateSOForMarketplace,
  createInvoiceFromSO,
  createPaymentForInvoice,
  processMarketplaceOrder,
} from '@/lib/netsuite'

export const dynamic = 'force-dynamic'

/**
 * Look up the tax amount from sibling "Tax Adjustment" payout transactions
 * for the same order. Returns the absolute tax amount (positive number).
 */
async function lookupTaxAdjustment(orderName: string, transactionId?: string): Promise<number> {
  try {
    // Find the payout ID from the transaction
    if (!transactionId) return 0
    const txn = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
      select: { payoutId: true, shopifyOrderId: true },
    })
    if (!txn?.payoutId) return 0

    // Find sibling Tax Adjustment transactions in the same payout for the same order
    const taxTxns = await prisma.payoutTransaction.findMany({
      where: {
        payoutId: txn.payoutId,
        adjustmentReason: 'Tax Adjustment',
        ...(txn.shopifyOrderId ? { shopifyOrderId: txn.shopifyOrderId } : {}),
      },
      select: { amount: true },
    })

    if (taxTxns.length === 0) return 0

    // Sum the absolute amounts (tax adjustments are negative debits)
    const total = taxTxns.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)
    return total
  } catch (error) {
    console.error('⚠️ Error looking up tax adjustment:', error)
    return 0
  }
}

/**
 * GET — Check current NS state for an order.
 * ?orderName=#54031
 */
export async function GET(request: NextRequest) {
  try {
    const orderName = request.nextUrl.searchParams.get('orderName')
    if (!orderName) {
      return NextResponse.json({ error: 'orderName is required' }, { status: 400 })
    }

    const state = await checkOrderState(orderName)
    return NextResponse.json({ success: true, state })
  } catch (error) {
    console.error('❌ Error checking marketplace order state:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST — Execute a processing step (or all steps) for a marketplace order.
 *
 * Body: {
 *   orderName: string,          // e.g., "#54031"
 *   step: "check" | "delete-cash-sale" | "update-sales-order" | "create-invoice" | "create-payment" | "auto",
 *   transactionId?: string,     // PayoutTransaction ID (for DB update after payment)
 *   paymentAmount?: number,     // Amount for the payment
 *   currency?: string,          // e.g., "USD"
 *   tranDate?: string,          // Date for invoice/payment (YYYY-MM-DD)
 *   cashSaleId?: string,        // NS internal ID (from check step)
 *   salesOrderId?: string,      // NS internal ID (from check step)
 *   invoiceId?: string,         // NS internal ID (from check step or create-invoice)
 *   customerId?: string,        // NS internal ID (from check step)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      orderName,
      step,
      transactionId,
      paymentAmount,
      currency = 'USD',
      tranDate,
      cashSaleId,
      salesOrderId,
      invoiceId,
      customerId,
    } = body

    if (!orderName || !step) {
      return NextResponse.json({ error: 'orderName and step are required' }, { status: 400 })
    }

    console.log(`🏪 Process marketplace order: ${orderName}, step: ${step}`)

    // --- Auto mode: run full workflow ---
    if (step === 'auto') {
      if (!paymentAmount || !tranDate) {
        return NextResponse.json({ error: 'paymentAmount and tranDate are required for auto mode' }, { status: 400 })
      }

      const { results, finalState } = await processMarketplaceOrder(
        orderName, paymentAmount, currency, tranDate
      )

      // Update PayoutTransaction with payment ID if successful
      const paymentStep = results.find(r => r.step === 'create-payment' && r.success)
      if (paymentStep?.data?.paymentId && transactionId) {
        await prisma.payoutTransaction.update({
          where: { id: transactionId },
          data: {
            netsuiteTransactionId: paymentStep.data.paymentId,
            netsuiteTransactionName: paymentStep.data.paymentName || null,
            netsuiteTransactionType: 'payment',
            netsuiteAmount: paymentAmount,
            amountMismatch: false,
          },
        })
      }

      return NextResponse.json({ success: true, results, finalState })
    }

    // --- Individual steps ---
    switch (step) {
      case 'check': {
        const state = await checkOrderState(orderName)
        return NextResponse.json({ success: true, state })
      }

      case 'delete-cash-sale': {
        if (!cashSaleId) {
          return NextResponse.json({ error: 'cashSaleId is required' }, { status: 400 })
        }
        const result = await deleteCashSale(cashSaleId)
        return NextResponse.json({ success: result.success, result })
      }

      case 'update-sales-order': {
        if (!salesOrderId) {
          return NextResponse.json({ error: 'salesOrderId is required' }, { status: 400 })
        }
        // Look up tax amount from sibling "Tax Adjustment" payout transactions for same order
        const taxAmount = await lookupTaxAdjustment(orderName, transactionId)
        console.log(`🏪 Tax adjustment for ${orderName}: $${taxAmount}`)
        const result = await updateSOForMarketplace(salesOrderId, taxAmount)
        return NextResponse.json({ success: result.success, result })
      }

      case 'create-invoice': {
        if (!salesOrderId || !tranDate) {
          return NextResponse.json({ error: 'salesOrderId and tranDate are required' }, { status: 400 })
        }
        const result = await createInvoiceFromSO(salesOrderId, tranDate)
        return NextResponse.json({ success: result.success, result })
      }

      case 'create-payment': {
        if (!invoiceId || !customerId || !paymentAmount || !tranDate) {
          return NextResponse.json(
            { error: 'invoiceId, customerId, paymentAmount, and tranDate are required' },
            { status: 400 }
          )
        }
        const result = await createPaymentForInvoice(invoiceId, customerId, paymentAmount, currency, tranDate)

        // Update PayoutTransaction if payment was created successfully
        if (result.success && result.data?.paymentId && transactionId) {
          console.log(`🏪 Updating PayoutTransaction ${transactionId} with paymentId=${result.data.paymentId}, paymentName=${result.data.paymentName}`)
          const updated = await prisma.payoutTransaction.update({
            where: { id: transactionId },
            data: {
              netsuiteTransactionId: result.data.paymentId,
              netsuiteTransactionName: result.data.paymentName || null,
              netsuiteTransactionType: 'payment',
              netsuiteAmount: paymentAmount,
              amountMismatch: false,
            },
          })
          console.log(`🏪 PayoutTransaction updated:`, JSON.stringify({ id: updated.id, netsuiteTransactionId: updated.netsuiteTransactionId, netsuiteTransactionName: updated.netsuiteTransactionName }))
        } else {
          console.log(`🏪 Skipping DB update: success=${result.success}, paymentId=${result.data?.paymentId}, transactionId=${transactionId}`)
        }

        return NextResponse.json({ success: result.success, result })
      }

      default:
        return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 })
    }
  } catch (error) {
    console.error('❌ Error processing marketplace order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
