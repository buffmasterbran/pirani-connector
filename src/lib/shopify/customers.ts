import { prisma } from '../prisma'
import { findNetSuiteCustomerByEmail, findNetSuiteAddressesByCustomerId, matchShopifyAddressToNetSuite } from '../netsuite'
import { getShopifyCredentials, buildHeaders, parseFloatOrNull, parseDate, stringify } from './shared'

/**
 * Fetches all saved addresses for a customer from Shopify
 */
export async function fetchCustomerAddresses(customerId: string): Promise<any[]> {
  const creds = await getShopifyCredentials()
  if (!creds) {
    console.warn('Shopify credentials not configured, skipping address fetch')
    return []
  }
  try {
    const response = await fetch(`${creds.baseUrl}/customers/${customerId}/addresses.json`, {
      headers: buildHeaders(creds.accessToken),
      cache: 'no-store',
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Customer ${customerId} not found or has no addresses`)
        return []
      }
      const errorText = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return data.addresses || []
  } catch (error) {
    console.error(`Error fetching addresses for customer ${customerId}:`, error)
    throw error
  }
}

/**
 * Saves customer and address data from a Shopify order to the database
 */
export async function saveCustomerAndAddresses(order: any): Promise<void> {
  const customer = order.customer
  if (!customer || !customer.id) {
    console.log(`Order ${order.id} has no customer data, skipping customer save`)
    return // No customer data to save
  }

  console.log(`Processing customer ${customer.id} (email: ${customer.email || 'none'}) for order ${order.id}`)

  const shopifyCustomerId = String(customer.id)

  // Step 1: Check if customer already exists in DB and has NetSuite ID
  const existingCustomer = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
    select: { netsuiteCustomerId: true },
  })

  let netsuiteCustomerId: string | null = existingCustomer?.netsuiteCustomerId ?? null

  // Step 1: Handle Customer Lookup - Only lookup if customer doesn't have NetSuite ID yet
  if (!netsuiteCustomerId && customer.email) {
    console.log(`Customer ${shopifyCustomerId} has no NetSuite ID. Looking up by email: ${customer.email}`)
    try {
      const netsuiteCustomer = await findNetSuiteCustomerByEmail(customer.email)
      if (netsuiteCustomer) {
        netsuiteCustomerId = netsuiteCustomer.id
        console.log(`Found NetSuite customer ID: ${netsuiteCustomerId} for email: ${customer.email}`)
      } else {
        console.log(`No NetSuite customer found for email: ${customer.email}. Will proceed to Step 2: Customer Creation.`)
      }
    } catch (error) {
      console.warn(`Could not look up NetSuite customer for ${customer.email}:`, error)
      // Continue without NetSuite ID - Step 2 will handle customer creation
    }
  } else if (netsuiteCustomerId) {
    console.log(`Customer ${shopifyCustomerId} already has NetSuite ID: ${netsuiteCustomerId}`)
  }

  // Prepare customer data
  const customerData = {
    shopifyCustomerId,
    adminGraphqlApiId: customer.admin_graphql_api_id ?? null,
    createdAt: parseDate(customer.created_at) ?? new Date(),
    updatedAt: parseDate(customer.updated_at),
    firstName: customer.first_name ?? null,
    lastName: customer.last_name ?? null,
    state: customer.state ?? null,
    note: customer.note ?? null,
    verifiedEmail: customer.verified_email ?? false,
    multipassIdentifier: customer.multipass_identifier ?? null,
    taxExempt: customer.tax_exempt ?? false,
    emailMarketingConsent: stringify(customer.email_marketing_consent ?? null),
    smsMarketingConsent: stringify(customer.sms_marketing_consent ?? null),
    tags: customer.tags ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    currency: customer.currency ?? null,
    taxExemptions: stringify(customer.tax_exemptions ?? []),
    netsuiteCustomerId,
  }

  // Upsert customer (with retry on unique constraint race condition)
  try {
    await prisma.customer.upsert({
      where: { shopifyCustomerId },
      create: customerData,
      update: customerData,
    })
  } catch (error: any) {
    // Handle race condition: if upsert fails with unique constraint on id,
    // the record was likely created by a concurrent request — just update it
    if (error?.code === 'P2002') {
      console.log(`Customer ${shopifyCustomerId} upsert hit unique constraint, retrying as update...`)
      await prisma.customer.update({
        where: { shopifyCustomerId },
        data: customerData,
      })
    } else {
      throw error
    }
  }

  // Step 1: Fetch all saved customer addresses from Shopify
  let savedAddresses: any[] = []
  try {
    console.log(`Fetching saved addresses for customer ${shopifyCustomerId} from Shopify...`)
    savedAddresses = await fetchCustomerAddresses(shopifyCustomerId)
    console.log(`Fetched ${savedAddresses.length} saved addresses for customer ${shopifyCustomerId}`)
  } catch (error) {
    console.warn(`Could not fetch customer addresses for ${shopifyCustomerId}:`, error)
    // Continue with order addresses even if fetch fails
  }

  // Prepare addresses to save: saved addresses + billing + shipping + default
  const addressesToSave: Array<{ address: any; type: string }> = []

  // Add all saved addresses from Shopify
  for (const savedAddress of savedAddresses) {
    addressesToSave.push({ address: savedAddress, type: 'saved' })
  }

  // Add billing address from order
  if (order.billing_address) {
    console.log(`   Found billing_address for order ${order.id}:`, {
      address1: order.billing_address.address1,
      city: order.billing_address.city,
      zip: order.billing_address.zip,
      hasAllFields: !!(order.billing_address.address1 && order.billing_address.city)
    })
    addressesToSave.push({ address: order.billing_address, type: 'billing' })
  } else {
    console.log(`   Order ${order.id} has no billing_address`)
    console.log(`   Order keys:`, Object.keys(order))
  }

  // Add shipping address from order
  if (order.shipping_address) {
    console.log(`   Found shipping_address for order ${order.id}:`, {
      address1: order.shipping_address.address1,
      city: order.shipping_address.city,
      zip: order.shipping_address.zip,
      hasAllFields: !!(order.shipping_address.address1 && order.shipping_address.city)
    })
    addressesToSave.push({ address: order.shipping_address, type: 'shipping' })
  } else {
    console.log(`   Order ${order.id} has no shipping_address`)
  }

  // Add default address (if not already in saved addresses)
  if (customer.default_address) {
    const isAlreadySaved = savedAddresses.some(
      (addr) => addr.id && addr.id === customer.default_address.id
    )
    if (!isAlreadySaved) {
      addressesToSave.push({ address: customer.default_address, type: 'default' })
      console.log(`   Added default address for customer ${shopifyCustomerId}`)
    }
  }

  console.log(`   Total addresses to save: ${addressesToSave.length}`)

  // Get the customer record ID for foreign key
  const customerRecord = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
  })

  if (!customerRecord) {
    console.warn(`Customer record not found after creation for ${shopifyCustomerId}`)
    return
  }

  // Step 2: If customer has NetSuite ID, fetch NetSuite addresses for matching
  let netsuiteAddresses: any[] = []
  if (netsuiteCustomerId) {
    try {
      console.log(`\n   Customer has NetSuite ID ${netsuiteCustomerId}. Fetching NetSuite addresses for matching...`)
      netsuiteAddresses = await findNetSuiteAddressesByCustomerId(netsuiteCustomerId)
      console.log(`   Found ${netsuiteAddresses.length} NetSuite address(es) for customer ${netsuiteCustomerId}`)
    } catch (error) {
      console.warn(`   Could not fetch NetSuite addresses for customer ${netsuiteCustomerId}:`, error)
      // Continue without NetSuite address matching - addresses will be saved without IDs
    }
  } else {
    console.log(`   Customer has no NetSuite ID. Addresses will be saved without NetSuite address IDs.`)
  }

  // Save each address
  console.log(`\n   Saving ${addressesToSave.length} address(es)...`)
  let savedCount = 0
  let skippedCount = 0
  let errorCount = 0
  let matchedCount = 0

  for (const { address, type } of addressesToSave) {
    try {
      if (!address) {
        console.log(`   Skipping null address for type '${type}'`)
        skippedCount++
        continue
      }

      // Map address type to boolean flags
      const isSavedAddress = type === 'saved'
      const isDefaultBilling = type === 'billing' || type === 'default'
      const isDefaultShipping = type === 'shipping' || type === 'default'

      // Try to match this address to a NetSuite address if we have NetSuite addresses
      let netsuiteAddressId: string | null = null
      if (netsuiteAddresses.length > 0) {
        const matchedId = matchShopifyAddressToNetSuite(
          {
            address1: address.address1,
            city: address.city,
            zip: address.zip,
            province: address.province,
            country: address.country,
          },
          netsuiteAddresses
        )
        if (matchedId) {
          netsuiteAddressId = matchedId
          matchedCount++
          console.log(`   Matched address (type: ${type}) to NetSuite address ID: ${matchedId}`)
        }
      }

    const addressData = {
      customerId: customerRecord.id,
      shopifyAddressId: address.id ? String(address.id) : null,
        isSavedAddress,
        isDefaultBilling,
        isDefaultShipping,
      firstName: address.first_name ?? null,
      lastName: address.last_name ?? null,
      company: address.company ?? null,
      address1: address.address1 ?? null,
      address2: address.address2 ?? null,
      city: address.city ?? null,
      zip: address.zip ?? null,
      province: address.province ?? null,
      country: address.country ?? null,
      provinceCode: address.province_code ?? null,
      countryCode: address.country_code ?? null,
      countryName: address.country_name ?? null,
      phone: address.phone ?? null,
      name: address.name ?? null,
      latitude: parseFloatOrNull(address.latitude),
      longitude: parseFloatOrNull(address.longitude),
      isDefault: address.default ?? type === 'default',
        netsuiteAddressId, // Will be null if no match found, or the matched NetSuite address ID
    }

      // Skip addresses that are completely empty (no address1 and no city)
      if (!addressData.address1 && !addressData.city) {
        console.log(`   Skipping address with type '${type}' - missing address1 and city`)
        skippedCount++
        continue
      }

      // Improved deduplication logic:
      // 1. For saved addresses with shopifyAddressId, match by that first (most reliable)
      // 2. Then check for any existing address with same physical location (address1, city, zip)
      // 3. This prevents duplicate physical addresses while merging address type flags

      let existingAddress = null

      // First, try to match saved addresses by shopifyAddressId
      if (addressData.shopifyAddressId && type === 'saved') {
        existingAddress = await prisma.customerAddress.findFirst({
      where: {
        customerId: customerRecord.id,
            shopifyAddressId: addressData.shopifyAddressId,
          },
        })
      }

      // If no match by shopifyAddressId, check for physical address match
      // Only check if we have the required fields (at least address1 and city)
      if (!existingAddress && addressData.address1 && addressData.city) {
        const whereClause: any = {
          customerId: customerRecord.id,
              address1: addressData.address1,
              city: addressData.city,
        }
        // Add zip to match if available
        if (addressData.zip) {
          whereClause.zip = addressData.zip
        }

        existingAddress = await prisma.customerAddress.findFirst({
          where: whereClause,
    })
      }

    if (existingAddress) {
        // Update existing address, merging boolean flags (OR them together)
        const updateData = {
          ...addressData,
          // Merge flags: if existing address has a flag set, keep it; otherwise use new value
          isSavedAddress: existingAddress.isSavedAddress || addressData.isSavedAddress,
          isDefaultBilling: existingAddress.isDefaultBilling || addressData.isDefaultBilling,
          isDefaultShipping: existingAddress.isDefaultShipping || addressData.isDefaultShipping,
        }

        // Preserve shopifyAddressId if it already exists and new one is null
        if (existingAddress.shopifyAddressId && !updateData.shopifyAddressId) {
          updateData.shopifyAddressId = existingAddress.shopifyAddressId
        }

        // Preserve netsuiteAddressId if it exists
        if (existingAddress.netsuiteAddressId && !updateData.netsuiteAddressId) {
          updateData.netsuiteAddressId = existingAddress.netsuiteAddressId
        }

      await prisma.customerAddress.update({
        where: { id: existingAddress.id },
          data: updateData,
      })
        console.log(`   Updated existing address ID ${existingAddress.id} (type: ${type})`)
        savedCount++
    } else {
        console.log(`   Creating new address (type: ${type}, address1: ${addressData.address1}, city: ${addressData.city})`)
        const created = await prisma.customerAddress.create({
        data: addressData,
      })
        console.log(`   Created new address ID ${created.id} (type: ${type}, address: ${addressData.address1 || 'N/A'}, ${addressData.city || 'N/A'})`)
        savedCount++
      }
    } catch (error) {
      errorCount++
      console.error(`   Error saving address (type: ${type}):`, error)
      if (error instanceof Error) {
        console.error(`   Error message: ${error.message}`)
        console.error(`   Error stack: ${error.stack}`)
      }
      // Continue with next address even if one fails
    }
  }

  console.log(`\n   Address save summary: ${savedCount} saved, ${skippedCount} skipped, ${errorCount} errors, ${matchedCount} matched to NetSuite out of ${addressesToSave.length} total`)

  if (errorCount > 0) {
    console.error(`\n   WARNING: ${errorCount} address(es) failed to save! Check errors above.`)
  }

  if (netsuiteCustomerId && matchedCount < addressesToSave.length - skippedCount) {
    console.log(`   Note: ${addressesToSave.length - skippedCount - matchedCount} address(es) were saved without NetSuite IDs. They may need to be created in NetSuite.`)
  }
}
