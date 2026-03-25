import prisma from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import type {
  ShopifyStore,
  ShopifyGraphQLResponse,
  ShopifyVariantMatch,
  ShopifyLocation,
  ShopifyInventoryLevel,
} from './types'

// ---------- Client setup ----------

export async function getShopifyStore(storeConfigId: string): Promise<ShopifyStore> {
  const config = await prisma.productSyncStoreConfig.findUniqueOrThrow({
    where: { id: storeConfigId },
  })
  return {
    id: config.id,
    name: config.storeName,
    domain: config.shopifyDomain,
    accessToken: decrypt(config.shopifyAccessTokenEncrypted),
    apiVersion: config.shopifyApiVersion,
  }
}

async function shopifyGraphQL<T = any>(
  store: ShopifyStore,
  query: string,
  variables?: Record<string, any>
): Promise<ShopifyGraphQLResponse<T>> {
  const url = `https://${store.domain}/admin/api/${store.apiVersion}/graphql.json`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': store.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shopify GraphQL error ${response.status}: ${text}`)
  }

  return response.json()
}

/**
 * Wraps shopifyGraphQL with rate-limit awareness.
 * Pauses when the throttle bucket gets low.
 */
export async function shopifyGraphQLThrottled<T = any>(
  store: ShopifyStore,
  query: string,
  variables?: Record<string, any>
): Promise<ShopifyGraphQLResponse<T>> {
  const result = await shopifyGraphQL<T>(store, query, variables)

  if (result.extensions?.cost?.throttleStatus) {
    const { currentlyAvailable, restoreRate } = result.extensions.cost.throttleStatus
    if (currentlyAvailable < 100) {
      const waitMs = Math.ceil((100 - currentlyAvailable) / restoreRate) * 1000
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  return result
}

// ---------- Queries ----------

const VARIANT_BY_SKU_QUERY = `
  query GetVariantBySKU($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          title
          price
          compareAtPrice
          inventoryItem {
            id
            tracked
            inventoryLevels(first: 20) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  location {
                    id
                    name
                  }
                }
              }
            }
          }
          product {
            id
            title
            handle
            status
          }
        }
      }
    }
  }
`

export async function findVariantBySku(
  store: ShopifyStore,
  sku: string
): Promise<ShopifyVariantMatch[]> {
  const result = await shopifyGraphQLThrottled<any>(store, VARIANT_BY_SKU_QUERY, {
    query: `sku:${sku}`,
  })

  if (result.errors?.length) {
    throw new Error(`Shopify query error: ${result.errors[0].message}`)
  }

  const edges = result.data?.productVariants?.edges || []
  return edges
    .filter((e: any) => e.node.sku === sku)
    .map((e: any) => {
      const v = e.node
      const levels: ShopifyInventoryLevel[] =
        v.inventoryItem?.inventoryLevels?.edges?.map((il: any) => ({
          locationId: il.node.location.id,
          locationName: il.node.location.name,
          available:
            il.node.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0,
        })) || []

      return {
        variantId: v.id,
        sku: v.sku,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        inventoryItemId: v.inventoryItem?.id || '',
        productId: v.product.id,
        productTitle: v.product.title,
        productHandle: v.product.handle,
        inventoryLevels: levels,
      } as ShopifyVariantMatch
    })
}

const LOCATIONS_QUERY = `
  query GetLocations {
    locations(first: 50) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }
`

export async function fetchShopifyLocations(
  store: ShopifyStore
): Promise<ShopifyLocation[]> {
  const result = await shopifyGraphQLThrottled<any>(store, LOCATIONS_QUERY)
  if (result.errors?.length) {
    throw new Error(`Shopify query error: ${result.errors[0].message}`)
  }
  return (result.data?.locations?.edges || []).map((e: any) => ({
    id: e.node.id,
    name: e.node.name,
    isActive: e.node.isActive,
  }))
}

// ---------- Mutations ----------

const UPDATE_VARIANT_PRICE_MUTATION = `
  mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
        price
        compareAtPrice
      }
      userErrors {
        field
        message
      }
    }
  }
`

export async function updateVariantPrices(
  store: ShopifyStore,
  productId: string,
  variants: Array<{
    id: string
    price: string
    compareAtPrice?: string | null
  }>
): Promise<{ success: boolean; errors: string[] }> {
  const result = await shopifyGraphQLThrottled<any>(
    store,
    UPDATE_VARIANT_PRICE_MUTATION,
    { productId, variants }
  )

  const userErrors = result.data?.productVariantsBulkUpdate?.userErrors || []
  if (userErrors.length > 0) {
    return {
      success: false,
      errors: userErrors.map((e: any) => `${e.field}: ${e.message}`),
    }
  }

  if (result.errors?.length) {
    return {
      success: false,
      errors: result.errors.map((e) => e.message),
    }
  }

  return { success: true, errors: [] }
}

const SET_INVENTORY_MUTATION = `
  mutation SetInventory($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        createdAt
        reason
      }
      userErrors {
        field
        message
      }
    }
  }
`

export async function setInventoryQuantities(
  store: ShopifyStore,
  quantities: Array<{
    inventoryItemId: string
    locationId: string
    quantity: number
  }>
): Promise<{ success: boolean; errors: string[] }> {
  if (quantities.length === 0) return { success: true, errors: [] }

  const allErrors: string[] = []

  // Batch into groups of 100 (Shopify limit)
  for (let i = 0; i < quantities.length; i += 100) {
    const batch = quantities.slice(i, i + 100)
    const result = await shopifyGraphQLThrottled<any>(store, SET_INVENTORY_MUTATION, {
      input: {
        reason: 'correction',
        name: 'available',
        ignoreCompareQuantity: true,
        quantities: batch,
      },
    })

    const userErrors = result.data?.inventorySetQuantities?.userErrors || []
    if (userErrors.length > 0) {
      allErrors.push(...userErrors.map((e: any) => `${e.field}: ${e.message}`))
    }
    if (result.errors?.length) {
      allErrors.push(...result.errors.map((e) => e.message))
    }
  }

  return { success: allErrors.length === 0, errors: allErrors }
}

// ---------- Product Update (Full Product Sync fields) ----------

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`

export async function updateProductFields(
  store: ShopifyStore,
  productId: string,
  fields: Record<string, string | boolean | number | null>
): Promise<{ success: boolean; errors: string[] }> {
  const input: Record<string, unknown> = { id: productId }

  if (fields.title != null) input.title = String(fields.title)
  if (fields.body_html != null) input.descriptionHtml = String(fields.body_html)
  if (fields.vendor != null) input.vendor = String(fields.vendor)
  if (fields.product_type != null) input.productType = String(fields.product_type)
  if (fields.tags != null) {
    input.tags = String(fields.tags).split(',').map((t: string) => t.trim())
  }
  if (fields.handle != null) input.handle = String(fields.handle)
  if (fields.published != null) {
    input.status = fields.published === 'T' || fields.published === true ? 'ACTIVE' : 'DRAFT'
  }

  if (Object.keys(input).length <= 1) {
    return { success: true, errors: [] }
  }

  const result = await shopifyGraphQLThrottled<any>(store, PRODUCT_UPDATE_MUTATION, { input })

  const userErrors = result.data?.productUpdate?.userErrors || []
  if (userErrors.length > 0) {
    return {
      success: false,
      errors: userErrors.map((e: any) => `${e.field}: ${e.message}`),
    }
  }

  if (result.errors?.length) {
    return {
      success: false,
      errors: result.errors.map((e) => e.message),
    }
  }

  return { success: true, errors: [] }
}

/**
 * Simple connection test -- fetches the shop name.
 */
export async function testConnection(
  store: ShopifyStore
): Promise<{ connected: boolean; shopName?: string; error?: string }> {
  try {
    const result = await shopifyGraphQL<any>(store, `{ shop { name } }`)
    if (result.errors?.length) {
      return { connected: false, error: result.errors[0].message }
    }
    return { connected: true, shopName: result.data?.shop?.name }
  } catch (err: any) {
    return { connected: false, error: err.message }
  }
}
