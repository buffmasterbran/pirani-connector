import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = BigInt(params.id)
    
    console.log(`🗑️ Deleting payout ${params.id} and its transactions from database...`)
    
    // Delete all transactions for this payout first (due to foreign key constraints)
    const deletedTransactions = await prisma.transaction.deleteMany({
      where: { payoutId: payoutId }
    })
    console.log(`✅ Deleted ${deletedTransactions.count} transactions for payout ${params.id}`)
    
    // Delete the payout
    const deletedPayout = await prisma.payout.delete({
      where: { id: payoutId }
    })
    console.log(`✅ Deleted payout ${params.id} from database`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully deleted payout ${params.id} and ${deletedTransactions.count} transactions`,
      deletedPayout: params.id,
      deletedTransactions: deletedTransactions.count
    })
    
  } catch (error) {
    console.error('❌ Error deleting payout:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete payout from database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
