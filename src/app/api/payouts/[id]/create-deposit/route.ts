import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader } from '@/lib/netsuite'

export const maxDuration = 300

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/deposit`

interface DepositItem { deposit: boolean; id: number }
interface OtherItem { description: string; amount: number; account: { id: string } }

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

    console.log(`💰 Creating deposit for payout ${payoutId}: ${depositItems.length} items, all in one POST`)

    const createBody: any = {
      account: { id: '217' },
      trandate: payoutDate.toISOString(),
      memo,
      payment: { items: depositItems },
    }
    if (otherItems.length > 0) {
      createBody.other = { items: otherItems }
    }

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
      return NextResponse.json(
        { success: false, error: `NetSuite API error ${res.status}: ${text || res.statusText}` },
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

    console.log(`✅ Deposit created: ${depositId} with ${depositItems.length} items`)

    return NextResponse.json({
      success: true,
      depositId,
      totalItems: depositItems.length,
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
