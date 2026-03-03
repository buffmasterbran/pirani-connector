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

interface NetSuitePayment {
  id: number
  tranid: string
  otherrefnum: string // Order name like "#40567"
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
    payments?: NetSuitePayment[] // Optional for backward compatibility
  }
}

export interface NetSuiteTransactionRequest {
  account: number
  memo: string
  date: string // YYYY-MM-DD
  cashsales: string[] // Array of order names like ["#40567", "#39768"]
  refunds: string[] // Array of order names like ["#31509"]
  payments?: string[] // Array of order names for payments
}

export interface NetSuiteCustomer {
  id: string // NetSuite Internal ID
  email: string
  custentity_customer_category?: string
  [key: string]: any // Allow additional fields
}

export interface NetSuiteAddress {
  id: string // NetSuite Internal ID (addressbookaddress)
  entity: string // Customer Internal ID
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  defaultbilling?: boolean
  defaultshipping?: boolean
  [key: string]: any // Allow additional fields
}

export interface NetSuiteSuiteQLResponse<T = any> {
  links: Array<{ rel: string; href: string }>
  count: number
  hasMore: boolean
  items: T[]
  offset: number
  totalResults: number
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

/**
 * Fetches NetSuite transaction IDs for cash sales, refunds, and payments
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
      continue
    }

    // Check payments
    if (netsuiteData.details.payments) {
      const payment = netsuiteData.details.payments.find(
        (pmt) => pmt.otherrefnum === orderName
      )
      if (payment) {
        matches.set(transaction.order_name!, {
          id: payment.id,
          tranid: payment.tranid,
          amount: payment.amount,
          type: 'Payment',
        })
      }
    }
  }

  return matches
}

/**
 * Queries NetSuite SuiteQL API to find a customer by email
 * NetSuite customers are identified by email addresses
 */
export async function findNetSuiteCustomerByEmail(email: string): Promise<NetSuiteCustomer | null> {
  if (!NETSUITE_CONSUMER_KEY || !NETSUITE_CONSUMER_SECRET || !NETSUITE_TOKEN_ID || !NETSUITE_TOKEN_SECRET) {
    throw new Error(
      'NetSuite OAuth credentials not fully configured. Please set NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, and NETSUITE_TOKEN_SECRET'
    )
  }

  if (!email || !email.trim()) {
    return null
  }

  // Escape single quotes in email for SQL query
  const escapedEmail = email.replace(/'/g, "''")
  
  // Build SuiteQL query
  const query = `SELECT id, email, custentity_customer_category FROM customer WHERE email = '${escapedEmail}'`
  
  // SuiteQL API endpoint
  const suiteqlUrl = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
  
  // Generate OAuth header
  const authorization = generateOAuthHeader('POST', suiteqlUrl)

  try {
    const response = await fetch(suiteqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'transient',
        'Authorization': authorization,
        'Accept': '*/*',
      },
      body: JSON.stringify({ q: query }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`NetSuite SuiteQL API error ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as NetSuiteSuiteQLResponse<NetSuiteCustomer>

    // Return the first customer found, or null if none
    if (data.items && data.items.length > 0) {
      return data.items[0]
    }

    return null
  } catch (error) {
    console.error('Error querying NetSuite customer by email:', error)
    throw error
  }
}

/**
 * Queries NetSuite SuiteQL API to find addresses for a customer by NetSuite customer ID
 * Returns all addresses associated with the customer
 */
export async function findNetSuiteAddressesByCustomerId(netsuiteCustomerId: string): Promise<NetSuiteAddress[]> {
  if (!NETSUITE_CONSUMER_KEY || !NETSUITE_CONSUMER_SECRET || !NETSUITE_TOKEN_ID || !NETSUITE_TOKEN_SECRET) {
    throw new Error(
      'NetSuite OAuth credentials not fully configured. Please set NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, and NETSUITE_TOKEN_SECRET'
    )
  }

  if (!netsuiteCustomerId || !netsuiteCustomerId.trim()) {
    return []
  }

  // Escape single quotes in customer ID for SQL query
  const escapedCustomerId = netsuiteCustomerId.replace(/'/g, "''")
  
  // Build SuiteQL query to get addresses for the customer
  // NetSuite stores addresses in entityaddressbook joined with entityaddress
  const query = `SELECT eab.addressbookaddress AS id, eab.entity, ea.addr1 AS address1, ea.addr2 AS address2, ea.city, ea.state, ea.zip, ea.country, eab.defaultbilling, eab.defaultshipping FROM entityaddressbook eab JOIN entityaddress ea ON ea.nkey = eab.addressbookaddress WHERE eab.entity = '${escapedCustomerId}'`
  
  // SuiteQL API endpoint
  const suiteqlUrl = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
  
  // Generate OAuth header
  const authorization = generateOAuthHeader('POST', suiteqlUrl)

  try {
    const response = await fetch(suiteqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'transient',
        'Authorization': authorization,
        'Accept': '*/*',
      },
      body: JSON.stringify({ q: query }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`NetSuite SuiteQL API error ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as NetSuiteSuiteQLResponse<NetSuiteAddress>

    // Return all addresses found
    if (data.items && data.items.length > 0) {
      return data.items
    }

    return []
  } catch (error) {
    console.error(`Error querying NetSuite addresses for customer ${netsuiteCustomerId}:`, error)
    throw error
  }
}

/**
 * Fetches a NetSuite list using SuiteQL
 * Used for populating dropdowns (classes, locations, partners, etc.)
 */
export async function fetchNetSuiteList(queryName: string, query: string): Promise<Array<{ id: string; name: string; [key: string]: any }>> {
  if (!NETSUITE_CONSUMER_KEY || !NETSUITE_CONSUMER_SECRET || !NETSUITE_TOKEN_ID || !NETSUITE_TOKEN_SECRET) {
    throw new Error(
      'NetSuite OAuth credentials not fully configured. Please set NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET, NETSUITE_TOKEN_ID, and NETSUITE_TOKEN_SECRET'
    )
  }

  // SuiteQL API endpoint
  const suiteqlUrl = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`
  
  // Generate OAuth header
  const authorization = generateOAuthHeader('POST', suiteqlUrl)

  try {
    const response = await fetch(suiteqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'transient',
        'Authorization': authorization,
        'Accept': '*/*',
      },
      body: JSON.stringify({ q: query }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`NetSuite SuiteQL API error ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as NetSuiteSuiteQLResponse<any>

    // Return items, filtering out inactive ones if isinactive field exists
    if (data.items && data.items.length > 0) {
      return data.items
        .filter((item: any) => item.isinactive !== 'T' && item.isinactive !== true)
        .map((item: any) => {
          // Determine the display name based on available fields
          // For partners, use altname; for accounts, prefer acctname; otherwise use name
          let displayName = ''
          if (item.altname) {
            displayName = item.altname // Partners (from entity table)
          } else if (item.acctname) {
            displayName = item.acctname // Accounts
          } else {
            displayName = item.name || item.entityid || item.companyname || item.symbol || item.pluralname || item.ScriptID || ''
          }
          
          return {
            id: String(item.id),
            name: displayName,
            ...item,
          }
        })
    }

    return []
  } catch (error) {
    console.error(`Error querying NetSuite list ${queryName}:`, error)
    throw error
  }
}

/**
 * Matches a Shopify address to a NetSuite address by comparing address fields
 * Returns the NetSuite address ID if a match is found, null otherwise
 */
export function matchShopifyAddressToNetSuite(
  shopifyAddress: {
    address1?: string | null
    city?: string | null
    zip?: string | null
    province?: string | null
    country?: string | null
  },
  netsuiteAddresses: NetSuiteAddress[]
): string | null {
  if (!shopifyAddress.address1 && !shopifyAddress.city) {
    return null // Can't match without at least address1 or city
  }

  // Normalize strings for comparison (trim, lowercase, remove extra spaces)
  const normalize = (str: string | null | undefined): string => {
    if (!str) return ''
    return str.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  const shopifyAddress1 = normalize(shopifyAddress.address1)
  const shopifyCity = normalize(shopifyAddress.city)
  const shopifyZip = normalize(shopifyAddress.zip)
  const shopifyProvince = normalize(shopifyAddress.province)
  const shopifyCountry = normalize(shopifyAddress.country)

  // Try to find a match
  for (const nsAddress of netsuiteAddresses) {
    const nsAddress1 = normalize(nsAddress.address1)
    const nsCity = normalize(nsAddress.city)
    const nsZip = normalize(nsAddress.zip)
    const nsState = normalize(nsAddress.state)
    const nsCountry = normalize(nsAddress.country)

    // Match criteria (in order of reliability):
    // 1. Exact match on address1 + city + zip (most reliable)
    if (shopifyAddress1 && shopifyCity && shopifyZip) {
      if (
        shopifyAddress1 === nsAddress1 &&
        shopifyCity === nsCity &&
        shopifyZip === nsZip
      ) {
        return nsAddress.id
      }
    }

    // 2. Match on address1 + city (if zip not available)
    if (shopifyAddress1 && shopifyCity && !shopifyZip) {
      if (shopifyAddress1 === nsAddress1 && shopifyCity === nsCity) {
        return nsAddress.id
      }
    }

    // 3. Match on city + zip (if address1 not available)
    if (shopifyCity && shopifyZip && !shopifyAddress1) {
      if (shopifyCity === nsCity && shopifyZip === nsZip) {
        return nsAddress.id
      }
    }

    // 4. Match on address1 only (last resort, less reliable)
    if (shopifyAddress1 && !shopifyCity && !shopifyZip) {
      if (shopifyAddress1 === nsAddress1) {
        return nsAddress.id
      }
    }
  }

  return null // No match found
}

