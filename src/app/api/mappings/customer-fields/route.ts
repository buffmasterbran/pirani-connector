import { NextRequest, NextResponse } from 'next/server'

const legacyCustomerMappings: Array<{
  id: string
  mappingType: string
  shopifyCode?: string
  shopifyValue?: string
  netsuiteId: string
  applyToAllAccounts: boolean
  isActive: boolean
  customFieldId?: string | null
}> = []

export async function GET() {
  return NextResponse.json({ success: true, data: legacyCustomerMappings })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const {
    mappingType = 'Fixed',
    shopifyCode,
    shopifyValue,
    netsuiteId,
    applyToAllAccounts = false,
    isActive = true,
    customFieldId,
  } = body

  if (!netsuiteId || (!shopifyCode && !shopifyValue)) {
    return NextResponse.json(
      { success: false, error: 'netsuiteId and either shopifyCode or shopifyValue are required' },
      { status: 400 },
    )
  }

  const mapping = {
    id: `${Date.now()}`,
    mappingType,
    shopifyCode,
    shopifyValue,
    netsuiteId,
    applyToAllAccounts,
    isActive,
    customFieldId,
  }

  legacyCustomerMappings.push(mapping)

  return NextResponse.json({ success: true, data: mapping })
}