import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthHeader } from '@/lib/netsuite'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_RESTLET_URL = `https://${NETSUITE_ACCOUNT_ID}.restlets.api.netsuite.com/app/site/hosting/restlet.nl`
const NETSUITE_SCRIPT_ID = process.env.NETSUITE_FIELD_INFO_SCRIPT_ID || '2811'
const NETSUITE_DEPLOY_ID = process.env.NETSUITE_FIELD_INFO_DEPLOY_ID || '1'

interface FieldInfoRequest {
  recordType: string
  fieldId: string
}

interface FieldInfoResponse {
  recordType: string
  fieldId: string
  fieldType: 'select' | 'text' | 'date' | 'checkbox' | 'integer' | 'currency' | 'percent'
  count: number
  listItems: Array<{
    value: string
    text: string
  }>
}

/**
 * POST /api/netsuite/field-info
 * Queries NetSuite to get field information (type, options, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body: FieldInfoRequest = await request.json()
    const { recordType, fieldId } = body

    if (!recordType || !fieldId) {
      return NextResponse.json(
        {
          success: false,
          error: 'recordType and fieldId are required',
        },
        { status: 400 }
      )
    }

    const url = `${NETSUITE_RESTLET_URL}?script=${NETSUITE_SCRIPT_ID}&deploy=${NETSUITE_DEPLOY_ID}`
    const authorization = generateOAuthHeader('POST', url)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: '*/*',
        Prefer: 'transient',
      },
      body: JSON.stringify({ recordType, fieldId }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ NetSuite API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      })
      return NextResponse.json(
        {
          success: false,
          error: `NetSuite API error ${response.status}: ${errorText}`,
        },
        { status: response.status }
      )
    }

    const data: FieldInfoResponse = await response.json()

    return NextResponse.json({
      success: true,
      data,
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

