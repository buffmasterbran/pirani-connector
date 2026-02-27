import { NextResponse } from 'next/server'
import { generateOAuthHeader } from '@/lib/netsuite'

export const dynamic = 'force-dynamic'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const SUITEQL_BASE = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`

const STANDARD_ITEM_FIELDS = [
  { fieldId: 'itemid', label: 'Item Name/Number (SKU)', type: 'text', group: 'standard' },
  { fieldId: 'displayname', label: 'Display Name', type: 'text', group: 'standard' },
  { fieldId: 'salesdescription', label: 'Sales Description', type: 'textarea', group: 'standard' },
  { fieldId: 'weight', label: 'Weight', type: 'float', group: 'standard' },
  { fieldId: 'weightunit', label: 'Weight Unit', type: 'select', group: 'standard' },
  { fieldId: 'upccode', label: 'UPC Code', type: 'text', group: 'standard' },
  { fieldId: 'manufacturer', label: 'Manufacturer', type: 'text', group: 'standard' },
  { fieldId: 'class', label: 'Class', type: 'select', group: 'standard' },
  { fieldId: 'department', label: 'Department', type: 'select', group: 'standard' },
  { fieldId: 'location', label: 'Location', type: 'select', group: 'standard' },
  { fieldId: 'isonline', label: 'Display in Web Store', type: 'checkbox', group: 'standard' },
  { fieldId: 'istaxable', label: 'Taxable', type: 'checkbox', group: 'standard' },
  { fieldId: 'isinactive', label: 'Is Inactive', type: 'checkbox', group: 'standard' },
  { fieldId: 'itemtype', label: 'Item Type', type: 'select', group: 'standard' },
  { fieldId: 'cost', label: 'Cost', type: 'currency', group: 'standard' },
  { fieldId: 'storedescription', label: 'Store Description', type: 'textarea', group: 'standard' },
  { fieldId: 'storedetaileddescription', label: 'Store Detailed Description', type: 'textarea', group: 'standard' },
  { fieldId: 'storedisplayname', label: 'Store Display Name', type: 'text', group: 'standard' },
  { fieldId: 'vendorname', label: 'Vendor Name', type: 'text', group: 'standard' },
  { fieldId: 'mpn', label: 'MPN', type: 'text', group: 'standard' },
  { fieldId: 'isdropshipitem', label: 'Drop Ship Item', type: 'checkbox', group: 'standard' },
  { fieldId: 'parent', label: 'Parent Item', type: 'select', group: 'standard' },
]

async function executeSuiteQL<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const url = `${SUITEQL_BASE}?limit=1000&offset=0`
  const authorization = generateOAuthHeader('POST', url)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'transient',
      Authorization: authorization,
      Accept: '*/*',
    },
    body: JSON.stringify({ q: query }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`NetSuite SuiteQL error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data.items || []
}

export async function GET() {
  try {
    let customFields: Array<{ fieldId: string; label: string; type: string; group: string }> = []

    try {
      const rows = await executeSuiteQL<{
        scriptid: string
        fieldtype: string
        label: string
      }>(
        `SELECT customfield.scriptid, customfield.fieldtype, customfield.label
         FROM customfield
         WHERE customfield.scriptid LIKE 'custitem_%' AND customfield.isinactive = 'F'
         ORDER BY customfield.label`
      )

      customFields = rows.map((row) => ({
        fieldId: row.scriptid?.toLowerCase() || '',
        label: row.label || row.scriptid || '',
        type: row.fieldtype || 'text',
        group: 'custom',
      }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('Could not fetch custom fields from NetSuite:', message)
    }

    const allFields = [...STANDARD_ITEM_FIELDS, ...customFields]

    return NextResponse.json({
      fields: allFields,
      standardCount: STANDARD_ITEM_FIELDS.length,
      customCount: customFields.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching NetSuite fields:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
