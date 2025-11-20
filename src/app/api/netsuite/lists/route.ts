import { NextRequest, NextResponse } from 'next/server'
import { fetchNetSuiteList } from '@/lib/netsuite'

// Map field names to query configurations
const FIELD_QUERIES: Record<string, { name: string; query: string }> = {
  class: {
    name: 'classes',
    query: "SELECT id, name, isinactive FROM classification ORDER BY name"
  },
  location: {
    name: 'locations',
    query: "SELECT id, name, parent, isinactive FROM location ORDER BY name"
  },
  partner: {
    name: 'partners',
    query: "SELECT p.id, e.entityid, e.altname, e.firstname, e.lastname, e.email, p.isinactive, e.isperson FROM partner p LEFT JOIN entity e ON e.id = p.id ORDER BY e.entityid"
  },
  shipMethod: {
    name: 'shipmethods',
    query: "SELECT id, name, isinactive FROM shipmethod ORDER BY name"
  },
  taxCode: {
    name: 'taxcodes',
    query: "SELECT id, name, rate, isinactive FROM taxcode ORDER BY name"
  },
  priceLevel: {
    name: 'pricelevels',
    query: "SELECT id, name, isinactive FROM pricelevel ORDER BY name"
  },
  units: {
    name: 'units',
    query: "SELECT id, name, pluralname, abbreviation, isinactive FROM unitstype ORDER BY name"
  },
  subsidiary: {
    name: 'subsidiaries',
    query: "SELECT id, name, isinactive FROM subsidiary ORDER BY name"
  },
  currency: {
    name: 'currencies',
    query: "SELECT id, name, symbol, isinactive FROM currency ORDER BY name"
  },
  terms: {
    name: 'terms',
    query: "SELECT id, name, daysuntilnetdue, isinactive FROM term ORDER BY name"
  },
  department: {
    name: 'departments',
    query: "SELECT id, name, isinactive FROM department ORDER BY name"
  },
  account: {
    name: 'accounts',
    query: "SELECT id, acctnumber, acctname, isinactive FROM account ORDER BY acctname"
  },
  shipMethod: {
    name: 'shipmethods',
    query: "SELECT id, name, isinactive FROM shipmethod ORDER BY name"
  },
  taxCode: {
    name: 'taxcodes',
    query: "SELECT id, name, rate, isinactive FROM taxcode ORDER BY name"
  },
  priceLevel: {
    name: 'pricelevels',
    query: "SELECT id, name, isinactive FROM pricelevel ORDER BY name"
  },
  units: {
    name: 'units',
    query: "SELECT id, name, pluralname, abbreviation, isinactive FROM unitstype ORDER BY name"
  },
  unitsOfMeasure: {
    name: 'units',
    query: "SELECT id, name, pluralname, abbreviation, isinactive FROM unitstype ORDER BY name"
  },
  purchaseOrderVendor: {
    name: 'vendors',
    query: "SELECT v.id, e.entityid, e.altname, e.firstname, e.lastname, e.email, v.isinactive, e.isperson FROM vendor v LEFT JOIN entity e ON e.id = v.id ORDER BY e.entityid"
  },
}

/**
 * GET /api/netsuite/lists?field=class
 * Fetches a NetSuite list for populating dropdowns
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const field = searchParams.get('field')

    if (!field) {
      return NextResponse.json(
        {
          success: false,
          error: 'field parameter is required',
        },
        { status: 400 }
      )
    }

    const queryConfig = FIELD_QUERIES[field]
    if (!queryConfig) {
      return NextResponse.json(
        {
          success: false,
          error: `No query configured for field: ${field}`,
        },
        { status: 400 }
      )
    }

    const items = await fetchNetSuiteList(queryConfig.name, queryConfig.query)

    return NextResponse.json({
      success: true,
      items,
    })
  } catch (error) {
    console.error('❌ Error fetching NetSuite list:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

