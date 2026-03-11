import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

type RouteContext = { params: Promise<{ transactionId: string }> | { transactionId: string } }

async function resolveParams(params: RouteContext['params']) {
  return params instanceof Promise ? await params : params
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { transactionId } = await resolveParams(params)

    const children = await prisma.payoutTransaction.findMany({
      where: { parentTransactionId: transactionId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ children })
  } catch (error) {
    console.error('Error fetching split children:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch split children' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { transactionId } = await resolveParams(params)
    const body = await request.json()
    const { netsuiteTransactionId, netsuiteTransactionName, netsuiteAmount, amountDescription, amount } = body

    const isNsTransaction = !!netsuiteTransactionId
    const isAccountLine = !netsuiteTransactionId && !!amountDescription

    if (!isNsTransaction && !isAccountLine) {
      return NextResponse.json(
        { error: 'Either netsuiteTransactionId or amountDescription is required' },
        { status: 400 },
      )
    }

    const childAmount = isNsTransaction
      ? (netsuiteAmount != null ? Number(netsuiteAmount) : null)
      : Number(amount)

    if (childAmount == null || isNaN(childAmount) || childAmount === 0) {
      return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 })
    }

    const parent = await prisma.payoutTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!parent) {
      return NextResponse.json({ error: 'Parent transaction not found' }, { status: 404 })
    }

    if (parent.parentTransactionId) {
      return NextResponse.json(
        { error: 'Cannot split a child transaction. Split the parent instead.' },
        { status: 400 },
      )
    }

    const childId = `${transactionId}-split-${crypto.randomBytes(4).toString('hex')}`

    const child = await prisma.payoutTransaction.create({
      data: {
        id: childId,
        payoutId: parent.payoutId,
        shopifyOrderId: parent.shopifyOrderId,
        parentTransactionId: transactionId,
        type: parent.type,
        currency: parent.currency,
        processedAt: parent.processedAt,
        amount: childAmount,
        net: childAmount,
        fee: 0,
        netsuiteTransactionId: isNsTransaction ? String(netsuiteTransactionId) : null,
        netsuiteTransactionName: isNsTransaction ? (netsuiteTransactionName ?? null) : null,
        netsuiteAmount: isNsTransaction ? childAmount : null,
        amountDescription: isAccountLine ? String(amountDescription) : null,
        includeInNetSuite: true,
      },
    })

    await prisma.payoutTransaction.update({
      where: { id: transactionId },
      data: { includeInNetSuite: false },
    })

    return NextResponse.json({ success: true, child })
  } catch (error) {
    console.error('Error adding split child:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add split child' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { transactionId } = await resolveParams(params)
    const { searchParams } = new URL(request.url)
    const childId = searchParams.get('childId')

    if (!childId) {
      return NextResponse.json({ error: 'childId query parameter is required' }, { status: 400 })
    }

    const child = await prisma.payoutTransaction.findUnique({
      where: { id: childId },
    })

    if (!child || child.parentTransactionId !== transactionId) {
      return NextResponse.json({ error: 'Child not found for this parent' }, { status: 404 })
    }

    await prisma.payoutTransaction.delete({ where: { id: childId } })

    const remainingChildren = await prisma.payoutTransaction.count({
      where: { parentTransactionId: transactionId },
    })

    if (remainingChildren === 0) {
      await prisma.payoutTransaction.update({
        where: { id: transactionId },
        data: { includeInNetSuite: true },
      })
    }

    return NextResponse.json({ success: true, remainingChildren })
  } catch (error) {
    console.error('Error removing split child:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove split child' },
      { status: 500 },
    )
  }
}
