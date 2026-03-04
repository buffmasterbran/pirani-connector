import { executeSuiteQL } from './suiteql'
import { generateOAuthHeader } from './oauth'
import { buildRecordUrl } from './constants'
import { prisma } from '../prisma'
import type { NetSuiteCustomer } from './types'

/**
 * Extracts a numeric ID from strings like:
 *   "Online Sales (IID: 11)" → "11"
 *   "Direct to Consumer (28)" → "28"
 *   "11" → "11"
 * Returns just the numeric ID as a string, or the original value if no pattern matches
 */
function extractNetSuiteId(value: string): string {
  if (!value) return value
  // Pattern 1: "Something (IID: 123)" → "123"
  const iidMatch = value.match(/\(IID:\s*(\d+)\)/i)
  if (iidMatch) return iidMatch[1]
  // Pattern 2: "Something (123)" → "123" (Custom mapping format)
  const parenMatch = value.match(/\((\d+)\)\s*$/)
  if (parenMatch) return parenMatch[1]
  // Pattern 3: Already just a number
  if (/^\d+$/.test(value.trim())) return value.trim()
  return value
}

/**
 * Queries NetSuite SuiteQL API to find a customer by email
 */
export async function findNetSuiteCustomerByEmail(email: string): Promise<NetSuiteCustomer | null> {
  if (!email || !email.trim()) {
    return null
  }

  const escapedEmail = email.replace(/'/g, "''")
  const query = `SELECT id, email, custentity_customer_category FROM customer WHERE email = '${escapedEmail}'`

  try {
    const data = await executeSuiteQL<NetSuiteCustomer>(query)
    if (data.items && data.items.length > 0) {
      return data.items[0]
    }
    return null
  } catch (error) {
    console.error('Error querying NetSuite customer by email:', error)
    throw error
  }
}

/** Return type for createNetSuiteCustomer — includes the payload sent for debugging */
export interface CreateCustomerResult {
  customerId: string
  customerName?: string
  payloadSent: Record<string, any>
  mappingsApplied: Array<{ field: string; rawValue: string; finalValue: string; mappingType: string }>
}

/**
 * Creates a new customer in NetSuite via REST API
 * Applies CustomerFieldMappings from the database for dynamic field configuration
 */
export async function createNetSuiteCustomer(
  shopifyCustomerId: string,
  email: string | null,
  customerData?: { firstName?: string | null; lastName?: string | null; phone?: string | null }
): Promise<CreateCustomerResult> {
  const url = buildRecordUrl('customer')
  const authorization = generateOAuthHeader('POST', url)
  const mappingsApplied: CreateCustomerResult['mappingsApplied'] = []

  // Build base customer payload
  const payload: Record<string, any> = {
    externalId: `shopify_cust_${shopifyCustomerId}`,
    isPerson: true,
  }

  // Set name fields
  if (customerData?.firstName) {
    payload.firstName = customerData.firstName
  }
  if (customerData?.lastName) {
    payload.lastName = customerData.lastName
  }
  // If no first/last name, use email as company name
  if (!customerData?.firstName && !customerData?.lastName && email) {
    payload.isPerson = false
    payload.companyName = email
  }

  if (email) {
    payload.email = email
  }
  if (customerData?.phone) {
    payload.phone = customerData.phone
  }

  // Apply CustomerFieldMappings from database
  const customerFieldMappings = await prisma.customerFieldMapping.findMany({
    where: { isActive: true },
  })

  console.log(`📋 Found ${customerFieldMappings.length} active CustomerFieldMapping(s)`)

  for (const mapping of customerFieldMappings) {
    const value = getCustomerMappingValue(mapping, customerData, email, shopifyCustomerId)
    console.log(`   Mapping: ${mapping.mappingType} | shopifyValue="${mapping.shopifyValue}" | netsuiteId="${mapping.netsuiteId}" | customFieldId="${mapping.customFieldId}" → value="${value}"`)
    if (value === null) continue

    const fieldName = mapping.customFieldId || mapping.netsuiteId
    const finalValue = extractNetSuiteId(value)
    console.log(`   → field="${fieldName}" finalValue="${finalValue}"`)

    mappingsApplied.push({ field: fieldName, rawValue: value, finalValue, mappingType: mapping.mappingType })

    // Custom body fields and standard record-reference fields need { id: value }
    if (fieldName.startsWith('custentity_')) {
      payload[fieldName] = { id: finalValue }
    } else {
      // Standard fields that are record references
      const fieldsNeedingObjectFormat = ['subsidiary', 'category', 'salesRep', 'partner', 'territory', 'priceLevel', 'terms', 'currency']
      if (fieldsNeedingObjectFormat.includes(fieldName)) {
        payload[fieldName] = { id: finalValue }
      } else {
        payload[fieldName] = finalValue
      }
    }
  }

  console.log(`📤 Creating NetSuite customer for Shopify customer ${shopifyCustomerId}...`)
  console.log(`   Payload:`, JSON.stringify(payload, null, 2))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('NetSuite customer creation error:', {
      status: response.status,
      body: errorText,
    })
    throw new Error(`NetSuite API error ${response.status}: ${errorText}`)
  }

  // Extract customer ID from Location header
  const location = response.headers.get('Location')
  const responseText = await response.text()

  let customerId: string | undefined
  let customerName: string | undefined

  if (location) {
    const match = location.match(/\/customer\/(\d+)/)
    if (match) {
      customerId = match[1]
    }
  }

  if (responseText) {
    try {
      const responseData = JSON.parse(responseText)
      if (responseData.id) customerId = String(responseData.id)
      if (responseData.entityId) customerName = responseData.entityId
    } catch {
      // Response might not be JSON
    }
  }

  if (!customerId) {
    throw new Error('Customer created but could not extract ID from response')
  }

  console.log(`✅ Created NetSuite customer ${customerId} for Shopify customer ${shopifyCustomerId}`)
  return { customerId, customerName, payloadSent: payload, mappingsApplied }
}

/** Return type for resolveCustomer — includes tier info for debugging */
export interface ResolveCustomerResult {
  netsuiteCustomerId: string
  wasCreated: boolean
  tier: 1 | 2 | 3
  tierDescription: string
  /** Only present if tier 3 (customer was created) */
  createDetails?: {
    payloadSent: Record<string, any>
    mappingsApplied: CreateCustomerResult['mappingsApplied']
  }
}

/**
 * Three-tier customer resolution:
 *   Tier 1: Local DB lookup (netsuiteCustomerId already set)
 *   Tier 2: SuiteQL email lookup in NetSuite
 *   Tier 3: Create new customer in NetSuite via REST API
 *
 * Always returns a NetSuite customer ID or throws an error.
 */
export async function resolveCustomer(
  shopifyCustomerId: string,
  email: string | null,
  customerData?: { firstName?: string | null; lastName?: string | null; phone?: string | null }
): Promise<ResolveCustomerResult> {
  // Tier 1: Check local DB
  const existingCustomer = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
    select: { netsuiteCustomerId: true },
  })

  if (existingCustomer?.netsuiteCustomerId) {
    console.log(`🔍 Tier 1: Found NetSuite ID ${existingCustomer.netsuiteCustomerId} in local DB for Shopify customer ${shopifyCustomerId}`)
    return {
      netsuiteCustomerId: existingCustomer.netsuiteCustomerId,
      wasCreated: false,
      tier: 1,
      tierDescription: 'Found in local database',
    }
  }

  // Tier 2: SuiteQL email lookup
  if (email) {
    console.log(`🔍 Tier 2: Looking up customer by email ${email} in NetSuite...`)
    try {
      const netsuiteCustomer = await findNetSuiteCustomerByEmail(email)
      if (netsuiteCustomer) {
        console.log(`✅ Tier 2: Found NetSuite customer ${netsuiteCustomer.id} for email ${email}`)
        // Save to local DB for future lookups
        await prisma.customer.update({
          where: { shopifyCustomerId },
          data: { netsuiteCustomerId: netsuiteCustomer.id },
        })
        return {
          netsuiteCustomerId: netsuiteCustomer.id,
          wasCreated: false,
          tier: 2,
          tierDescription: 'Found via SuiteQL email lookup',
        }
      }
      console.log(`⚠️ Tier 2: No NetSuite customer found for email ${email}`)
    } catch (error) {
      console.warn(`⚠️ Tier 2: Error looking up customer by email:`, error)
      // Fall through to Tier 3
    }
  }

  // Tier 3: Create new customer in NetSuite
  console.log(`📝 Tier 3: Creating new NetSuite customer for Shopify customer ${shopifyCustomerId}...`)
  const result = await createNetSuiteCustomer(shopifyCustomerId, email, customerData)

  // Save to local DB
  await prisma.customer.update({
    where: { shopifyCustomerId },
    data: { netsuiteCustomerId: result.customerId },
  })

  return {
    netsuiteCustomerId: result.customerId,
    wasCreated: true,
    tier: 3,
    tierDescription: 'Created new customer in NetSuite',
    createDetails: {
      payloadSent: result.payloadSent,
      mappingsApplied: result.mappingsApplied,
    },
  }
}

/**
 * Gets the value for a CustomerFieldMapping based on its type
 */
function getCustomerMappingValue(
  mapping: { mappingType: string; shopifyCode: string | null; shopifyValue: string | null; netsuiteId: string },
  customerData: { firstName?: string | null; lastName?: string | null; phone?: string | null } | undefined,
  email: string | null,
  shopifyCustomerId: string
): string | null {
  switch (mapping.mappingType) {
    case 'Fixed':
      return mapping.shopifyValue || mapping.netsuiteId

    case 'Custom':
      return mapping.shopifyValue || null

    case 'Customer Field':
      if (!mapping.shopifyCode) return null
      // Map Shopify customer fields to values
      const fieldMap: Record<string, string | null | undefined> = {
        email: email,
        first_name: customerData?.firstName,
        last_name: customerData?.lastName,
        phone: customerData?.phone,
        customer_id: shopifyCustomerId,
      }
      const value = fieldMap[mapping.shopifyCode]
      return value != null ? String(value) : null

    default:
      return null
  }
}
