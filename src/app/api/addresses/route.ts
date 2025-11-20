import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const addressTypeFilter = searchParams.get('addressType')
    const hasNetSuiteIdFilter = searchParams.get('hasNetSuiteId')

    const whereClause: any = {}

    // Map old addressType filter values to new boolean fields
    if (addressTypeFilter && addressTypeFilter !== 'all') {
      switch (addressTypeFilter) {
        case 'billing':
          whereClause.isDefaultBilling = true
          break
        case 'shipping':
          whereClause.isDefaultShipping = true
          break
        case 'saved':
          whereClause.isSavedAddress = true
          break
        case 'default':
          // Default means both billing and shipping
          whereClause.OR = [
            { isDefaultBilling: true },
            { isDefaultShipping: true },
          ]
          break
      }
    }

    if (hasNetSuiteIdFilter === 'true') {
      whereClause.netsuiteAddressId = { not: null }
    } else if (hasNetSuiteIdFilter === 'false') {
      whereClause.netsuiteAddressId = null
    }

    const addresses = await prisma.customerAddress.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            netsuiteCustomerId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ success: true, addresses })
  } catch (error) {
    console.error('Error fetching addresses:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch addresses',
      },
      { status: 500 }
    )
  }
}

