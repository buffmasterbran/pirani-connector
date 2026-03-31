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

    // Group order details by statement ID
    const ordersByStatement = new Map<string, typeof orderDetails>()
    for (const order of orderDetails) {
      const existing = ordersByStatement.get(order.statementId) || []
      existing.push(order)
      ordersByStatement.set(order.statementId, existing)
    }

    // Pre-fetch all existing payouts in one query
    const existingPayouts = await prisma.tikTokPayout.findMany({
      where: { id: { in: statements.map(s => s.statementId) } },
      select: {
        id: true,
        netsuiteDepositId: true,
        transactions: { where: { matchStatus: 'matched' }, select: { id: true }, take: 1 },
      },
    })
    const existingMap = new Map(existingPayouts.map(p => [p.id, p]))

    // Classify statements
    const toSkip: string[] = []
    const toUpdateOnly: string[] = []   // has matched transactions — don't touch order lines
    const toFullImport: string[] = []   // new or unmatched — import order lines

    for (const stmt of statements) {
      const ex = existingMap.get(stmt.statementId)
      if (ex?.netsuiteDepositId) {
        toSkip.push(stmt.statementId)
      } else if (ex && ex.transactions.length > 0) {
        toUpdateOnly.push(stmt.statementId)
      } else {
        toFullImport.push(stmt.statementId)
      }
    }

    // Run all DB writes in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Upsert all non-skipped payouts
      const upsertIds = [...toUpdateOnly, ...toFullImport]
      for (const stmt of statements.filter(s => upsertIds.includes(s.statementId))) {
        const payoutDate = stmt.statementDate
          ? new Date(stmt.statementDate.replace(/\//g, '-'))
          : null

        await tx.tikTokPayout.upsert({
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
      }

      // Delete old transactions for full-import payouts
      if (toFullImport.length > 0) {
        await tx.tikTokPayoutTransaction.deleteMany({
          where: { tiktokPayoutId: { in: toFullImport } },
        })
      }

      // Bulk-create all transactions for full-import payouts
      const txnData: any[] = []
      for (const stmtId of toFullImport) {
        const orders = ordersByStatement.get(stmtId) || []
        for (const order of orders) {
          txnData.push({
            tiktokPayoutId: stmtId,
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
            orderCreatedDate: order.orderCreatedDate
              ? new Date(order.orderCreatedDate.replace(/\//g, '-'))
              : null,
            orderShipmentDate: order.orderShipmentDate
              ? new Date(order.orderShipmentDate.replace(/\//g, '-'))
              : null,
            orderDeliveryDate: order.orderDeliveryDate
              ? new Date(order.orderDeliveryDate.replace(/\//g, '-'))
              : null,
            matchStatus: 'unmatched',
          })
        }
      }

      if (txnData.length > 0) {
        await tx.tikTokPayoutTransaction.createMany({ data: txnData })
      }

      return { transactionsCreated: txnData.length }
    })

    return NextResponse.json({
      success: true,
      uploadBatchId,
      payoutsCreated: toFullImport.length,
      payoutsUpdated: toUpdateOnly.length,
      payoutsSkipped: toSkip.length,
      transactionsCreated: result.transactionsCreated,
      totalStatements: statements.length,
      totalOrderDetails: orderDetails.length,
    })
  } catch (error) {
    return handleApiError(error, 'POST /api/tiktok/payouts/upload')
  }
}
