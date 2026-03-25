import type {
  ProductSyncStoreConfig,
  ProductSyncMapping,
  ProductSyncLog,
  ProductSyncJob,
  ProductSyncLocationMapping,
  ProductSyncMatchStatus,
  ProductSyncStatus,
} from '@prisma/client'

// Re-export Prisma types for convenience
export type {
  ProductSyncStoreConfig,
  ProductSyncMapping,
  ProductSyncLog,
  ProductSyncJob,
  ProductSyncLocationMapping,
}

// ---------- NetSuite types ----------

export interface NetSuiteItem {
  netsuite_id: number
  sku: string
  name: string | null
  item_type: string | null
  color: string | null
  size: string | null
  lastmodifieddate: string | null
  flag_value: string | null
}

export interface NetSuitePrice {
  netsuite_id: number
  price_level: number
  price: number
}

export interface NetSuiteInventory {
  netsuite_id: number
  location_id: number
  location_name: string | null
  quantity_available: number
  quantity_on_hand: number
  quantity_committed: number
  last_qty_change: string | null
}

export interface NetSuiteLocation {
  id: number
  name: string
}

export interface NetSuitePriceLevel {
  id: number
  name: string
}

// ---------- Shopify types ----------

export interface ShopifyStore {
  id: string
  name: string
  domain: string
  accessToken: string
  apiVersion: string
}

export interface ShopifyVariantMatch {
  variantId: string
  sku: string
  title: string
  price: string
  compareAtPrice: string | null
  inventoryItemId: string
  productId: string
  productTitle: string
  productHandle: string
  inventoryLevels: ShopifyInventoryLevel[]
}

export interface ShopifyInventoryLevel {
  locationId: string
  locationName: string
  available: number
}

export interface ShopifyLocation {
  id: string
  name: string
  isActive: boolean
}

export interface ShopifyGraphQLResponse<T = any> {
  data?: T
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>
  extensions?: {
    cost: {
      requestedQueryCost: number
      actualQueryCost: number
      throttleStatus: {
        maximumAvailable: number
        currentlyAvailable: number
        restoreRate: number
      }
    }
  }
}

// ---------- Sync types ----------

export interface SyncResult {
  logId: string
  status: 'completed' | 'completed_with_errors' | 'failed'
  itemsProcessed: number
  itemsUpdated: number
  itemsSkipped: number
  itemsErrored: number
  priceUpdates: number
  quantityUpdates: number
  durationMs: number
  errors: SyncItemError[]
}

export interface SyncItemError {
  sku: string
  error: string
  timestamp: string
}

export interface PriceComparison {
  netsuiteSku: string
  netsuitePrice: number
  netsuiteComparePrice: number | null
  shopifyPrice: number
  shopifyComparePrice: number | null
  priceMatch: boolean
  comparePriceMatch: boolean
}

export interface QuantityComparison {
  netsuiteSku: string
  netsuiteQty: number
  shopifyQty: number
  match: boolean
  shopifyLocationId: string
}

// ---------- API / DTO types ----------

export interface StoreConfigDTO {
  id: string
  storeName: string
  storeLabel: string | null
  shopifyDomain: string
  shopifyApiVersion: string
  netsuiteFlagFieldId: string
  netsuitePriceLevelId: number
  netsuiteComparePriceLevelId: number | null
  syncEnabled: boolean
  syncIntervalMinutes: number
  lowStockThreshold: number
  lowStockIntervalMinutes: number
  includeNonInventory: boolean
  isActive: boolean
  connectionStatus?: 'connected' | 'error' | 'unknown'
  createdAt: string
  updatedAt: string
}

export interface ProductRowDTO {
  id: string
  storeConfigId: string
  netsuiteSku: string
  netsuiteName: string | null
  netsuiteColor: string | null
  netsuiteSize: string | null
  netsuiteItemType: string | null
  netsuiteItemId: number
  shopifyProductId: string | null
  shopifyVariantId: string | null
  shopifyProductTitle: string | null
  matchStatus: ProductSyncMatchStatus
  lastSyncStatus: ProductSyncStatus
  lastSyncAt: string | null
  lastSyncError: string | null
  netsuiteFlagValue: string | null
  netsuitePrice: number | null
  netsuiteComparePrice: number | null
  netsuiteQty: number | null
  shopifyPrice: number | null
  shopifyComparePrice: number | null
  shopifyQty: number | null
  priceMatch: boolean | null
  qtyMatch: boolean | null
}

export interface ProductsSummary {
  total: number
  matched: number
  unmatched: number
  multipleMatches: number
  priceOutOfSync: number
  qtyOutOfSync: number
  errors: number
  lastFullSync: string | null
  nextSync: string | null
}

export interface ProductsResponse {
  items: ProductRowDTO[]
  total: number
  page: number
  pageSize: number
  summary: ProductsSummary
}
