// Constants & URL builders
export {
  NETSUITE_ACCOUNT_ID,
  NETSUITE_RESTLET_URL,
  NETSUITE_SCRIPT_ID,
  NETSUITE_DEPLOY_ID,
  NETSUITE_CONSUMER_KEY,
  NETSUITE_CONSUMER_SECRET,
  NETSUITE_TOKEN_ID,
  NETSUITE_TOKEN_SECRET,
  buildSuiteQLUrl,
  buildRestletUrl,
  buildRecordUrl,
  buildItemUrl,
} from './constants'

// OAuth
export { generateOAuthHeader } from './oauth'

// SuiteQL
export { executeSuiteQL, fetchNetSuiteList } from './suiteql'

// Transactions
export { fetchNetSuiteTransactions, matchNetSuiteTransactions } from './transactions'

// Customer
export { findNetSuiteCustomerByEmail, resolveCustomer, createNetSuiteCustomer } from './customer'
export type { ResolveCustomerResult, CreateCustomerResult } from './customer'

// Address
export { findNetSuiteAddressesByCustomerId, matchShopifyAddressToNetSuite } from './address'

// Sales Order
export {
  buildNetSuiteSalesOrderPayload,
  createNetSuiteSalesOrder,
} from './sales-order'
export type { NetSuiteSalesOrderPayload } from './sales-order'

// Types
export type {
  NetSuiteCashSale,
  NetSuiteRefund,
  NetSuitePayment,
  NetSuiteResponse,
  NetSuiteTransactionRequest,
  NetSuiteCustomer,
  NetSuiteAddress,
  NetSuiteInlineAddress,
  NetSuiteSuiteQLResponse,
} from './types'
