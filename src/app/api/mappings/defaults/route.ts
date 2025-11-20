import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/mappings/defaults?key=default_payment_method
 * Get a default mapping setting
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'key parameter is required' },
        { status: 400 },
      )
    }

    const setting = await prisma.mappingDefaults.findUnique({
      where: { settingKey: key },
    })

    if (!setting) {
      return NextResponse.json({
        success: true,
        value: null,
        exists: false,
      })
    }

    return NextResponse.json({
      success: true,
      value: setting.settingValue,
      exists: true,
    })
  } catch (error) {
    console.error('Error fetching default setting:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch default setting' },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/mappings/defaults
 * Create or update a default mapping setting
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, value, description } = body

    if (!key || value === undefined) {
      return NextResponse.json(
        { success: false, error: 'key and value are required' },
        { status: 400 },
      )
    }

    const setting = await prisma.mappingDefaults.upsert({
      where: { settingKey: key },
      update: {
        settingValue: value,
        description: description || undefined,
        isActive: true,
      },
      create: {
        settingKey: key,
        settingValue: value,
        description: description || undefined,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, data: setting })
  } catch (error) {
    console.error('Error saving default setting:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save default setting' },
      { status: 500 },
    )
  }
}

