import { NextRequest, NextResponse } from 'next/server'

const legacyMappings: Array<{
  id: string
  shopifyCode: string
  netsuiteId: string
  isActive: boolean
}> = []

export async function GET() {
  return NextResponse.json({ success: true, data: legacyMappings })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { shopifyCode, netsuiteId } = body

  if (!shopifyCode || !netsuiteId) {
    return NextResponse.json(
      { success: false, error: 'shopifyCode and netsuiteId are required' },
      { status: 400 },
    )
  }

  const mapping = {
    id: `${Date.now()}`,
    shopifyCode,
    netsuiteId,
    isActive: true,
  }

  legacyMappings.push(mapping)

  return NextResponse.json({ success: true, data: mapping })
}