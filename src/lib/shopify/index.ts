// Barrel export – preserves `@/lib/shopify` import path for all consumers

// Types
export type { FlattenedOrderLine } from './types'

// Shared utilities (credentials, fetch helpers)
export { getShopifyCredentials } from './shared'

// Orders
export { flattenShopifyOrder, fetchShopifyOrders, fetchShopifyOrdersPaginated, getOrderByNameFromShopify } from './orders'

// Payouts
export { fetchShopifyPayouts, fetchShopifyPayoutTransactions, fetchShopifyPayoutTransactionsPage } from './payouts'

// Customers
export { fetchCustomerAddresses, saveCustomerAndAddresses } from './customers'
