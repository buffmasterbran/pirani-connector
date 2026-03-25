import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { getMappings } from '@/lib/mapping-crud'

export async function GET() {
  return getMappings(prisma.paymentMethodMapping, 'paymentMethodMapping', {
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { shopifyCode, netsuiteId, isActive = true } = body

    if (!shopifyCode || !netsuiteId) {
      return NextResponse.json(
        { success: false, error: 'shopifyCode and netsuiteId are required' },
        { status: 400 },
      )
    }

    // Use upsert to handle existing mappings
    const mapping = await prisma.paymentMethodMapping.upsert({
      where: { shopifyCode },
      update: {
        netsuiteId,
        isActive,
      },
      create: {
        shopifyCode,
        netsuiteId,
        isActive,
      },
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    return handleApiError(error, 'POST paymentMethodMapping')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mappings } = body

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { success: false, error: 'mappings must be an array' },
        { status: 400 },
      )
    }

    const results = []
    for (const mapping of mappings) {
      const { id, shopifyCode, netsuiteId, isActive = true } = mapping

      if (!shopifyCode || !netsuiteId) {
        console.warn(`Skipping payment method mapping with missing shopifyCode or netsuiteId:`, mapping)
        continue
      }

      if (id && !id.toString().startsWith('temp-')) {
        // Update existing mapping
        const updated = await prisma.paymentMethodMapping.update({
          where: { id: Number(id) },
          data: {
            shopifyCode,
            netsuiteId,
            isActive,
          },
        })
        results.push(updated)
      } else {
        // Create new mapping (or update if shopifyCode exists)
        const created = await prisma.paymentMethodMapping.upsert({
          where: { shopifyCode },
          update: {
            netsuiteId,
            isActive,
          },
          create: {
            shopifyCode,
            netsuiteId,
            isActive,
          },
        })
        results.push(created)
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return handleApiError(error, 'PUT paymentMethodMapping')
  }
}
