import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader, buildRecordUrl } from '@/lib/netsuite'
import {
  filterValidTransactions,
  buildDepositItems,
  buildDropdownItems,
  buildOtherItems,
  buildDepositPayload,
  getUndepositedIds,
  type DepositItem,
} from '@/lib/deposit-helpers'

const NETSUITE_API_URL = buildRecordUrl('deposit')
const BATCH_SIZE = 1500

function extractDepositId(response: Response, responseText: string): string | null {
  if (responseText?.trim()) {
    try {
      const data = JSON.parse(responseText)
      if (data?.id) return String(data.id)
      if (data?.links) {
        for (const link of data.links) {
          const m = link.href?.match(/deposit\/(\d+)/) || link.href?.match(/id=(\d+)/)
          if (m) return m[1]
        }
      }
    } catch { /* ignore parse errors */ }
  }

  const location = response.headers.get('Location')
  if (location) {
    const m = location.match(/\/deposit\/(\d+)/) || location.match(/deposit\.nl\?id=(\d+)/)
    if (m) return m[1]
  }

  return null
}

/**
 * Shared logic to compute batches and other deposit data for a payout.
 */
/**
 * Shared logic to compute batches and other deposit data for a payout.
 *
 * `validate`: when true (plan action), runs SuiteQL to check for stale/deposited IDs.
 * When false (create action), skips validation — the preview already checked.
 * This prevents the batch count from shrinking as earlier batches get deposited.
 */
async function prepareBatches(payout: any, validate: boolean) {
  const transactionsWithNS = filterValidTransactions(payout.transactions)
  const depositItems = buildDepositItems(transactionsWithNS)

  if (depositItems.length === 0) {
    return { error: `No valid NetSuite transaction IDs found. ${transactionsWithNS.length} transactions with NS IDs, ${payout.transactions.length} total.` }
  }

  const includedTransactions = payout.transactions.filter((txn: any) => txn.includeInNetSuite !== false)
  const topLevelTransactions = payout.transactions.filter((txn: any) => !txn.parentTransactionId)
  const totalFees = topLevelTransactions.reduce((sum: number, txn: any) => sum + (txn.fee || 0), 0)

  const payoutMappings = await prisma.payoutMapping.findMany({ where: { isActive: true } })
  const dropdownItems = buildDropdownItems(includedTransactions, payoutMappings)
  const otherItems = buildOtherItems(totalFees, dropdownItems, '989')

  let finalItems = depositItems
  let skipped: Array<{ id: number; tranid: string; reason: string }> = []

  if (validate) {
    const allIds = depositItems.map(i => i.id)
    const { valid: validIds, skipped: skippedIds } = await getUndepositedIds(allIds)
    skipped = skippedIds
    finalItems = depositItems.filter(i => validIds.has(i.id))

    // Block if any NS IDs don't exist
    const notFound = skipped.filter(s => s.reason === 'Not found in NetSuite')
    if (notFound.length > 0) {
      const notFoundDetails = notFound.map(s => {
        const dbTxn = payout.transactions.find(
          (t: any) => t.netsuiteTransactionId && parseInt(t.netsuiteTransactionId, 10) === s.id
        )
        return {
          nsId: s.id,
          tranid: s.tranid,
          nsName: dbTxn?.netsuiteTransactionName || null,
          nsType: dbTxn?.netsuiteTransactionType || null,
          shopifyOrderId: dbTxn?.shopifyOrderId || null,
          shopifyType: dbTxn?.type || null,
          amount: dbTxn?.amount ?? null,
        }
      })
      return {
        error: `${notFound.length} transaction(s) reference NetSuite IDs that no longer exist. Fix these before pushing.`,
        notFound: notFoundDetails,
        skipped,
      }
    }

    if (finalItems.length === 0) {
      return {
        error: `All ${depositItems.length} transactions were skipped — none are available for deposit in NetSuite.`,
        skipped,
      }
    }
  }

  // Split into batches
  const batches: DepositItem[][] = []
  for (let i = 0; i < finalItems.length; i += BATCH_SIZE) {
    batches.push(finalItems.slice(i, i + BATCH_SIZE))
  }

  return { batches, otherItems, skipped, totalItems: finalItems.length }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id
    const body = await request.json().catch(() => ({}))
    const pushedBy = body.pushedBy || null
    const action = body.action || 'create' // 'plan' or 'create'
    const batchIndex = typeof body.batchIndex === 'number' ? body.batchIndex : null

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { transactions: { orderBy: { processedAt: 'asc' } } },
    })

    if (!payout) {
      return NextResponse.json({ success: false, error: 'Payout not found' }, { status: 404 })
    }

    // If deposits already fully created, return early
    if (payout.netsuiteDepositId && action === 'plan') {
      return NextResponse.json({
        success: true,
        depositId: payout.netsuiteDepositId,
        message: 'Deposit already created',
      })
    }

    const payoutDate = payout.payoutDate || new Date()
    const dateStr = payoutDate.toISOString().split('T')[0]

    const result = await prepareBatches(payout, action === 'plan')
    if ('error' in result) {
      return NextResponse.json({ success: false, ...result }, { status: 400 })
    }

    const { batches, otherItems, skipped, totalItems } = result
    const totalBatches = batches.length

    // ACTION: plan — return batch info so client knows what to expect
    if (action === 'plan') {
      // Count how many batches are already done (from partial deposit IDs on payout)
      const existingIds = payout.netsuiteDepositId ? payout.netsuiteDepositId.split(',').filter(Boolean) : []
      return NextResponse.json({
        success: true,
        totalBatches,
        totalItems,
        completedBatches: existingIds.length,
        existingDepositIds: existingIds,
        skipped: skipped.length > 0 ? skipped : undefined,
      })
    }

    // ACTION: create — create a single batch
    if (batchIndex === null || batchIndex < 0 || batchIndex >= totalBatches) {
      return NextResponse.json({
        success: false,
        error: `Invalid batchIndex: ${batchIndex}. Must be 0-${totalBatches - 1}.`,
      }, { status: 400 })
    }

    const batch = batches[batchIndex]
    const batchNum = batchIndex + 1
    const memo = totalBatches === 1
      ? `Shopify payout ${payoutId}`
      : `Shopify payout ${payoutId} (${batchNum}/${totalBatches})`

    // Only the first batch gets the other items (fees/dropdowns)
    const batchOtherItems = batchIndex === 0 ? otherItems : []

    const createBody = buildDepositPayload(payoutId, dateStr, batch, batchOtherItems)
    createBody.memo = memo

    console.log(`💰 Batch ${batchNum}/${totalBatches}: ${batch.length} payment items, ${batchOtherItems.length} other items`)

    const authorization = generateOAuthHeader('POST', NETSUITE_API_URL)
    const res = await fetch(NETSUITE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(createBody),
    })

    const text = await res.text().catch(() => '')

    if (!res.ok) {
      console.error(`NetSuite POST error (batch ${batchNum}):`, { status: res.status, body: text })
      return NextResponse.json(
        {
          success: false,
          error: `NetSuite API error on batch ${batchNum}/${totalBatches} (${res.status}): ${text || res.statusText}`,
        },
        { status: 500 },
      )
    }

    const depositId = extractDepositId(res, text)
    if (!depositId) {
      return NextResponse.json(
        { success: false, error: `NetSuite did not return a deposit ID for batch ${batchNum}/${totalBatches}` },
        { status: 500 },
      )
    }

    // Append this deposit ID to the payout record immediately
    const existingIds = payout.netsuiteDepositId ? payout.netsuiteDepositId.split(',').filter(Boolean) : []
    existingIds.push(depositId)
    const allDepositIds = existingIds.join(',')

    const isComplete = batchNum === totalBatches
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        netsuiteDepositId: allDepositIds,
        ...(isComplete ? { pushedToNsBy: pushedBy, pushedToNsAt: new Date() } : {}),
      },
    })

    console.log(`   ✅ Batch ${batchNum}/${totalBatches}: deposit ${depositId} created with ${batch.length} items`)

    return NextResponse.json({
      success: true,
      depositId,
      batchIndex,
      batchNum,
      totalBatches,
      totalItems,
      batchItems: batch.length,
      isComplete,
      allDepositIds,
    })
  } catch (error) {
    console.error('❌ Error creating deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create deposit',
      },
      { status: 500 },
    )
  }
}
