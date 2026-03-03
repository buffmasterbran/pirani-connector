import { executeSuiteQL } from './suiteql'
import type { NetSuiteAddress } from './types'

/**
 * Queries NetSuite SuiteQL API to find addresses for a customer by NetSuite customer ID
 */
export async function findNetSuiteAddressesByCustomerId(netsuiteCustomerId: string): Promise<NetSuiteAddress[]> {
  if (!netsuiteCustomerId || !netsuiteCustomerId.trim()) {
    return []
  }

  const escapedCustomerId = netsuiteCustomerId.replace(/'/g, "''")
  const query = `SELECT eab.addressbookaddress AS id, eab.entity, ea.addr1 AS address1, ea.addr2 AS address2, ea.city, ea.state, ea.zip, ea.country, eab.defaultbilling, eab.defaultshipping FROM entityaddressbook eab JOIN entityaddress ea ON ea.nkey = eab.addressbookaddress WHERE eab.entity = '${escapedCustomerId}'`

  try {
    const data = await executeSuiteQL<NetSuiteAddress>(query)
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
 * Matches a Shopify address to a NetSuite address by comparing address fields
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
    return null
  }

  const normalize = (str: string | null | undefined): string => {
    if (!str) return ''
    return str.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  const shopifyAddress1 = normalize(shopifyAddress.address1)
  const shopifyCity = normalize(shopifyAddress.city)
  const shopifyZip = normalize(shopifyAddress.zip)

  for (const nsAddress of netsuiteAddresses) {
    const nsAddress1 = normalize(nsAddress.address1)
    const nsCity = normalize(nsAddress.city)
    const nsZip = normalize(nsAddress.zip)

    if (shopifyAddress1 && shopifyCity && shopifyZip) {
      if (shopifyAddress1 === nsAddress1 && shopifyCity === nsCity && shopifyZip === nsZip) {
        return nsAddress.id
      }
    }

    if (shopifyAddress1 && shopifyCity && !shopifyZip) {
      if (shopifyAddress1 === nsAddress1 && shopifyCity === nsCity) {
        return nsAddress.id
      }
    }

    if (shopifyCity && shopifyZip && !shopifyAddress1) {
      if (shopifyCity === nsCity && shopifyZip === nsZip) {
        return nsAddress.id
      }
    }

    if (shopifyAddress1 && !shopifyCity && !shopifyZip) {
      if (shopifyAddress1 === nsAddress1) {
        return nsAddress.id
      }
    }
  }

  return null
}
