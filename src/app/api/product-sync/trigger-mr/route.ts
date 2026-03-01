import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthHeader } from '@/lib/netsuite'

export const maxDuration = 30

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const TRIGGER_SCRIPT_ID = process.env.NETSUITE_TRIGGER_SCRIPT_ID
const TRIGGER_DEPLOY_ID = process.env.NETSUITE_TRIGGER_DEPLOY_ID || '1'

function getRestletUrl(): string | null {
  if (!TRIGGER_SCRIPT_ID) return null
  return `https://${NETSUITE_ACCOUNT_ID}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=${TRIGGER_SCRIPT_ID}&deploy=${TRIGGER_DEPLOY_ID}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'inventory_sync'

    const restletUrl = getRestletUrl()
    if (!restletUrl) {
      return NextResponse.json(
        { error: 'Trigger RESTlet not configured. Set NETSUITE_TRIGGER_SCRIPT_ID in environment variables.' },
        { status: 503 },
      )
    }

    console.info(`[trigger-mr] Calling RESTlet: ${restletUrl} with action=${action}`)

    let authorization: string
    try {
      authorization = generateOAuthHeader('POST', restletUrl)
    } catch (oauthErr) {
      console.error('[trigger-mr] OAuth header generation failed:', oauthErr)
      return NextResponse.json(
        { error: oauthErr instanceof Error ? oauthErr.message : 'OAuth header generation failed' },
        { status: 500 },
      )
    }

    const res = await fetch(restletUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify({ action }),
    })

    const text = await res.text()
    console.info(`[trigger-mr] NetSuite responded: HTTP ${res.status}, body=${text.slice(0, 300)}`)

    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: `NetSuite returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}` },
        { status: 502 },
      )
    }

    if (!res.ok) {
      const errMsg = data.error?.message || data.error || JSON.stringify(data)
      return NextResponse.json(
        { error: `NetSuite HTTP ${res.status}: ${errMsg}` },
        { status: res.status },
      )
    }

    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      taskId: data.taskId,
      message: data.message || 'M/R script triggered successfully',
    })
  } catch (error) {
    console.error('Error triggering M/R script:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger M/R script' },
      { status: 500 },
    )
  }
}
