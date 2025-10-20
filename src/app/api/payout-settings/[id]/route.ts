import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    const {
      settingName,
      settingDescription,
      netsuiteAccountId,
      settingType,
      defaultValue,
      currentValue,
      isActive
    } = await request.json()

    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid setting ID' },
        { status: 400 }
      )
    }

    console.log(`🔧 Updating payout setting ID: ${id}`)
    
    const setting = await prisma.payoutSettings.update({
      where: { id },
      data: {
        ...(settingName && { settingName }),
        ...(settingDescription !== undefined && { settingDescription }),
        ...(netsuiteAccountId !== undefined && { netsuiteAccountId }),
        ...(settingType && { settingType }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(currentValue !== undefined && { currentValue }),
        ...(isActive !== undefined && { isActive })
      }
    })

    console.log(`✅ Updated payout setting: ${setting.settingName}`)
    return NextResponse.json({ 
      message: 'Payout setting updated successfully',
      setting 
    })
  } catch (error) {
    console.error('Error updating payout setting:', error)
    return NextResponse.json(
      { error: 'Failed to update payout setting' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid setting ID' },
        { status: 400 }
      )
    }

    console.log(`🗑️ Deleting payout setting ID: ${id}`)
    
    await prisma.payoutSettings.delete({
      where: { id }
    })

    console.log(`✅ Deleted payout setting ID: ${id}`)
    return NextResponse.json({ 
      message: 'Payout setting deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting payout setting:', error)
    return NextResponse.json(
      { error: 'Failed to delete payout setting' },
      { status: 500 }
    )
  }
}
