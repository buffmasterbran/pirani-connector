import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { getUndepositedIds, DepositItem } from '@/lib/deposit-helpers'
import { generateOAuthHeader, buildRecordUrl } from '@/lib/netsuite'

/**
 * POST /api/tiktok/payouts/[id]/create-deposit
 * Create a NetSuite deposit for this TikTok payout.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const createdBy = body.createdBy || 'TikTok Reconciliation'

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

    // Get matched transactions
    const matchedTxns = payout.transactions.filter(
      t => t.netsuiteTransactionId &&
        t.netsuiteTransactionId.trim() !== '' &&
        t.includeInNetSuite !== false
    )

    if (matchedTxns.length === 0) {
      return NextResponse.json({
        error: 'No matched transactions. Run matching first.',
      }, { status: 400 })
    }

    // Build deposit items
    const depositItems: DepositItem[] = matchedTxns
      .map(t => {
        const id = parseInt(t.netsuiteTransactionId!, 10)
        if (isNaN(id)) return null
        return { deposit: true, id }
      })
      .filter((item): item is DepositItem => item !== null)
      .filter((item, idx, arr) => idx === arr.findIndex(t => t.id === item.id))

    // Validate
    const { valid, skipped } = await getUndepositedIds(depositItems.map(d => d.id))
    const validItems = depositItems.filter(d => valid.has(d.id))

    if (validItems.length === 0) {
      return NextResponse.json({
        error: 'No valid undeposited transactions found in NetSuite',
        skipped,
      }, { status: 400 })
    }

    // Get fees account
    const feesMapping = await prisma.payoutMapping.findFirst({
      where: { mappingType: 'fees_account', isDefaultFeesAccount: true, isActive: true },
    })
    const feesAccountId = feesMapping?.netsuiteId || '989'

    // Build other items (TikTok fees)
    const otherItems: Array<{ description: string; amount: number; account: { id: string } }> = []
    const totalFees = payout.fees || 0
    if (totalFees !== 0) {
      otherItems.push({
        description: 'TikTok Fees',
        amount: totalFees < 0 ? totalFees : -Math.abs(totalFees),
        account: { id: feesAccountId },
      })
    }

    const payoutDate = payout.payoutDate
      ? payout.payoutDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]

    const depositBody: Record<string, any> = {
      account: { id: '217' },
      trandate: payoutDate,
      memo: `TikTok payout ${payout.paymentId || payout.id}`,
      payment: { items: validItems },
    }
    if (otherItems.length > 0) {
      depositBody.other = { items: otherItems }
    }

    // Create deposit in NetSuite
    const depositUrl = buildRecordUrl('deposit')
    const authorization = generateOAuthHeader('POST', depositUrl)

    const nsResponse = await fetch(depositUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(depositBody),
    })

    if (!nsResponse.ok) {
      const errText = await nsResponse.text().catch(() => '')
      return NextResponse.json({
        error: `NetSuite deposit creation failed (${nsResponse.status})`,
        details: errText.slice(0, 500),
      }, { status: 502 })
    }

    // Extract deposit ID from Location header
    const locationHeader = nsResponse.headers.get('Location') || ''
    const depositId = locationHeader.split('/').pop() || null

    // Update payout record
    await prisma.tikTokPayout.update({
      where: { id: params.id },
      data: {
        netsuiteDepositId: depositId,
        pushedToNsBy: createdBy,
        pushedToNsAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      depositId,
      depositItemCount: validItems.length,
      skipped,
      totalFees,
    })
  } catch (error) {
    return handleApiError(error, `POST /api/tiktok/payouts/${params.id}/create-deposit`)
  }
}
