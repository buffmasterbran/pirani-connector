import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'

// GET - Fetch all order field mappings from database
export async function GET() {
  try {
    // First, try to fetch mappings without the relation (most reliable)
    const mappings = await prisma.orderFieldMapping.findMany({
      orderBy: {
        id: 'asc',
      },
    })
    
    let translationMappingsMap = new Map<number, any[]>()
    try {
      const rawTranslations = await prisma.orderFieldTranslationMapping.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      })

      for (const tm of rawTranslations) {
        const mappingId = tm.orderFieldMappingId
        if (!translationMappingsMap.has(mappingId)) {
          translationMappingsMap.set(mappingId, [])
        }
        translationMappingsMap.get(mappingId)!.push({
          id: tm.id,
          orderFieldMappingId: tm.orderFieldMappingId,
          shopifyValue: tm.shopifyValue,
          netsuiteValue: tm.netsuiteValue,
          isActive: tm.isActive,
        })
      }
    } catch (tmError: any) {
      console.warn('Could not fetch translation mappings:', tmError?.message)
    }
    
    // Combine mappings with their translation mappings
    const mappingsWithTranslations = mappings.map((m) => ({
      ...m,
      translationMappings: translationMappingsMap.get(m.id) || [],
    }))

    // Convert to the format expected by the frontend
    const formattedMappings = mappings.map((m) => {
      const translations = translationMappingsMap.get(m.id) || []
      return {
        id: String(m.id),
        mappingType: m.mappingType,
        shopifyCode: m.shopifyCode || undefined,
        shopifyValue: m.shopifyValue || undefined,
        netsuiteId: m.netsuiteId,
        applyToAllAccounts: m.applyToAllAccounts,
        isActive: m.isActive,
        customFieldId: m.customFieldId || undefined,
        translationDefaultValue: m.translationDefaultValue || undefined,
        translationMappings: translations.map((tm: any) => ({
          id: String(tm.id),
          orderFieldMappingId: String(tm.orderFieldMappingId),
          shopifyValue: tm.shopifyValue,
          netsuiteValue: tm.netsuiteValue,
          isActive: tm.isActive,
        })),
      }
    })

    return NextResponse.json({ success: true, data: formattedMappings })
  } catch (error) {
    return handleApiError(error, 'GET orderFieldMapping')
  }
}

// POST - Create a new order field mapping
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

    if (!netsuiteId) {
      return NextResponse.json(
        { success: false, error: 'netsuiteId is required' },
        { status: 400 },
      )
    }

    const mapping = await prisma.orderFieldMapping.create({
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

    // Convert to the format expected by the frontend
    const formattedMapping = {
      id: String(mapping.id),
      mappingType: mapping.mappingType,
      shopifyCode: mapping.shopifyCode || undefined,
      shopifyValue: mapping.shopifyValue || undefined,
      netsuiteId: mapping.netsuiteId,
      applyToAllAccounts: mapping.applyToAllAccounts,
      isActive: mapping.isActive,
      customFieldId: mapping.customFieldId || undefined,
    }

    return NextResponse.json({ success: true, data: formattedMapping })
  } catch (error) {
    return handleApiError(error, 'POST orderFieldMapping')
  }
}

// PUT - Batch save/update order field mappings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { mappings } = body
    
    // Debug logging
    console.log(`Processing ${mappings?.length || 0} mappings`)
    const mappingsWithTranslations = mappings?.filter((m: any) => m.translationMappings && m.translationMappings.length > 0) || []
    if (mappingsWithTranslations.length > 0) {
      console.log(`Found ${mappingsWithTranslations.length} mappings with translations:`, 
        mappingsWithTranslations.map((m: any) => ({
          id: m.id,
          netsuiteId: m.netsuiteId,
          translationCount: m.translationMappings?.length || 0
        }))
      )
    }

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { success: false, error: 'mappings must be an array' },
        { status: 400 }
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
        translationDefaultValue,
        translationMappings,
      } = mapping as any

      if (!netsuiteId) {
        console.warn(`Skipping mapping with missing netsuiteId:`, mapping)
        continue
      }

      // Check if ID starts with "temp-" (new mapping) or is a number (existing)
      if (id && id.toString().startsWith('temp-')) {
        // Create new mapping
        const newMapping = await prisma.orderFieldMapping.create({
          data: {
            mappingType: mappingType || 'Fixed',
            shopifyCode: shopifyCode || null,
            shopifyValue: shopifyValue || null,
            netsuiteId,
            applyToAllAccounts,
            isActive,
            customFieldId: customFieldId || null,
            translationDefaultValue: translationDefaultValue || null,
          },
        })
        
        // Create translation mappings if provided
        if (translationMappings && Array.isArray(translationMappings) && translationMappings.length > 0) {
          const validTranslations = translationMappings
            .filter((tm: any) => tm.shopifyValue && tm.netsuiteValue && tm.shopifyValue.trim() && tm.netsuiteValue.trim())
            .map((tm: any) => ({
              orderFieldMappingId: newMapping.id,
              shopifyValue: String(tm.shopifyValue).trim(),
              netsuiteValue: String(tm.netsuiteValue).trim(),
              isActive: tm.isActive !== false,
            }))
          
          if (validTranslations.length > 0) {
            await prisma.orderFieldTranslationMapping.createMany({
              data: validTranslations,
            })
            console.log(`Created ${validTranslations.length} translation mappings for mapping ${newMapping.id}`)
          }
        }
        
        results.push({
          oldId: id,
          newId: String(newMapping.id),
          action: 'created',
        })
      } else if (id) {
        // Update existing mapping
        const mappingId = parseInt(id.toString())
        if (!isNaN(mappingId)) {
          await prisma.orderFieldMapping.update({
            where: { id: mappingId },
            data: {
              mappingType: mappingType || 'Fixed',
              shopifyCode: shopifyCode !== undefined ? shopifyCode : null,
              shopifyValue: shopifyValue !== undefined ? shopifyValue : null,
              netsuiteId,
              applyToAllAccounts,
              isActive,
              customFieldId: customFieldId !== undefined ? customFieldId : null,
              translationDefaultValue: translationDefaultValue !== undefined ? translationDefaultValue : null,
            },
          })
          
          // Update translation mappings if provided
          if (translationMappings && Array.isArray(translationMappings)) {
            // Delete existing translation mappings
            await prisma.orderFieldTranslationMapping.deleteMany({
              where: { orderFieldMappingId: mappingId },
            })
            
            // Create new translation mappings
            if (translationMappings.length > 0) {
              const validTranslations = translationMappings
                .filter((tm: any) => tm.shopifyValue && tm.netsuiteValue && tm.shopifyValue.trim() && tm.netsuiteValue.trim())
                .map((tm: any) => ({
                  orderFieldMappingId: mappingId,
                  shopifyValue: String(tm.shopifyValue).trim(),
                  netsuiteValue: String(tm.netsuiteValue).trim(),
                  isActive: tm.isActive !== false,
                }))
              
              if (validTranslations.length > 0) {
                await prisma.orderFieldTranslationMapping.createMany({
                  data: validTranslations,
                })
                console.log(`Created ${validTranslations.length} translation mappings for mapping ${mappingId}`)
              }
            }
          }
          
          results.push({
            id: String(mappingId),
            action: 'updated',
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} mappings`,
      results,
    })
  } catch (error) {
    return handleApiError(error, 'PUT orderFieldMapping')
  }
}