import crypto from 'crypto'

const NETSUITE_RESTLET_URL = process.env.NETSUITE_RESTLET_URL
const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_SCRIPT_ID = process.env.NETSUITE_SCRIPT_ID || '2805'
const NETSUITE_DEPLOY_ID = process.env.NETSUITE_DEPLOY_ID || '1'
const NETSUITE_CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY
const NETSUITE_CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET
const NETSUITE_TOKEN_ID = process.env.NETSUITE_TOKEN_ID
const NETSUITE_TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET

interface NetSuiteCashSale {
  id: number
  tranid: string
  otherrefnum: string // Order name like "#40567"
  entity: string
  amount: number
  type: string
}

interface NetSuiteRefund {
  id: number
  tranid: string
  otherrefnum: string // Order name like "#31509"
  entity: string
  amount: number
  type: string
}

interface NetSuiteResponse {
  status: string
  message: string
  details: {
    cashsales: NetSuiteCashSale[]
    refunds: NetSuiteRefund[]
  }
}

export interface NetSuiteTransactionRequest {
  account: number
  memo: string
  date: string // YYYY-MM-DD
  cashsales: string[] // Array of order names like ["#40567", "#39768"]
  refunds: string[] // Array of order names like ["#31509"]
}

/**
 * Percent-encodes a string according to RFC 3986
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

/**
 * Generates a random nonce for OAuth
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Generates OAuth 1.0 signature for NetSuite RESTlet
 */
function generateOAuthSignature(
  method: string,
  baseUrl: string,
  queryParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
  timestamp: string,
  nonce: string
): string {
  // Combine OAuth parameters with query parameters
  const allParams: Record<string, string> = {
    oauth_consumer_key: NETSUITE_CONSUMER_KEY!,
    oauth_token: NETSUITE_TOKEN_ID!,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: '1.0',
    ...queryParams,
  }

  // Sort parameters by key
  const sortedKeys = Object.keys(allParams).sort()
  const normalizedParams = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&')

  // Create base string (URL without query params, query params go in normalized params)
  const baseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(normalizedParams)}`

  // Create signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`

  // Generate signature
  const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64')

  return signature
}

/**
 * Generates OAuth 1.0 Authorization header
 */
export function generateOAuthHeader(method: string, url: string): string {
  if (!NETSUITE_CONSUMER_KEY || !NETSUITE_CONSUMER_SECRET || !NETSUITE_TOKEN_ID || !NETSUITE_TOKEN_SECRET) {
    throw new Error(
      'NetSuite OAuth credentials not fully configured. Please set NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, and NETSUITE_TOKEN_SECRET'
    )
  }

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = generateNonce()

  // Parse URL to separate base URL and query parameters
  const urlObj = new URL(url)
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const queryParams: Record<string, string> = {}
  urlObj.searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  // Generate signature
  const signature = generateOAuthSignature(
    method,
    baseUrl,
    queryParams,
    NETSUITE_CONSUMER_SECRET,
    NETSUITE_TOKEN_SECRET,
    timestamp,
    nonce
  )

  // Build Authorization header
  const authParams = [
    `realm="${NETSUITE_ACCOUNT_ID}"`,
    `oauth_consumer_key="${NETSUITE_CONSUMER_KEY}"`,
    `oauth_token="${NETSUITE_TOKEN_ID}"`,
    `oauth_signature_method="HMAC-SHA256"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_nonce="${nonce}"`,
    `oauth_version="1.0"`,
    `oauth_signature="${percentEncode(signature)}"`,
  ]

  return `OAuth ${authParams.join(',')}`
}

/**
 * Fetches NetSuite transaction IDs for cash sales and refunds
 */
export async function fetchNetSuiteTransactions(
  request: NetSuiteTransactionRequest
): Promise<NetSuiteResponse> {
  if (!NETSUITE_RESTLET_URL) {
    throw new Error('NETSUITE_RESTLET_URL environment variable is not set')
  }

  const url = `${NETSUITE_RESTLET_URL}?script=${NETSUITE_SCRIPT_ID}&deploy=${NETSUITE_DEPLOY_ID}`

  // Generate OAuth header dynamically
  const authorization = generateOAuthHeader('POST', url)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      Accept: '*/*',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`NetSuite API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data as NetSuiteResponse
}

/**
 * Matches NetSuite transactions to PayoutTransactions by order name
 */
export function matchNetSuiteTransactions(
  transactions: Array<{ order_name?: string | null; type?: string | null }>,
  netsuiteData: NetSuiteResponse
): Map<string, { id: number; tranid: string; amount: number; type: string }> {
  const matches = new Map()

  for (const transaction of transactions) {
    const orderName = transaction.order_name
    if (!orderName || orderName === '—' || orderName === 'N/A') continue

    // Check cash sales
    const cashSale = netsuiteData.details.cashsales.find(
      (cs) => cs.otherrefnum === orderName
    )
    if (cashSale) {
      matches.set(transaction.order_name!, {
        id: cashSale.id,
        tranid: cashSale.tranid,
        amount: cashSale.amount,
        type: 'Cash Sale',
      })
      continue
    }

    // Check refunds
    const refund = netsuiteData.details.refunds.find(
      (rf) => rf.otherrefnum === orderName
    )
    if (refund) {
      matches.set(transaction.order_name!, {
        id: refund.id,
        tranid: refund.tranid,
        amount: refund.amount,
        type: 'Cash Refund',
      })
    }
  }

  return matches
}

