import crypto from 'crypto'
import {
  NETSUITE_ACCOUNT_ID,
  NETSUITE_CONSUMER_KEY,
  NETSUITE_CONSUMER_SECRET,
  NETSUITE_TOKEN_ID,
  NETSUITE_TOKEN_SECRET,
} from './constants'

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '')
}

function generateOAuthSignature(
  method: string,
  baseUrl: string,
  queryParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
  timestamp: string,
  nonce: string
): string {
  const allParams: Record<string, string> = {
    oauth_consumer_key: NETSUITE_CONSUMER_KEY!,
    oauth_token: NETSUITE_TOKEN_ID!,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: '1.0',
    ...queryParams,
  }

  const sortedKeys = Object.keys(allParams).sort()
  const normalizedParams = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&')

  const baseString = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(normalizedParams)}`
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
  const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64')

  return signature
}

export function generateOAuthHeader(method: string, url: string): string {
  if (!NETSUITE_CONSUMER_KEY || !NETSUITE_CONSUMER_SECRET || !NETSUITE_TOKEN_ID || !NETSUITE_TOKEN_SECRET) {
    throw new Error(
      'NetSuite OAuth credentials not fully configured. Please set NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, and NETSUITE_TOKEN_SECRET'
    )
  }

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = generateNonce()

  const urlObj = new URL(url)
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const queryParams: Record<string, string> = {}
  urlObj.searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  const signature = generateOAuthSignature(
    method,
    baseUrl,
    queryParams,
    NETSUITE_CONSUMER_SECRET,
    NETSUITE_TOKEN_SECRET,
    timestamp,
    nonce
  )

  const authParams = [
    `realm="${NETSUITE_ACCOUNT_ID.replace(/-/g, '_')}"`,
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
