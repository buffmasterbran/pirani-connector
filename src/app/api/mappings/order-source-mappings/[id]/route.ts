import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = Number(resolvedParams.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

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

    // Check if another mapping already exists for this appId or sourceName
    if (appId) {
      const existing = await prisma.orderSourceMapping.findUnique({
        where: { appId },
      })
      if (existing && existing.id !== id) {
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
      if (existing && existing.id !== id) {
        return NextResponse.json(
          { success: false, error: `A mapping already exists for source name "${sourceName}"` },
          { status: 400 }
        )
      }
    }

    const mapping = await prisma.orderSourceMapping.update({
      where: { id },
      data: {
        appId: appId ? Number(appId) : null,
        sourceName: sourceName || null,
        friendlyName,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json({ success: true, data: mapping })
  } catch (error) {
    console.error('Error updating order source mapping:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update order source mapping',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = Number(resolvedParams.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      )
    }

    await prisma.orderSourceMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order source mapping:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete order source mapping',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}



