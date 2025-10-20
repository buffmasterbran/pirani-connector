import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('📋 Fetching payout settings...')
    const settings = await prisma.payoutSettings.findMany({
      orderBy: { settingName: 'asc' }
    })
    
    console.log(`✅ Found ${settings.length} payout settings`)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error fetching payout settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payout settings' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      settingName,
      settingDescription,
      netsuiteAccountId,
      settingType,
      defaultValue,
      currentValue,
      isActive = true
    } = await request.json()

    if (!settingName || !settingType || !currentValue) {
      return NextResponse.json(
        { error: 'settingName, settingType, and currentValue are required' },
        { status: 400 }
      )
    }

    console.log(`🔧 Creating payout setting: ${settingName}`)
    
    const setting = await prisma.payoutSettings.create({
      data: {
        settingName,
        settingDescription,
        netsuiteAccountId,
        settingType,
        defaultValue,
        currentValue,
        isActive
      }
    })

    console.log(`✅ Created payout setting: ${setting.settingName}`)
    return NextResponse.json({ 
      message: 'Payout setting created successfully',
      setting 
    })
  } catch (error) {
    console.error('Error creating payout setting:', error)
    return NextResponse.json(
      { error: 'Failed to create payout setting' },
      { status: 500 }
    )
  }
}
