import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/products/save
 * Saves/updates products from NetSuite to the database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const products = Array.isArray(body.products) ? body.products : []

    if (!products.length) {
      return NextResponse.json({ success: false, message: 'No products provided.' }, { status: 400 })
    }

    let imported = 0
    let updated = 0

    for (const product of products) {
      const productId = String(product.id)
      const now = new Date()

      // Prepare product data
      const productData = {
        sku: product.sku || null,
        name: product.name || null,
        isInactive: product.isinactive === 'T' || product.isinactive === true,
        category: 'ShopifyPriceQty', // Default category
        quantityAvailable: product.quantityavailable !== undefined && product.quantityavailable !== null ? parseFloat(String(product.quantityavailable)) : null,
        createdDate: product.createdDate ? new Date(product.createdDate) : null,
        lastLoadedFromNetSuite: now,
        isFulfillable: product.isFulfillable === true || product.isFulfillable === 'T',
        isOnline: product.isOnline === true || product.isOnline === 'T',
        itemType: product.type || null,
        saleUnitName: product.saleUnit?.name || null,
        unitsTypeName: product.unitsType?.name || null,
        shopifyInventoryItemId: product.shopifyInventoryItemId || null,
        shopifyProductId: product.shopifyProductId || null,
        shopifyVariantId: product.shopifyVariantId || null,
        rawData: JSON.stringify(product), // Store full product data
        updatedAt: now,
      }

      const result = await prisma.product.upsert({
        where: { id: productId },
        create: {
          id: productId,
          ...productData,
          createdAt: now,
        },
        update: {
          ...productData,
        },
      })

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        imported += 1
      } else {
        updated += 1
      }
    }

    return NextResponse.json({ success: true, imported, updated })
  } catch (error) {
    console.error('❌ Error saving products to database:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to save products to database' },
      { status: 500 },
    )
  }
}

