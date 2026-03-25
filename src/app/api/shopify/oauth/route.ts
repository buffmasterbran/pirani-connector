import { NextRequest, NextResponse } from 'next/server'
import {
  isOAuthConfigured,
  normalizeShop,
  buildAuthorizeUrl,
  createSignedState,
} from '@/lib/shopify-oauth'

export const dynamic = 'force-dynamic'

/** GET /api/shopify/oauth?shop=pirani-life (or pirani-life.myshopify.com) → redirects to Shopify install. */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: 'OAuth not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.' },
      { status: 500 }
    )
  }

  const shop = request.nextUrl.searchParams.get('shop')
  if (!shop || !shop.trim()) {
    return NextResponse.json({ error: 'Missing shop parameter (e.g. ?shop=pirani-life)' }, { status: 400 })
  }

  const normalized = normalizeShop(shop)
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  const state = createSignedState()
  const appUrl = (process.env.APP_URL || request.nextUrl.origin).trim()
  const redirectUri = `${appUrl}/api/shopify/oauth/callback`
  const authorizeUrl = buildAuthorizeUrl(normalized, redirectUri, state)

  return NextResponse.redirect(authorizeUrl, 302)
}
