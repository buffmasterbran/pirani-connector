import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader } from '@/lib/netsuite'

export const maxDuration = 60

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/deposit`

const CHUNK_SIZE = 500

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
  const totalFees = includedTransactions.reduce((sum: number, txn: any) => sum + (txn.fee || 0), 0)

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
    const body = await request.json().catch(() => ({}))
    const action: string = body.action || 'prepare'

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { transactions: { orderBy: { processedAt: 'asc' } } },
    })

    if (!payout) {
      return NextResponse.json({ success: false, error: 'Payout not found' }, { status: 404 })
    }

    // --- PREPARE: return chunk plan ---
    if (action === 'prepare') {
      if (payout.netsuiteDepositId) {
        return NextResponse.json({
          success: true,
          action: 'prepare',
          alreadyCreated: true,
          depositId: payout.netsuiteDepositId,
        })
      }

      const { depositItems, totalFees, includedTransactions, transactionsWithNS } = buildDepositData(payout)

      if (depositItems.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No valid NetSuite transaction IDs found. ${transactionsWithNS.length} transactions with NS IDs, ${payout.transactions.length} total.`,
        }, { status: 400 })
      }

      const chunks: DepositItem[][] = []
      for (let i = 0; i < depositItems.length; i += CHUNK_SIZE) {
        chunks.push(depositItems.slice(i, i + CHUNK_SIZE))
      }

      const otherItems = await buildOtherItems(payout, totalFees, includedTransactions)

      return NextResponse.json({
        success: true,
        action: 'prepare',
        totalItems: depositItems.length,
        totalChunks: chunks.length,
        chunkSize: CHUNK_SIZE,
        otherItemsCount: otherItems.length,
      })
    }

    // --- CREATE: create deposit with first chunk ---
    if (action === 'create') {
      if (payout.netsuiteDepositId) {
        return NextResponse.json({
          success: true,
          action: 'create',
          depositId: payout.netsuiteDepositId,
          message: 'Deposit already created',
        })
      }

      const { depositItems, totalFees, includedTransactions, transactionsWithNS } = buildDepositData(payout)

      if (depositItems.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No valid NetSuite transaction IDs found. ${transactionsWithNS.length} transactions with NS IDs.`,
        }, { status: 400 })
      }

      const chunks: DepositItem[][] = []
      for (let i = 0; i < depositItems.length; i += CHUNK_SIZE) {
        chunks.push(depositItems.slice(i, i + CHUNK_SIZE))
      }

      const otherItems = await buildOtherItems(payout, totalFees, includedTransactions)
      const payoutDate = payout.payoutDate || new Date()
      const memo = `Shopify payout ${payoutId.slice(-8)}`

      console.log(`💰 Creating deposit for payout ${payoutId}: ${depositItems.length} items in ${chunks.length} chunks`)

      const createBody: any = {
        account: { id: '217' },
        trandate: payoutDate.toISOString(),
        memo,
        payment: { items: chunks[0] },
      }
      if (otherItems.length > 0) {
        createBody.other = { items: otherItems }
      }

      console.log(`📤 Creating deposit with chunk 1/${chunks.length} (${chunks[0].length} items)...`)
      const createResult = await netsuiteRequest('POST', NETSUITE_API_URL, createBody)

      if (!createResult.ok) {
        return NextResponse.json(
          { success: false, error: `NetSuite API error: ${createResult.error}` },
          { status: 500 },
        )
      }

      const depositId = createResult.depositId

      if (!depositId) {
        return NextResponse.json(
          { success: false, error: 'NetSuite did not return a deposit ID' },
          { status: 500 },
        )
      }

      console.log(`✅ Deposit created: ${depositId} with ${chunks[0].length} items`)

      if (chunks.length === 1) {
        await prisma.payout.update({
          where: { id: payoutId },
          data: { netsuiteDepositId: depositId },
        })
      }

      return NextResponse.json({
        success: true,
        action: 'create',
        depositId,
        itemsAdded: chunks[0].length,
        totalItems: depositItems.length,
        totalChunks: chunks.length,
        complete: chunks.length === 1,
      })
    }

    // --- PATCH: add a chunk to an existing deposit ---
    if (action === 'patch') {
      const depositId: string = body.depositId
      const chunkIndex: number = body.chunkIndex

      if (!depositId || chunkIndex == null) {
        return NextResponse.json(
          { success: false, error: 'depositId and chunkIndex are required for patch action' },
          { status: 400 },
        )
      }

      const { depositItems } = buildDepositData(payout)

      const chunks: DepositItem[][] = []
      for (let i = 0; i < depositItems.length; i += CHUNK_SIZE) {
        chunks.push(depositItems.slice(i, i + CHUNK_SIZE))
      }

      if (chunkIndex < 1 || chunkIndex >= chunks.length) {
        return NextResponse.json(
          { success: false, error: `Invalid chunkIndex ${chunkIndex}. Valid range: 1 to ${chunks.length - 1}` },
          { status: 400 },
        )
      }

      // NetSuite deposit PATCH requires all items up to this point
      const accumulated: DepositItem[] = []
      for (let i = 0; i <= chunkIndex; i++) {
        accumulated.push(...chunks[i])
      }

      const depositUrl = `${NETSUITE_API_URL}/${depositId}`
      console.log(`📤 Patching deposit ${depositId}: chunk ${chunkIndex + 1}/${chunks.length} (${accumulated.length} accumulated items)`)

      const patchResult = await netsuiteRequest('PATCH', depositUrl, {
        payment: { items: accumulated },
      })

      if (!patchResult.ok) {
        return NextResponse.json({
          success: false,
          error: `Chunk ${chunkIndex + 1} failed: ${patchResult.error}`,
          depositId,
          chunkIndex,
        }, { status: 500 })
      }

      const isLast = chunkIndex === chunks.length - 1
      if (isLast) {
        await prisma.payout.update({
          where: { id: payoutId },
          data: { netsuiteDepositId: depositId },
        })
      }

      console.log(`✅ Chunk ${chunkIndex + 1}/${chunks.length} applied (${accumulated.length} items)${isLast ? ' — COMPLETE' : ''}`)

      return NextResponse.json({
        success: true,
        action: 'patch',
        depositId,
        chunkIndex,
        itemsAccumulated: accumulated.length,
        totalItems: depositItems.length,
        totalChunks: chunks.length,
        complete: isLast,
      })
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('❌ Error in create-deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process deposit request',
      },
      { status: 500 },
    )
  }
}
