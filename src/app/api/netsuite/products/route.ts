import { NextRequest, NextResponse } from 'next/server'
import { fetchNetSuiteList } from '@/lib/netsuite'

/**
 * GET /api/netsuite/products
 * Fetches products/items from NetSuite using SuiteQL
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build SuiteQL query to fetch items/products
    // NetSuite stores items in the 'item' table
    // We'll get basic item info: id, itemid (SKU), displayname (name), isinactive
    // Note: SuiteQL doesn't support LIMIT/OFFSET in the query - pagination is handled by the API
    let query = `
      SELECT 
        id,
        itemid AS sku,
        displayname AS name,
        isinactive
      FROM item
      WHERE isinactive = 'F'
    `

    // Add search filter if provided
    if (search.trim()) {
      const escapedSearch = search.replace(/'/g, "''")
      query += ` AND (itemid LIKE '%${escapedSearch}%' OR displayname LIKE '%${escapedSearch}%')`
    }

    query += ` ORDER BY itemid`

    const items = await fetchNetSuiteList('products', query)

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
    })
  } catch (error) {
    console.error('❌ Error fetching NetSuite products:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

