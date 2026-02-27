import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const DEFAULT_MAPPINGS = [
  // --- Required ---
  { mappingType: 'item_field', shopifyField: 'sku', netsuiteFieldId: 'itemid', isRequired: true, category: 'required', sortOrder: 0 },
  { mappingType: 'item_field', shopifyField: 'title', netsuiteFieldId: 'displayname', isRequired: true, category: 'required', sortOrder: 1 },
  // --- Special (price, inventory, category) ---
  { mappingType: 'special', shopifyField: 'price', netsuiteFieldId: null, isRequired: false, category: 'required', sortOrder: 10, specialConfig: {} },
  { mappingType: 'special', shopifyField: 'compare_at_price', netsuiteFieldId: null, isRequired: false, category: 'standard', sortOrder: 11, specialConfig: {} },
  { mappingType: 'special', shopifyField: 'inventory_quantity', netsuiteFieldId: null, isRequired: false, category: 'required', sortOrder: 12, specialConfig: {} },
  { mappingType: 'special', shopifyField: 'collections', netsuiteFieldId: null, isRequired: false, category: 'standard', sortOrder: 13, specialConfig: {} },
  // --- Standard ---
  { mappingType: 'item_field', shopifyField: 'body_html', netsuiteFieldId: 'salesdescription', isRequired: false, category: 'standard', sortOrder: 20 },
  { mappingType: 'item_field', shopifyField: 'weight', netsuiteFieldId: 'weight', isRequired: false, category: 'standard', sortOrder: 21 },
  { mappingType: 'item_field', shopifyField: 'weight_unit', netsuiteFieldId: 'weightunit', isRequired: false, category: 'standard', sortOrder: 22 },
  { mappingType: 'item_field', shopifyField: 'barcode', netsuiteFieldId: 'upccode', isRequired: false, category: 'standard', sortOrder: 23 },
  { mappingType: 'item_field', shopifyField: 'vendor', netsuiteFieldId: 'manufacturer', isRequired: false, category: 'standard', sortOrder: 24 },
  { mappingType: 'item_field', shopifyField: 'product_type', netsuiteFieldId: 'class', isRequired: false, category: 'standard', sortOrder: 25 },
  { mappingType: 'item_field', shopifyField: 'tags', netsuiteFieldId: 'custitem_fa_shpfy_tags', isRequired: false, category: 'standard', sortOrder: 26 },
  { mappingType: 'item_field', shopifyField: 'published', netsuiteFieldId: 'isonline', isRequired: false, category: 'standard', sortOrder: 27 },
  { mappingType: 'item_field', shopifyField: 'taxable', netsuiteFieldId: 'istaxable', isRequired: false, category: 'standard', sortOrder: 28 },
  // --- Uncommon ---
  { mappingType: 'item_field', shopifyField: 'handle', netsuiteFieldId: 'custitem_fa_shopify_handle', isRequired: false, category: 'uncommon', sortOrder: 40 },
  { mappingType: 'item_field', shopifyField: 'variant_title', netsuiteFieldId: 'storedisplayname', isRequired: false, category: 'uncommon', sortOrder: 41 },
  { mappingType: 'item_field', shopifyField: 'requires_shipping', netsuiteFieldId: 'custitem_fa_shpfy_reqship', isRequired: false, category: 'uncommon', sortOrder: 42 },
  { mappingType: 'item_field', shopifyField: 'inventory_policy', netsuiteFieldId: 'custitem_fa_shpfy_backords', isRequired: false, category: 'uncommon', sortOrder: 43 },
  { mappingType: 'item_field', shopifyField: 'metafields_global_title_tag', netsuiteFieldId: 'custitem_fa_shpfy_metatitl', isRequired: false, category: 'uncommon', sortOrder: 44 },
  { mappingType: 'item_field', shopifyField: 'metafields_global_description_tag', netsuiteFieldId: 'custitem_fa_shpfy_metadesc', isRequired: false, category: 'uncommon', sortOrder: 45 },
  { mappingType: 'item_field', shopifyField: 'published_at', netsuiteFieldId: 'custitem_fa_shpfy_pub_at', isRequired: false, category: 'uncommon', sortOrder: 46 },
  { mappingType: 'item_field', shopifyField: 'published_scope', netsuiteFieldId: 'custitem_fa_shpfy_pubscope', isRequired: false, category: 'uncommon', sortOrder: 47 },
  { mappingType: 'item_field', shopifyField: 'inventory_management', netsuiteFieldId: 'isdropshipitem', isRequired: false, category: 'uncommon', sortOrder: 48 },
]

export async function GET(request: NextRequest) {
  try {
    const storeConfigId = request.nextUrl.searchParams.get('storeConfigId')

    const mappings = await prisma.productSyncFieldMapping.findMany({
      where: storeConfigId
        ? { OR: [{ storeConfigId }, { storeConfigId: null }] }
        : undefined,
      orderBy: { sortOrder: 'asc' },
      include: { storeConfig: { select: { storeName: true, storeLabel: true } } },
    })

    return NextResponse.json({ mappings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching field mappings:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, ...data } = body

    if (action === 'seed') {
      const targetStoreId = data.storeConfigId || null

      // Delete existing mappings for this scope, then re-create to avoid duplicates
      // (NULL storeConfigId = "All Accounts" — PostgreSQL unique constraint doesn't catch NULL duplicates)
      await prisma.productSyncFieldMapping.deleteMany({
        where: { storeConfigId: targetStoreId },
      })

      const created = await prisma.$transaction(
        DEFAULT_MAPPINGS.map((m) =>
          prisma.productSyncFieldMapping.create({
            data: {
              storeConfigId: targetStoreId,
              mappingType: m.mappingType,
              shopifyField: m.shopifyField,
              netsuiteFieldId: m.netsuiteFieldId,
              isRequired: m.isRequired,
              isEnabled: true,
              sortOrder: m.sortOrder,
              category: m.category,
              specialConfig: (m as Record<string, unknown>).specialConfig
                ? ((m as Record<string, unknown>).specialConfig as Prisma.InputJsonValue)
                : undefined,
            },
          })
        )
      )

      return NextResponse.json({ message: 'Seeded default mappings', count: created.length })
    }

    if (action === 'upsert') {
      const mapping = await prisma.productSyncFieldMapping.upsert({
        where: {
          storeConfigId_shopifyField: {
            storeConfigId: data.storeConfigId || '',
            shopifyField: data.shopifyField,
          },
        },
        create: {
          storeConfigId: data.storeConfigId || null,
          mappingType: data.mappingType || 'item_field',
          shopifyField: data.shopifyField,
          netsuiteFieldId: data.netsuiteFieldId || null,
          defaultValue: data.defaultValue || null,
          isRequired: data.isRequired || false,
          isEnabled: data.isEnabled ?? true,
          sortOrder: data.sortOrder || 0,
          category: data.category || 'standard',
          specialConfig: data.specialConfig ? (data.specialConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
        update: {
          netsuiteFieldId: data.netsuiteFieldId,
          defaultValue: data.defaultValue,
          isEnabled: data.isEnabled,
          sortOrder: data.sortOrder,
          specialConfig: data.specialConfig ? (data.specialConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
          mappingType: data.mappingType,
        },
      })

      return NextResponse.json({ mapping })
    }

    if (action === 'delete') {
      if (!data.id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      }
      await prisma.productSyncFieldMapping.delete({ where: { id: data.id } })
      return NextResponse.json({ success: true })
    }

    if (action === 'bulk_save') {
      const { mappings } = data as { mappings: Array<Record<string, unknown>> }
      if (!Array.isArray(mappings)) {
        return NextResponse.json({ error: 'mappings must be an array' }, { status: 400 })
      }

      const results = await prisma.$transaction(
        mappings.map((m) => {
          if (m.id) {
            return prisma.productSyncFieldMapping.update({
              where: { id: m.id as string },
              data: {
                netsuiteFieldId: m.netsuiteFieldId as string | null | undefined,
                defaultValue: m.defaultValue as string | null | undefined,
                isEnabled: m.isEnabled as boolean | undefined,
                sortOrder: m.sortOrder as number | undefined,
                specialConfig: m.specialConfig ? (m.specialConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
                storeConfigId: m.storeConfigId as string | null | undefined,
              },
            })
          }
          return prisma.productSyncFieldMapping.create({
            data: {
              storeConfigId: (m.storeConfigId as string) || null,
              mappingType: (m.mappingType as string) || 'item_field',
              shopifyField: m.shopifyField as string,
              netsuiteFieldId: (m.netsuiteFieldId as string) || null,
              defaultValue: (m.defaultValue as string) || null,
              isRequired: (m.isRequired as boolean) || false,
              isEnabled: (m.isEnabled as boolean) ?? true,
              sortOrder: (m.sortOrder as number) || 0,
              category: (m.category as string) || 'standard',
              specialConfig: m.specialConfig ? (m.specialConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          })
        })
      )

      return NextResponse.json({ saved: results.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error in field mappings:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
