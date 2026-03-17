import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader, buildRecordUrl, buildSuiteQLUrl } from '@/lib/netsuite'
import {
  filterValidTransactions,
  buildDepositItems,
  buildDropdownItems,
  buildOtherItems,
  buildDepositPayload,
  type DepositItem,
} from '@/lib/deposit-helpers'

const NETSUITE_API_URL = buildRecordUrl('deposit')
const SUITEQL_URL = buildSuiteQLUrl()
const BATCH_SIZE = 1500

interface TxnStatus { id: string; tranid: string; type: string; statusname: string }

async function getUndepositedIds(ids: number[]): Promise<{
  valid: Set<number>
  skipped: Array<{ id: number; tranid: string; reason: string }>
}> {
  const valid = new Set<number>()
  const skipped: Array<{ id: number; tranid: string; reason: string }> = []

  if (ids.length === 0) return { valid, skipped }

  const CHUNK_SIZE = 1000
  const found = new Map<number, TxnStatus>()

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const idList = chunk.join(',')
    const query = `SELECT Transaction.id, Transaction.tranid, Transaction.type, BUILTIN.DF(Transaction.status) AS statusname FROM Transaction WHERE Transaction.id IN (${idList})`

    const authorization = generateOAuthHeader('POST', SUITEQL_URL)
    try {
      const res = await fetch(SUITEQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'transient',
          Authorization: authorization,
          Accept: 'application/json',
        },
        body: JSON.stringify({ q: query }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.warn(`⚠️ SuiteQL validation failed for chunk (${res.status}), skipping pre-check: ${errText.slice(0, 200)}`)
        ids.forEach(id => valid.add(id))
        return { valid, skipped: [] }
      }

      const data = await res.json() as { items?: TxnStatus[] }
      for (const item of data.items || []) {
        found.set(Number(item.id), item)
      }
    } catch (err) {
      console.warn('⚠️ SuiteQL validation error, skipping pre-check:', err)
      ids.forEach(id => valid.add(id))
      return { valid, skipped: [] }
    }
  }

  for (const id of ids) {
    const txn = found.get(id)
    if (!txn) {
      skipped.push({ id, tranid: '?', reason: 'Not found in NetSuite' })
    } else {
      const status = (txn.statusname || '').toLowerCase()
      if (status.includes('deposited') && !status.includes('not deposited')) {
        skipped.push({ id, tranid: txn.tranid, reason: `Already deposited (${txn.statusname})` })
      } else {
        valid.add(id)
      }
    }
  }

  return { valid, skipped }
}

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
async function prepareBatches(payout: any) {
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

  // Pre-validate
  const allIds = depositItems.map(i => i.id)
  const { valid: validIds, skipped } = await getUndepositedIds(allIds)
  const validDepositItems = depositItems.filter(i => validIds.has(i.id))

  // Block if any NS IDs don't exist
  const notFound = skipped.filter(s => s.reason === 'Not found in NetSuite')
  if (notFound.length > 0) {
    return {
      error: `${notFound.length} transaction(s) reference NetSuite IDs that no longer exist. Fix these before pushing.`,
      notFound: notFound.map(s => ({ nsId: s.id, tranid: s.tranid })),
      skipped,
    }
  }

  if (validDepositItems.length === 0) {
    return {
      error: `All ${depositItems.length} transactions were skipped — none are available for deposit in NetSuite.`,
      skipped,
    }
  }

  // Split into batches
  const batches: DepositItem[][] = []
  for (let i = 0; i < validDepositItems.length; i += BATCH_SIZE) {
    batches.push(validDepositItems.slice(i, i + BATCH_SIZE))
  }

  return { batches, otherItems, skipped, totalItems: validDepositItems.length }
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

    const result = await prepareBatches(payout)
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
