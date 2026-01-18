import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const mappings = await prisma.orderSourceMapping.findMany({
      orderBy: [
        { friendlyName: 'asc' },
        { id: 'asc' },
      ],
    })

    return NextResponse.json({
      success: true,
      data: mappings,
    })
  } catch (error) {
    console.error('Error fetching order source mappings:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch order source mappings',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { appId, sourceName, friendlyName, isActive } = body

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
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error creating order source mapping:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create order source mapping',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}



