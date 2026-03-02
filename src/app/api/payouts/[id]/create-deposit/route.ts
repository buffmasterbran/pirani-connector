import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader } from '@/lib/netsuite'


const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/deposit`
const SUITEQL_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

interface DepositItem { deposit: boolean; id: number }
interface OtherItem { description: string; amount: number; account: { id: string } }
interface TxnStatus { id: string; tranid: string; type: string; statusname: string }

/**
 * Query NetSuite via SuiteQL to check which transaction IDs are actually
 * undeposited. Returns the set of IDs that are safe to include in a deposit.
 */
async function getUndepositedIds(ids: number[]): Promise<{
  valid: Set<number>
  skipped: Array<{ id: number; tranid: string; reason: string }>
}> {
  const valid = new Set<number>()
  const skipped: Array<{ id: number; tranid: string; reason: string }> = []

  if (ids.length === 0) return { valid, skipped }

  const idList = ids.join(',')
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
      // If SuiteQL fails, fall through and try the deposit anyway
      const errText = await res.text().catch(() => '')
      console.warn(`⚠️ SuiteQL validation failed (${res.status}), skipping pre-check: ${errText.slice(0, 200)}`)
      ids.forEach(id => valid.add(id))
      return { valid, skipped }
    }

    const data = await res.json() as { items?: TxnStatus[] }
    const found = new Map<number, TxnStatus>()
    for (const item of data.items || []) {
      found.set(Number(item.id), item)
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
  } catch (err) {
    // Network error — fall through and try the deposit anyway
    console.warn('⚠️ SuiteQL validation error, skipping pre-check:', err)
    ids.forEach(id => valid.add(id))
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

function buildDepositData(payout: any) {
  const transactionsWithNS = payout.transactions.filter(
    (txn: any) =>
      txn.netsuiteTransactionId &&
      txn.netsuiteTransactionId.trim() !== '' &&
      txn.includeInNetSuite !== false,
  )

  const cashSalesAndRefunds = transactionsWithNS.filter((txn: any) => {
    const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
    return name.startsWith('CS') || name.startsWith('RFND') ||
      name.includes('CASH SALE') || name.includes('CASH REFUND')
  })

  const payments = transactionsWithNS.filter((txn: any) => {
    const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
    return name.startsWith('PYMT') || name.startsWith('CUSTPYMT') ||
      name.includes('PAYMENT')
  })

  const allDepositTransactions = [...cashSalesAndRefunds, ...payments]
  const depositItems: DepositItem[] = allDepositTransactions
    .map((txn: any) => {
      const idNum = parseInt(txn.netsuiteTransactionId!, 10)
      if (isNaN(idNum)) return null
      return { deposit: true, id: idNum }
    })
    .filter((item): item is DepositItem => item !== null)
    .filter((item, idx, arr) => idx === arr.findIndex((t) => t.id === item.id))

  const includedTransactions = payout.transactions.filter((txn: any) => txn.includeInNetSuite !== false)
  const topLevelTransactions = payout.transactions.filter((txn: any) => !txn.parentTransactionId)
  const totalFees = topLevelTransactions.reduce((sum: number, txn: any) => sum + (txn.fee || 0), 0)

  return { depositItems, totalFees, includedTransactions, transactionsWithNS }
}

async function buildOtherItems(payout: any, totalFees: number, includedTransactions: any[]): Promise<OtherItem[]> {
  const payoutMappings = await prisma.payoutMapping.findMany({ where: { isActive: true } })
  const findMapping = (value: string | null | undefined) => {
    if (!value) return null
    return payoutMappings.find((m) => m.netsuiteId === value || m.description === value)
  }

  const dropdownItemsMap = new Map<string, { description: string; amount: number }>()
  for (const txn of includedTransactions) {
    if (txn.amountDescription) {
      const mapping = findMapping(txn.amountDescription)
      if (mapping?.netsuiteId) {
        const e = dropdownItemsMap.get(mapping.netsuiteId) || { description: mapping.description || '', amount: 0 }
        e.amount += Number(txn.amount) || 0
        dropdownItemsMap.set(mapping.netsuiteId, e)
      }
    }
    if (txn.feeDescription) {
      const mapping = findMapping(txn.feeDescription)
      if (mapping?.netsuiteId) {
        const e = dropdownItemsMap.get(mapping.netsuiteId) || { description: mapping.description || '', amount: 0 }
        e.amount += Number(txn.fee) || 0
        dropdownItemsMap.set(mapping.netsuiteId, e)
      }
    }
    if (txn.otherFeesDescription) {
      const mapping = findMapping(txn.otherFeesDescription)
      if (mapping?.netsuiteId) {
        const e = dropdownItemsMap.get(mapping.netsuiteId) || { description: mapping.description || '', amount: 0 }
        e.amount += Number(txn.amount) || Number(txn.fee) || 0
        dropdownItemsMap.set(mapping.netsuiteId, e)
      }
    }
  }

  const otherItems: OtherItem[] = []
  if (totalFees !== 0) {
    otherItems.push({
      description: 'Shopify Fees',
      amount: totalFees < 0 ? totalFees : -Math.abs(totalFees),
      account: { id: '989' },
    })
  }
  dropdownItemsMap.forEach((item, netsuiteId) => {
    if (item.amount !== 0) {
      otherItems.push({ description: item.description, amount: item.amount, account: { id: netsuiteId } })
    }
  })

  return otherItems
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { transactions: { orderBy: { processedAt: 'asc' } } },
    })

    if (!payout) {
      return NextResponse.json({ success: false, error: 'Payout not found' }, { status: 404 })
    }

    if (payout.netsuiteDepositId) {
      return NextResponse.json({
        success: true,
        depositId: payout.netsuiteDepositId,
        message: 'Deposit already created',
      })
    }

    const { depositItems, totalFees, includedTransactions, transactionsWithNS } = buildDepositData(payout)

    if (depositItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No valid NetSuite transaction IDs found. ${transactionsWithNS.length} transactions with NS IDs, ${payout.transactions.length} total.`,
      }, { status: 400 })
    }

    const otherItems = await buildOtherItems(payout, totalFees, includedTransactions)
    const payoutDate = payout.payoutDate || new Date()
    const memo = `Shopify payout ${payoutId.slice(-8)}`

    // Pre-validate: query NetSuite to filter out already-deposited transactions
    const allIds = depositItems.map(i => i.id)
    const { valid: validIds, skipped } = await getUndepositedIds(allIds)
    const validDepositItems = depositItems.filter(i => validIds.has(i.id))

    if (skipped.length > 0) {
      console.warn(`⚠️ Skipping ${skipped.length} transactions:`, skipped)
    }

    if (validDepositItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: `All ${depositItems.length} transactions were skipped — none are available for deposit in NetSuite.`,
        skipped,
      }, { status: 400 })
    }

    // Log transaction details for debugging
    console.log(`💰 Creating deposit for payout ${payoutId}:`)
    console.log(`   ${validDepositItems.length} payment items (${skipped.length} skipped), ${otherItems.length} other items`)
    console.log(`   Payment item IDs: ${validDepositItems.map(i => i.id).join(', ')}`)
    if (skipped.length > 0) {
      console.log(`   Skipped IDs: ${skipped.map(s => `${s.id} (${s.reason})`).join(', ')}`)
    }

    const createBody: any = {
      account: { id: '217' },
      trandate: payoutDate.toISOString().split('T')[0],
      memo,
      payment: { items: validDepositItems },
    }
    if (otherItems.length > 0) {
      createBody.other = { items: otherItems }
    }

    console.log(`   Full payload:`, JSON.stringify(createBody, null, 2))

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
      console.error('NetSuite POST error:', { status: res.status, body: text })
      console.error('NetSuite POST payload was:', JSON.stringify(createBody))
      return NextResponse.json(
        {
          success: false,
          error: `NetSuite API error ${res.status}: ${text || res.statusText}`,
          skipped,
          debug: {
            depositItemIds: validDepositItems.map(i => i.id),
            depositItemCount: validDepositItems.length,
            otherItemCount: otherItems.length,
            trandate: createBody.trandate,
            transactions: transactionsWithNS.map((t: any) => ({
              nsId: t.netsuiteTransactionId,
              nsName: t.netsuiteTransactionName,
            })),
          },
        },
        { status: 500 },
      )
    }

    const depositId = extractDepositId(res, text)

    if (!depositId) {
      return NextResponse.json(
        { success: false, error: 'NetSuite did not return a deposit ID' },
        { status: 500 },
      )
    }

    await prisma.payout.update({
      where: { id: payoutId },
      data: { netsuiteDepositId: depositId },
    })

    console.log(`✅ Deposit created: ${depositId} with ${validDepositItems.length} items` +
      (skipped.length > 0 ? ` (${skipped.length} skipped)` : ''))

    return NextResponse.json({
      success: true,
      depositId,
      totalItems: validDepositItems.length,
      skipped: skipped.length > 0 ? skipped : undefined,
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
