import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fromTransactionId, toTransactionId } = body

    if (!fromTransactionId || !toTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Both fromTransactionId and toTransactionId are required' },
        { status: 400 }
      )
    }

    if (fromTransactionId === toTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Cannot reassign to the same transaction' },
        { status: 400 }
      )
    }

    // Get both transactions
    const fromTransaction = await prisma.payoutTransaction.findUnique({
      where: { id: fromTransactionId },
    })

    const toTransaction = await prisma.payoutTransaction.findUnique({
      where: { id: toTransactionId },
    })

    if (!fromTransaction) {
      return NextResponse.json(
        { success: false, error: 'Source transaction not found' },
        { status: 404 }
      )
    }

    if (!toTransaction) {
      return NextResponse.json(
        { success: false, error: 'Target transaction not found' },
        { status: 404 }
      )
    }

    if (!fromTransaction.netsuiteTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Source transaction does not have a NetSuite ID' },
        { status: 400 }
      )
    }

    if (toTransaction.netsuiteTransactionId) {
      return NextResponse.json(
        { success: false, error: 'Target transaction already has a NetSuite ID' },
        { status: 400 }
      )
    }

    // Calculate amount mismatch for target transaction
    const shopifyAmount = toTransaction.amount || toTransaction.net || 0
    const netsuiteAmount = fromTransaction.netsuiteAmount || 0
    const amountMismatch = Math.abs(shopifyAmount - netsuiteAmount) > 0.01 // Allow 1 cent tolerance

    // Move NetSuite data from source to target
    await prisma.$transaction([
      // Clear NetSuite data from source transaction
      prisma.payoutTransaction.update({
        where: { id: fromTransactionId },
        data: {
          netsuiteTransactionId: null,
          netsuiteTransactionName: null,
          netsuiteAmount: null,
          amountMismatch: false,
        },
      }),
      // Assign NetSuite data to target transaction
      prisma.payoutTransaction.update({
        where: { id: toTransactionId },
        data: {
          netsuiteTransactionId: fromTransaction.netsuiteTransactionId,
          netsuiteTransactionName: fromTransaction.netsuiteTransactionName,
          netsuiteAmount: fromTransaction.netsuiteAmount,
          amountMismatch,
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      message: 'NetSuite transaction ID reassigned successfully',
      data: {
        fromTransactionId,
        toTransactionId,
        netsuiteTransactionId: fromTransaction.netsuiteTransactionId,
        amountMismatch,
      },
    })
  } catch (error) {
    console.error('Error reassigning NetSuite transaction ID:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

