import { NextRequest, NextResponse } from 'next/server'
import { executeSuiteQL } from '@/lib/netsuite/suiteql'

export const dynamic = 'force-dynamic'

interface FieldInfoRequest {
  recordType: string
  fieldId: string
}

interface CustomFieldRow {
  id: string
  scriptid: string
  name: string
  fieldtype: string
  fieldvaluetype: string | null
  fieldvaluetyperecord: string | null
}

interface CustomListRow {
  internalid: string
  name: string
  scriptid: string
}

interface ListValueRow {
  id: string
  name: string
  isinactive: string
}

/**
 * POST /api/netsuite/field-info
 * Queries NetSuite via SuiteQL to get custom field info and dropdown options.
 * Replaces RESTlet 2811.
 */
export async function POST(request: NextRequest) {
  try {
    const body: FieldInfoRequest = await request.json()
    const { recordType, fieldId } = body

    if (!recordType || !fieldId) {
      return NextResponse.json(
        { success: false, error: 'recordType and fieldId are required' },
        { status: 400 }
      )
    }

    // Step 1: Look up the custom field metadata
    const fieldData = await executeSuiteQL<CustomFieldRow>(
      `SELECT id, scriptid, name, fieldtype, fieldvaluetype, fieldvaluetyperecord FROM CustomField WHERE LOWER(scriptid) = LOWER('${fieldId.replace(/'/g, "''")}')`
    )

    if (!fieldData.items?.length) {
      return NextResponse.json({
        success: true,
        data: {
          recordType,
          fieldId,
          fieldType: 'text',
          count: 0,
          listItems: [],
        },
      })
    }

    const field = fieldData.items[0]
    const isSelect = field.fieldvaluetype === 'List/Record'
    const listId = field.fieldvaluetyperecord

    // If not a select/list field, return field info without options
    if (!isSelect || !listId) {
      const fieldTypeMap: Record<string, string> = {
        'BODY': 'text',
        'ENTITY': 'text',
      }
      return NextResponse.json({
        success: true,
        data: {
          recordType,
          fieldId,
          fieldType: field.fieldvaluetype?.toLowerCase() || fieldTypeMap[field.fieldtype] || 'text',
          count: 0,
          listItems: [],
        },
      })
    }

    // Step 2: Get the CustomList scriptid from the list internal ID
    const listData = await executeSuiteQL<CustomListRow>(
      `SELECT internalid, name, scriptid FROM CustomList WHERE internalid = '${listId}'`
    )

    if (!listData.items?.length) {
      return NextResponse.json({
        success: true,
        data: {
          recordType,
          fieldId,
          fieldType: 'select',
          count: 0,
          listItems: [],
        },
      })
    }

    const listScriptId = listData.items[0].scriptid

    // Step 3: Query the list values using the scriptid as a table name
    const allValues: ListValueRow[] = []
    let offset = 0
    const PAGE_SIZE = 1000
    while (true) {
      const valuesData = await executeSuiteQL<ListValueRow>(
        `SELECT id, name, isinactive FROM ${listScriptId} ORDER BY name`,
        PAGE_SIZE,
        offset
      )
      const items = valuesData.items || []
      allValues.push(...items)
      if (items.length < PAGE_SIZE || !valuesData.hasMore) break
      offset += PAGE_SIZE
    }

    // Filter out inactive items and map to expected shape
    const listItems = allValues
      .filter(item => item.isinactive !== 'T')
      .map(item => ({
        value: String(item.id),
        text: item.name,
      }))

    return NextResponse.json({
      success: true,
      data: {
        recordType,
        fieldId,
        fieldType: 'select',
        count: listItems.length,
        listItems,
      },
    })
  } catch (error) {
    console.error('❌ Error fetching NetSuite field info:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
