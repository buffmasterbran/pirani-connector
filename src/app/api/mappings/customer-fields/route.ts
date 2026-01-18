import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CustomerFieldMapping } from '@/lib/mappingUtils'

export async function GET() {
  try {
    const mappings = await prisma.customerFieldMapping.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ success: true, data: mappings })
  } catch (error) {
    console.error('Error fetching customer field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch customer field mappings' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      mappingType = 'Fixed',
      shopifyCode,
      shopifyValue,
      netsuiteId,
      applyToAllAccounts = true,
      isActive = true,
      customFieldId,
    } = body

    if (!netsuiteId || (!shopifyCode && !shopifyValue && mappingType !== 'Fixed')) {
      return NextResponse.json(
        { success: false, error: 'netsuiteId and either shopifyCode or shopifyValue are required (unless Fixed type)' },
        { status: 400 },
      )
    }

    const newMapping = await prisma.customerFieldMapping.create({
      data: {
        mappingType,
        shopifyCode: shopifyCode || null,
        shopifyValue: shopifyValue || null,
        netsuiteId,
        applyToAllAccounts,
        isActive,
        customFieldId: customFieldId || null,
      },
    })

    return NextResponse.json({ success: true, data: newMapping })
  } catch (error) {
    console.error('Error creating customer field mapping:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create customer field mapping' },
      { status: 500 },
    )
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
      const {
        id,
        mappingType,
        shopifyCode,
        shopifyValue,
        netsuiteId,
        applyToAllAccounts = true,
        isActive = true,
        customFieldId,
      } = mapping as CustomerFieldMapping

      if (!netsuiteId || (!shopifyCode && !shopifyValue && mappingType !== 'Fixed')) {
        console.warn(`Skipping customer field mapping with missing netsuiteId or shopifyCode/Value:`, mapping)
        continue
      }

      if (id && id.toString().startsWith('temp-')) {
        // Create new mapping
        const newMapping = await prisma.customerFieldMapping.create({
          data: {
            mappingType: mappingType || 'Fixed',
            shopifyCode: shopifyCode || null,
            shopifyValue: shopifyValue || null,
            netsuiteId,
            applyToAllAccounts: typeof applyToAllAccounts === 'boolean' ? applyToAllAccounts : undefined,
            isActive: typeof isActive === 'boolean' ? isActive : undefined,
            customFieldId: customFieldId || null,
          },
        })
        results.push({ oldId: id, newId: newMapping.id, ...newMapping })
      } else {
        // Update existing mapping
        const updatedMapping = await prisma.customerFieldMapping.update({
          where: { id: Number(id) },
          data: {
            mappingType,
            shopifyCode: shopifyCode || null,
            shopifyValue: shopifyValue || null,
            netsuiteId,
            applyToAllAccounts: typeof applyToAllAccounts === 'boolean' ? applyToAllAccounts : undefined,
            isActive: typeof isActive === 'boolean' ? isActive : undefined,
            customFieldId: customFieldId || null,
          },
        })
        results.push(updatedMapping)
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error saving customer field mappings:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save customer field mappings' },
      { status: 500 },
    )
  }
}