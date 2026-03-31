import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { parseTikTokExcel } from '@/lib/tiktok/parse-excel'

/**
 * POST /api/tiktok/payouts/upload
 * Upload a TikTok income Excel file, parse it, and store payouts + transactions.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { statements, orderDetails } = parseTikTokExcel(buffer)

    if (statements.length === 0) {
      return NextResponse.json({ error: 'No statements found in file' }, { status: 400 })
    }

    const uploadBatchId = `tiktok-${Date.now()}`

    // Group order details by statement ID for efficient lookup
    const ordersByStatement = new Map<string, typeof orderDetails>()
    for (const order of orderDetails) {
      const existing = ordersByStatement.get(order.statementId) || []
      existing.push(order)
      ordersByStatement.set(order.statementId, existing)
    }

    let payoutsCreated = 0
    let payoutsSkipped = 0
    let transactionsCreated = 0

    for (const stmt of statements) {
      // Parse date: "2026/03/29" → Date
      const payoutDate = stmt.statementDate
        ? new Date(stmt.statementDate.replace(/\//g, '-'))
        : null

      // Upsert the payout (skip if already exists with a deposit)
      const existing = await prisma.tikTokPayout.findUnique({
        where: { id: stmt.statementId },
        select: { netsuiteDepositId: true },
      })

      if (existing?.netsuiteDepositId) {
        payoutsSkipped++
        continue
      }

      await prisma.tikTokPayout.upsert({
        where: { id: stmt.statementId },
        create: {
          id: stmt.statementId,
          paymentId: stmt.paymentId,
          status: stmt.status,
          currency: 'USD',
          totalAmount: stmt.totalAmount,
          netSales: stmt.netSales,
          shipping: stmt.shipping,
          fees: stmt.fees,
          adjustments: stmt.adjustments,
          reserveAmount: stmt.reserveAmount,
          payableAmount: stmt.payableAmount,
          payoutDate,
          uploadBatchId,
        },
        update: {
          paymentId: stmt.paymentId,
          status: stmt.status,
          totalAmount: stmt.totalAmount,
          netSales: stmt.netSales,
          shipping: stmt.shipping,
          fees: stmt.fees,
          adjustments: stmt.adjustments,
          reserveAmount: stmt.reserveAmount,
          payableAmount: stmt.payableAmount,
          payoutDate,
          uploadBatchId,
        },
      })
      payoutsCreated++

      // Delete old transactions for this statement (re-import)
      await prisma.tikTokPayoutTransaction.deleteMany({
        where: { tiktokPayoutId: stmt.statementId },
      })

      // Insert order details as transactions
      const orders = ordersByStatement.get(stmt.statementId) || []
      for (const order of orders) {
        const orderCreatedDate = order.orderCreatedDate
          ? new Date(order.orderCreatedDate.replace(/\//g, '-'))
          : null
        const orderShipmentDate = order.orderShipmentDate
          ? new Date(order.orderShipmentDate.replace(/\//g, '-'))
          : null
        const orderDeliveryDate = order.orderDeliveryDate
          ? new Date(order.orderDeliveryDate.replace(/\//g, '-'))
          : null

        await prisma.tikTokPayoutTransaction.create({
          data: {
            tiktokPayoutId: stmt.statementId,
            tiktokOrderId: order.tiktokOrderId,
            type: order.type,
            skuId: order.skuId,
            quantity: order.quantity,
            productName: order.productName,
            skuName: order.skuName,
            totalSettlementAmount: order.totalSettlementAmount,
            grossSales: order.grossSales,
            grossSalesRefund: order.grossSalesRefund,
            sellerDiscount: order.sellerDiscount,
            shippingAmount: order.shippingAmount,
            fees: order.fees,
            transactionFee: order.transactionFee,
            referralFee: order.referralFee,
            affiliateCommission: order.affiliateCommission,
            adjustmentAmount: order.adjustmentAmount,
            adjustmentReason: order.adjustmentReason,
            customerPayment: order.customerPayment,
            customerRefund: order.customerRefund,
            orderCreatedDate,
            orderShipmentDate,
            orderDeliveryDate,
            matchStatus: 'unmatched',
          },
        })
        transactionsCreated++
      }
    }

    return NextResponse.json({
      success: true,
      uploadBatchId,
      payoutsCreated,
      payoutsSkipped,
      transactionsCreated,
      totalStatements: statements.length,
      totalOrderDetails: orderDetails.length,
    })
  } catch (error) {
    return handleApiError(error, 'POST /api/tiktok/payouts/upload')
  }
}
