import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader } from '@/lib/netsuite'

export const maxDuration = 300

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/deposit`

const CHUNK_SIZE = 500

interface DepositItem { deposit: boolean; id: number }
interface OtherItem { description: string; amount: number; account: { id: string } }

function extractDepositId(response: Response, responseText: string): string | null {
  // Try response body
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

  // Try Location header
  const location = response.headers.get('Location')
  if (location) {
    const m = location.match(/\/deposit\/(\d+)/) || location.match(/deposit\.nl\?id=(\d+)/)
    if (m) return m[1]
  }

  return null
}

async function netsuiteRequest(
  method: 'POST' | 'PATCH',
  url: string,
  body: any,
): Promise<{ ok: boolean; status: number; depositId: string | null; error?: string }> {
  const authorization = generateOAuthHeader(method, url)
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text().catch(() => '')

  if (!res.ok) {
    console.error(`NetSuite ${method} error:`, { status: res.status, body: text })
    return { ok: false, status: res.status, depositId: null, error: `${res.status}: ${text || res.statusText}` }
  }

  const depositId = extractDepositId(res, text)
  return { ok: true, status: res.status, depositId }
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
        message: 'Deposit already created',
        depositId: payout.netsuiteDepositId,
      })
    }

    // Filter to transactions with NS IDs that are included
    const transactionsWithNS = payout.transactions.filter(
      (txn) =>
        txn.netsuiteTransactionId &&
        txn.netsuiteTransactionId.trim() !== '' &&
        txn.includeInNetSuite !== false,
    )

    const cashSalesAndRefunds = transactionsWithNS.filter((txn) => {
      const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
      return name.startsWith('CS') || name.startsWith('RFND') ||
        name.includes('CASH SALE') || name.includes('CASH REFUND')
    })

    const payments = transactionsWithNS.filter((txn) => {
      const name = (txn.netsuiteTransactionName || '').toUpperCase().trim()
      return name.startsWith('PYMT') || name.startsWith('CUSTPYMT') ||
        name.includes('PAYMENT')
    })

    if (transactionsWithNS.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No transactions with NetSuite IDs found. Found ${payout.transactions.length} total. Use "Get Missing NS Transactions" first.`,
        },
        { status: 400 },
      )
    }

    // Build deposit items (deduplicated)
    const allDepositTransactions = [...cashSalesAndRefunds, ...payments]
    const depositItems: DepositItem[] = allDepositTransactions
      .map((txn) => {
        const idNum = parseInt(txn.netsuiteTransactionId!, 10)
        if (isNaN(idNum)) return null
        return { deposit: true, id: idNum }
      })
      .filter((item): item is DepositItem => item !== null)
      .filter((item, idx, arr) => idx === arr.findIndex((t) => t.id === item.id))

    if (depositItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid NetSuite transaction IDs found' },
        { status: 400 },
      )
    }

    // Calculate fees from included transactions
    const includedTransactions = payout.transactions.filter((txn) => txn.includeInNetSuite !== false)
    const totalFees = includedTransactions.reduce((sum, txn) => sum + (txn.fee || 0), 0)

    // Get payout mappings for dropdown items
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

    const payoutDate = payout.payoutDate || new Date()
    const memo = `Shopify payout ${payoutId.slice(-8)}`

    console.log(`💰 Creating deposit for payout ${payoutId}: ${depositItems.length} payment items, ${otherItems.length} other items`)

    // --- Chunk logic ---
    // If items fit in one request, send them all at once.
    // Otherwise, create with the first chunk, then PATCH to add remaining chunks.
    const chunks: DepositItem[][] = []
    for (let i = 0; i < depositItems.length; i += CHUNK_SIZE) {
      chunks.push(depositItems.slice(i, i + CHUNK_SIZE))
    }

    // Step 1: Create deposit with first chunk
    const createBody: any = {
      account: { id: '217' },
      trandate: payoutDate.toISOString(),
      memo,
      payment: { items: chunks[0] },
    }
    if (otherItems.length > 0) {
      createBody.other = { items: otherItems }
    }

    console.log(`📤 Chunk 1/${chunks.length}: Creating deposit with ${chunks[0].length} items...`)
    const createResult = await netsuiteRequest('POST', NETSUITE_API_URL, createBody)

    if (!createResult.ok) {
      return NextResponse.json(
        { success: false, error: `NetSuite API error: ${createResult.error}` },
        { status: 500 },
      )
    }

    let depositId = createResult.depositId

    // For 202 async responses without an ID, we can't add more chunks
    if (!depositId && createResult.status === 202) {
      return NextResponse.json({
        success: true,
        message: `Deposit creation initiated (async) with ${chunks[0].length}/${depositItems.length} items. ${chunks.length > 1 ? `${chunks.length - 1} more chunk(s) pending — re-run after the deposit is created in NetSuite.` : ''}`,
        depositId: null,
        async: true,
        totalItems: depositItems.length,
        itemsInFirstChunk: chunks[0].length,
      })
    }

    if (!depositId) {
      return NextResponse.json(
        { success: false, error: 'NetSuite did not return a deposit ID' },
        { status: 500 },
      )
    }

    console.log(`✅ Deposit created: ${depositId}`)

    // Step 2: PATCH remaining chunks onto the deposit
    if (chunks.length > 1) {
      const depositUrl = `${NETSUITE_API_URL}/${depositId}`
      let accumulated = [...chunks[0]]

      for (let c = 1; c < chunks.length; c++) {
        accumulated = [...accumulated, ...chunks[c]]
        console.log(`📤 Chunk ${c + 1}/${chunks.length}: Updating deposit with ${accumulated.length} total items...`)

        const patchResult = await netsuiteRequest('PATCH', depositUrl, {
          payment: { items: accumulated },
        })

        if (!patchResult.ok) {
          // Save what we have so far
          await prisma.payout.update({
            where: { id: payoutId },
            data: { netsuiteDepositId: depositId },
          })
          return NextResponse.json({
            success: false,
            error: `Deposit ${depositId} created with ${accumulated.length - chunks[c].length} items, but chunk ${c + 1} failed: ${patchResult.error}. Deposit saved — you can update it manually in NetSuite.`,
            depositId,
            depositUrl: `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositId}`,
            itemsAdded: accumulated.length - chunks[c].length,
            totalItems: depositItems.length,
          }, { status: 500 })
        }
      }

      console.log(`✅ All ${chunks.length} chunks applied — ${depositItems.length} total items`)
    }

    // Save deposit ID
    await prisma.payout.update({
      where: { id: payoutId },
      data: { netsuiteDepositId: depositId },
    })

    return NextResponse.json({
      success: true,
      message: `Deposit created successfully${chunks.length > 1 ? ` in ${chunks.length} chunks` : ''}`,
      depositId,
      depositUrl: `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositId}`,
      totalItems: depositItems.length,
      chunks: chunks.length,
    })
  } catch (error) {
    console.error('❌ Error creating NetSuite deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create NetSuite deposit',
      },
      { status: 500 },
    )
  }
}
