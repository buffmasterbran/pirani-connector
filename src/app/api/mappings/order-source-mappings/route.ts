import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { getMappings } from '@/lib/mapping-crud'

export async function GET() {
  return getMappings(prisma.orderSourceMapping, 'orderSourceMapping', {
    orderBy: [
      { friendlyName: 'asc' },
      { id: 'asc' },
    ],
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { appId, sourceName, friendlyName, isActive, isTaxable } = body

    if (!friendlyName) {
      return NextResponse.json(
        { success: false, error: 'Friendly name is required' },
        { status: 400 }
      )
    }

    if (!appId && !sourceName) {
      return NextResponse.json(
        { success: false, error: 'Either appId or sourceName must be provided' },
        { status: 400 }
      )
    }

    // Check if a mapping already exists for this appId or sourceName
    if (appId) {
      const existing = await prisma.orderSourceMapping.findUnique({
        where: { appId },
      })
      if (existing) {
        return NextResponse.json(
          { success: false, error: `A mapping already exists for app ID ${appId}` },
          { status: 400 }
        )
      }
    }

    if (sourceName) {
      const existing = await prisma.orderSourceMapping.findUnique({
        where: { sourceName },
      })
      if (existing) {
        return NextResponse.json(
          { success: false, error: `A mapping already exists for source name "${sourceName}"` },
          { status: 400 }
        )
      }
    }

    const mapping = await prisma.orderSourceMapping.create({
      data: {
        appId: appId ? Number(appId) : null,
        sourceName: sourceName || null,
        friendlyName,
        isTaxable: isTaxable !== undefined ? isTaxable : true,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    return handleApiError(error, 'POST orderSourceMapping')
  }
}
