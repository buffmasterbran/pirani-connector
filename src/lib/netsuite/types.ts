export interface NetSuiteCashSale {
  id: number
  tranid: string
  otherrefnum: string
  entity: string
  amount: number
  type: string
}

export interface NetSuiteRefund {
  id: number
  tranid: string
  otherrefnum: string
  entity: string
  amount: number
  type: string
}

export interface NetSuitePayment {
  id: number
  tranid: string
  otherrefnum: string
  entity: string
  amount: number
  type: string
}

export interface NetSuiteResponse {
  status: string
  message: string
  details: {
    cashsales: NetSuiteCashSale[]
    refunds: NetSuiteRefund[]
    payments?: NetSuitePayment[]
    customerRefunds?: NetSuiteRefund[]
  }
}

export interface NetSuiteTransactionRequest {
  account: number
  memo: string
  date: string
  cashsales: string[]
  refunds: string[]
  payments?: string[]
  customerRefunds?: string[]
}

export interface NetSuiteCustomer {
  id: string
  email: string
  custentity_customer_category?: string
  [key: string]: any
}

export interface NetSuiteAddress {
  id: string
  entity: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  defaultbilling?: boolean
  defaultshipping?: boolean
  [key: string]: any
}

export interface NetSuiteSuiteQLResponse<T = any> {
  links: Array<{ rel: string; href: string }>
  count: number
  hasMore: boolean
  items: T[]
  offset: number
  totalResults: number
}

/**
 * Inline address on a NetSuite transaction (sales order, invoice, etc.)
 * These are transaction-level addresses that DON'T modify the customer's address book.
 */
export interface NetSuiteInlineAddress {
  addr1?: string | null
  addr2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null // ISO 2-letter code (e.g., "US") — NetSuite REST API accepts this
  addressee?: string | null // Full name of the addressee
  addrPhone?: string | null
  attention?: string | null
}
