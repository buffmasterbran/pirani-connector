import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import {
  isOAuthConfigured,
  verifyHmacFromUrl,
  verifySignedState,
  exchangeCodeForToken,
} from '@/lib/shopify-oauth'

export const dynamic = 'force-dynamic'

const DEFAULT_NETSUITE_FLAG = 'custitem_fa_shopify_flag01'
const DEFAULT_NETSUITE_PRICE_LEVEL = 1

/** GET /api/shopify/oauth/callback?code=...&shop=...&state=...&hmac=...&timestamp=... */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL('/?error=oauth_not_configured', request.url), 302)
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')
  const state = searchParams.get('state')
  const hmac = searchParams.get('hmac')
  const timestamp = searchParams.get('timestamp')

  if (!code || !shop || !state || !hmac || !timestamp) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url), 302)
  }

  if (!verifySignedState(state)) {
    console.error('State verification failed:', state)
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url), 302)
  }

  const rawQuery = new URL(request.url).search
  if (!verifyHmacFromUrl(rawQuery)) {
    console.error('HMAC verification failed. Raw query:', rawQuery)
    return NextResponse.redirect(new URL('/?error=invalid_hmac', request.url), 302)
  }

  const shopDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!shopDomain.endsWith('.myshopify.com')) {
    return NextResponse.redirect(new URL('/?error=invalid_shop', request.url), 302)
  }

  let accessToken: string
  try {
    accessToken = await exchangeCodeForToken(shopDomain, code)
  } catch (e) {
    console.error('OAuth token exchange failed:', e)
    return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url), 302)
  }

  const storeName = shopDomain.replace('.myshopify.com', '')

  try {
    await prisma.productSyncStoreConfig.upsert({
      where: { shopifyDomain: shopDomain },
      update: {
        shopifyAccessTokenEncrypted: encrypt(accessToken),
        storeName,
        updatedAt: new Date(),
      },
      create: {
        storeName,
        shopifyDomain: shopDomain,
        shopifyAccessTokenEncrypted: encrypt(accessToken),
        netsuiteFlagFieldId: DEFAULT_NETSUITE_FLAG,
        netsuitePriceLevelId: DEFAULT_NETSUITE_PRICE_LEVEL,
      },
    })
  } catch (e) {
    console.error('Failed to save store config:', e)
    return NextResponse.redirect(new URL('/?error=save_failed', request.url), 302)
  }

  return NextResponse.redirect(new URL('/?shopify_connected=1', request.url), 302)
}
