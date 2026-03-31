import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import {
  buildDepositItems,
  buildOtherItems,
  buildDepositPayload,
  getUndepositedIds,
  DepositItem,
} from '@/lib/deposit-helpers'

/**
 * GET /api/tiktok/payouts/[id]/preview-deposit
 * Preview the NetSuite deposit that would be created for this TikTok payout.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payout = await prisma.tikTokPayout.findUnique({
      where: { id: params.id },
      include: { transactions: true },
    })

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    if (payout.netsuiteDepositId) {
      return NextResponse.json({
        error: `Already deposited: ${payout.netsuiteDepositId}`,
      }, { status: 400 })
    }

    // Get matched transactions with NS IDs
    const matchedTxns = payout.transactions.filter(
      t => t.netsuiteTransactionId &&
        t.netsuiteTransactionId.trim() !== '' &&
        t.includeInNetSuite !== false
    )

    if (matchedTxns.length === 0) {
      return NextResponse.json({
        error: 'No matched transactions with NetSuite IDs. Run matching first.',
      }, { status: 400 })
    }

    // Build deposit items (cash sales/refunds to include in deposit)
    // For TikTok, all matched transactions are cash sales
    const depositItems: DepositItem[] = matchedTxns
      .map(t => {
        const id = parseInt(t.netsuiteTransactionId!, 10)
        if (isNaN(id)) return null
        return { deposit: true, id }
      })
      .filter((item): item is DepositItem => item !== null)
      .filter((item, idx, arr) => idx === arr.findIndex(t => t.id === item.id))

    // Validate which NS IDs are actually undeposited
    const nsIds = depositItems.map(d => d.id)
    const { valid, skipped } = await getUndepositedIds(nsIds)
    const validItems = depositItems.filter(d => valid.has(d.id))

    // Get default fees account
    const feesMapping = await prisma.payoutMapping.findFirst({
      where: { mappingType: 'fees_account', isDefaultFeesAccount: true, isActive: true },
    })
    const feesAccountId = feesMapping?.netsuiteId || '989'

    // Build "other" items — TikTok fees
    const totalFees = payout.fees || 0
    const dropdownItems = new Map<string, { description: string; amount: number }>()
    const otherItems = buildOtherItems(totalFees, dropdownItems, feesAccountId)

    // Replace "Shopify Fees" label with "TikTok Fees"
    for (const item of otherItems) {
      if (item.description === 'Shopify Fees') {
        item.description = 'TikTok Fees'
      }
    }

    // Format payout date
    const payoutDate = payout.payoutDate
      ? payout.payoutDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    const payload = {
      account: { id: '217' }, // Undeposited Funds
      trandate: payoutDate,
      memo: `TikTok payout ${payout.paymentId || payout.id}`,
      payment: { items: validItems },
      ...(otherItems.length > 0 ? { other: { items: otherItems } } : {}),
    }

    // Summary stats
    const unmatchedOrders = payout.transactions.filter(
      t => t.type === 'Order' && t.matchStatus !== 'matched'
    )

    return NextResponse.json({
      success: true,
      preview: {
        payoutId: payout.id,
        paymentId: payout.paymentId,
        payoutDate,
        totalAmount: payout.totalAmount,
        payableAmount: payout.payableAmount,
        depositItemCount: validItems.length,
        skippedItems: skipped,
        otherItems,
        unmatchedOrders: unmatchedOrders.map(t => ({
          tiktokOrderId: t.tiktokOrderId,
          productName: t.productName,
          amount: t.totalSettlementAmount,
          matchError: t.matchError,
        })),
      },
      payload,
    })
  } catch (error) {
    return handleApiError(error, `GET /api/tiktok/payouts/${params.id}/preview-deposit`)
  }
}
