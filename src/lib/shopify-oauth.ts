import crypto from 'crypto'

const SCOPES = [
  'read_orders',
  'read_all_orders',
  'write_orders',
  'read_customers',
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_shopify_payments_payouts',
].join(',')

export function getOAuthConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim()
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim()
  return { clientId, clientSecret }
}

export function isOAuthConfigured(): boolean {
  const { clientId, clientSecret } = getOAuthConfig()
  return !!(clientId && clientSecret)
}

/** Normalize shop to xxx.myshopify.com */
export function normalizeShop(shop: string): string {
  const s = shop.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
  if (s.endsWith('.myshopify.com')) return s
  return `${s}.myshopify.com`
}

/** Build the Shopify authorize URL to redirect the merchant to. */
export function buildAuthorizeUrl(shop: string, redirectUri: string, state: string): string {
  const { clientId } = getOAuthConfig()
  if (!clientId) throw new Error('SHOPIFY_CLIENT_ID is not set')
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

/** Verify HMAC from Shopify callback using the raw query string. */
export function verifyHmacFromUrl(rawQueryString: string): boolean {
  const { clientSecret } = getOAuthConfig()
  if (!clientSecret) return false

  const pairs = rawQueryString.replace(/^\?/, '').split('&')
  let hmac = ''
  const rest: string[] = []
  for (const pair of pairs) {
    if (pair.startsWith('hmac=')) {
      hmac = pair.slice(5)
    } else {
      rest.push(pair)
    }
  }
  if (!hmac) return false

  const message = rest.sort().join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
  try {
    const a = Buffer.from(hmac, 'hex')
    const b = Buffer.from(digest, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Create a self-signed state token: `nonce.signature`
 * Verifiable without cookies or database — only we know the client secret.
 */
export function createSignedState(): string {
  const { clientSecret } = getOAuthConfig()
  if (!clientSecret) throw new Error('SHOPIFY_CLIENT_SECRET is not set')
  const nonce = crypto.randomBytes(16).toString('hex')
  const sig = crypto.createHmac('sha256', clientSecret).update(nonce).digest('hex')
  return `${nonce}.${sig}`
}

/** Verify a self-signed state token. */
export function verifySignedState(state: string): boolean {
  const { clientSecret } = getOAuthConfig()
  if (!clientSecret) return false
  const dot = state.indexOf('.')
  if (dot === -1) return false
  const nonce = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = crypto.createHmac('sha256', clientSecret).update(nonce).digest('hex')
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Exchange authorization code for access token. */
export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const { clientId, clientSecret } = getOAuthConfig()
  if (!clientId || !clientSecret) throw new Error('OAuth not configured')
  const url = `https://${shop}/admin/oauth/access_token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('No access_token in response')
  return data.access_token
}
