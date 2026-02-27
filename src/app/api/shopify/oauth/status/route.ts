import { NextResponse } from 'next/server'
import { isOAuthConfigured } from '@/lib/shopify-oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ configured: isOAuthConfigured() })
}
