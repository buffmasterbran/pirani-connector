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
  }
}

export interface NetSuiteTransactionRequest {
  account: number
  memo: string
  date: string
  cashsales: string[]
  refunds: string[]
  payments?: string[]
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
