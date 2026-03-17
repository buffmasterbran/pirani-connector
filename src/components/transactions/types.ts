export interface Transaction {
  id: string
  source_order_id: string
  order_name?: string | null
  source_name?: string | null
  app_id?: number | null
  is_web_order?: boolean
  order_edited?: boolean
  amount: number
  fee: number
  net: number
  type: string
  currency: string
  processedAt: string | null
  netsuiteTransactionId?: string | null
  netsuiteTransactionName?: string | null
  netsuiteTransactionType?: string | null
  netsuiteAmount?: number | null
  amountMismatch?: boolean
  includeInNetSuite?: boolean
  adjustmentReason?: string | null
  otherFeesDescription?: string | null
  amountDescription?: string | null
  feeDescription?: string | null
  parentTransactionId?: string | null
  children?: Array<{
    id: string
    netsuiteTransactionId: string | null
    netsuiteTransactionName: string | null
    netsuiteAmount: number | null
    amount: number
    amountDescription?: string | null
  }>
}

export interface OrderSourceMapping {
  id: number
  appId: number | null
  sourceName: string | null
  friendlyName: string
  isActive: boolean
  isTaxable?: boolean
}

export interface DisplayTransaction extends Transaction {
  isGrouped?: boolean
  groupSize?: number
  groupIndex?: number
}

export interface FeesDescriptionOption {
  id: number
  netsuiteId: string
  description: string | null
}

export interface TransactionsTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  hasActiveFilters?: boolean
  hideSensitiveData?: boolean
  orderSourceMappings?: OrderSourceMapping[]
  onDeleteNetSuiteId?: (transactionId: string) => void
  onReassignNetSuite?: (fromTransactionId: string, toTransactionId: string) => Promise<void>
  onAddNetSuite?: (transactionId: string) => void
  onUpdateOtherFeesDescription?: (transactionId: string, description: string | null) => Promise<void>
  onUpdateAmountDescription?: (transactionId: string, description: string | null) => Promise<void>
  onUpdateFeeDescription?: (transactionId: string, description: string | null) => Promise<void>
  onToggleInclude?: (transactionId: string, include: boolean) => Promise<void>
  onMergeTransactions?: (sourceTransactionIds: string[], targetTransactionId: string) => Promise<void>
  onSplitTransaction?: (transaction: Transaction) => void
  onProcessMarketplaceOrder?: (transaction: Transaction) => void
  showHelpers?: boolean
  hintConfigs?: Map<string, TransactionHintConfig>
}

export interface TransactionHintConfig {
  code: string
  message: string
  icon: string
  bgColor: string
  textColor: string
  isActive: boolean
}
