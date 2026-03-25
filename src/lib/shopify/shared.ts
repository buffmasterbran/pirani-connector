import { prisma } from '../prisma'
import { decrypt } from '../encryption'

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'

/** Resolve Shopify credentials: first from a connected store (OAuth) in DB, then from env. */
export async function getShopifyCredentials(): Promise<{ baseUrl: string; accessToken: string } | null> {
  try {
    const store = await prisma.productSyncStoreConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { shopifyDomain: true, shopifyAccessTokenEncrypted: true, shopifyApiVersion: true },
    })
    if (store?.shopifyAccessTokenEncrypted) {
      const domain = store.shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
      const baseUrl = `https://${domain}/admin/api/${store.shopifyApiVersion || SHOPIFY_API_VERSION}`
      const accessToken = decrypt(store.shopifyAccessTokenEncrypted)
      return { baseUrl, accessToken }
    }
  } catch (e) {
    console.warn('getShopifyCredentials: could not load from DB', e)
  }
  const url = process.env.SHOPIFY_STORE_URL
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (url && token) {
    const baseUrl = `${url.replace(/\/$/, '')}/admin/api/${SHOPIFY_API_VERSION}`
    return { baseUrl, accessToken: token }
  }
  return null
}

export function buildHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Shopify-Access-Token': accessToken,
  }
}

export async function shopifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const creds = await getShopifyCredentials()
  if (!creds) throw new Error('Shopify credentials missing. Connect a store (OAuth) or set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.')
  const url = path.startsWith('http') ? path : `${creds.baseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(creds.accessToken), ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${message}`)
  }
  return res.json() as Promise<T>
}

export async function shopifyFetchWithHeaders<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const creds = await getShopifyCredentials()
  if (!creds) throw new Error('Shopify credentials missing. Connect a store (OAuth) or set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN.')
  const url = path.startsWith('http') ? path : `${creds.baseUrl}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(creds.accessToken), ...(init?.headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${message}`)
  }
  const data = (await res.json()) as T
  return { data, headers: res.headers }
}

export function parseFloatOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseDate(value: any): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function stringify(value: any): string | null {
  if (value === null || value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.warn('Failed to stringify value for storage', error)
    return null
  }
}
