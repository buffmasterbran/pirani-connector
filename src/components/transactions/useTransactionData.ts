import { useState, useEffect, useMemo, useRef } from "react"
import { hasDropdownAssignment } from "./types"

export interface TransactionItem {
  id: string
  source_order_id: string
  order_name?: string | null
  source_name?: string | null
  app_id?: number | null
  is_web_order?: boolean | null
  order_edited?: boolean
  amount: string | number
  fee: string | number
  net: string | number
  type: string
  currency: string
  processedAt: string | null
  netsuiteTransactionId?: string | null
  netsuiteTransactionName?: string | null
  netsuiteAmount?: number | null
  amountMismatch?: boolean
  includeInNetSuite?: boolean
  adjustmentReason?: string | null
  amountDescription?: string | null
  parentTransactionId?: string | null
  children?: Array<{
    id: string
    netsuiteTransactionId: string | null
    netsuiteTransactionName: string | null
    netsuiteAmount: number | null
    amount: number
  }>
}

export interface GroupedFeeItem {
  description: string
  shopifyAmount: number
  netsuiteAmount: number
}

export interface FilterCounts {
  webOrdersCount: number
  nonWebOrdersCount: number
  problematicOrdersCount: number
  problematicWebOrdersCount: number
  problematicNonWebOrdersCount: number
}

export interface UseTransactionDataProps {
  transactions: TransactionItem[]
  payoutTotalAmount?: number | null
  payoutCurrency?: string
  isOpen: boolean
}

export function useTransactionData({
  transactions,
  payoutTotalAmount,
  payoutCurrency = 'USD',
  isOpen,
}: UseTransactionDataProps) {
  // Local state for optimistic updates - syncs with transactions prop but can be updated immediately
  const [localTransactions, setLocalTransactions] = useState(transactions)

  // Sync local transactions with prop when transactions change
  useEffect(() => {
    setLocalTransactions(transactions)
  }, [transactions])

  // Use ref to track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Calculate grouped fee items (Shopify Fees, Shop Ads, etc.)
  const [groupedFeeItems, setGroupedFeeItems] = useState<GroupedFeeItem[]>([])

  // Fetch order source mappings when dialog opens
  const [orderSourceMappings, setOrderSourceMappings] = useState<Array<{
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isActive: boolean
  }>>([])

  useEffect(() => {
    if (isOpen) {
      const fetchMappings = async () => {
        try {
          const response = await fetch('/api/mappings/order-source-mappings')
          const result = await response.json()
          if (result.success && result.data) {
            setOrderSourceMappings(result.data)
          }
        } catch (error) {
          console.error('Error fetching order source mappings:', error)
        }
      }
      fetchMappings()
    }
  }, [isOpen])

  // Helper function to check if a transaction is problematic (used for filtering)
  const isProblematicTransaction = (t: TransactionItem): boolean => {
    // If transaction is resolved (ignored or has dropdown selection), it's not problematic
    const isResolved = t.includeInNetSuite === false ||
                      hasDropdownAssignment(t)
    if (isResolved) return false

    // Missing NetSuite ID
    if (!t.netsuiteTransactionId) return true

    // Check for actual amount mismatch (recalculate for payments to use net amount)
    if (t.amountMismatch === true) {
      // For payments, recalculate mismatch using net amount instead of amount
      const netsuiteNameUpper = (t.netsuiteTransactionName || '').toUpperCase().trim()
      const isPayment = netsuiteNameUpper.startsWith('PYMT') ||
                       netsuiteNameUpper.startsWith('CUSTPYMT') ||
                       netsuiteNameUpper.includes('PAYMENT')

      if (isPayment && t.netsuiteAmount !== null && t.netsuiteAmount !== undefined) {
        // For payments, compare net amount with NetSuite amount
        const shopifyNet = typeof t.net === 'string' ? parseFloat(t.net) : (t.net || 0)
        const netsuiteAmount = typeof t.netsuiteAmount === 'string' ? parseFloat(t.netsuiteAmount as unknown as string) : t.netsuiteAmount
        const amountDiff = Math.abs(Math.abs(shopifyNet) - Math.abs(netsuiteAmount)) > 0.01
        const signMismatch = shopifyNet !== 0 && netsuiteAmount !== 0 &&
          ((shopifyNet > 0) !== (netsuiteAmount > 0))
        // If amounts actually match and signs agree, don't treat as problematic
        if (!amountDiff && !signMismatch) return false
      }
      // For non-payments or actual mismatches, treat as problematic
      return true
    }

    // Has order_name but missing NetSuite transaction name
    const hasOrderName = t.order_name && t.order_name !== '—' && t.order_name !== 'N/A'
    if (hasOrderName && !t.netsuiteTransactionName) return true

    // Has order_name but NetSuite transaction is not a cash sale/refund/payment
    if (hasOrderName && t.netsuiteTransactionName) {
      const name = t.netsuiteTransactionName.toUpperCase()
      const isCashSaleOrRefundOrPayment = name.startsWith('CS') ||
                                         name.startsWith('RFND') ||
                                         name.startsWith('PYMT') ||
                                         name.startsWith('CUSTPYMT') ||
                                         name.includes('CASH SALE') ||
                                         name.includes('CASH REFUND') ||
                                         name.includes('PAYMENT')
      if (!isCashSaleOrRefundOrPayment) return true
    }

    return false
  }

  // Helper function to check if transaction is cash sale, cash refund, or payment
  const isCashSaleOrRefund = (transaction: TransactionItem): boolean => {
    if (!transaction.netsuiteTransactionName) return false
    const name = transaction.netsuiteTransactionName.toUpperCase()
    // Check for NetSuite transaction name patterns: CS (Cash Sale), RFND (Cash Refund), PYMT/CUSTPYMT (Payment)
    return name.startsWith('CS') ||
           name.startsWith('RFND') ||
           name.startsWith('PYMT') ||
           name.startsWith('CUSTPYMT') ||
           name.includes('CASH SALE') ||
           name.includes('CASH REFUND') ||
           name.includes('PAYMENT')
  }

  // Helper function to get the amount to use for NetSuite totals
  // For cash sales: use NetSuite amount if available, otherwise Shopify amount
  // For non-cash sales (with dropdown): use Shopify amount
  const getNetSuiteAmount = (transaction: TransactionItem): number => {
    const isCashSale = isCashSaleOrRefund(transaction)

    if (isCashSale) {
      // For cash sales, prefer NetSuite amount, fall back to Shopify amount
      if (transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined) {
        const nsAmount = typeof transaction.netsuiteAmount === 'string'
          ? parseFloat(transaction.netsuiteAmount as unknown as string)
          : transaction.netsuiteAmount
        if (!isNaN(nsAmount)) {
          return nsAmount
        }
      }
    }

    // For non-cash sales (with dropdown) or if NetSuite amount not available, use Shopify amount
    const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount
    return amount || 0
  }

  // Calculate counts for each filter option to determine if they should be disabled
  const calculateFilterCounts = useMemo((): FilterCounts => {
    // Count web orders
    const webOrdersCount = localTransactions.filter(t => {
      if (t.is_web_order === true) return true
      if (t.is_web_order === false) return false
      return t.source_name === 'web' || t.source_name === 'checkout'
    }).length

    // Count non-web orders
    const nonWebOrdersCount = localTransactions.filter(t => {
      if (t.is_web_order === false) return true
      if (t.is_web_order === true) return false
      return t.source_name !== 'web' && t.source_name !== 'checkout'
    }).length

    // Count problematic transactions (for "Orders with Issues")
    const problematicOrderIds = new Set<string>()
    let problematicNonOrderCount = 0
    localTransactions.forEach(t => {
      if (isProblematicTransaction(t)) {
        if (t.source_order_id && t.source_order_id !== 'N/A') {
          problematicOrderIds.add(t.source_order_id)
        } else {
          problematicNonOrderCount++
        }
      }
    })
    const problematicOrdersCount = problematicOrderIds.size + problematicNonOrderCount

    // Count problematic web orders
    const problematicWebOrderIds = new Set<string>()
    localTransactions.filter(t => {
      if (t.is_web_order === true) return true
      if (t.is_web_order === false) return false
      return t.source_name === 'web' || t.source_name === 'checkout'
    }).forEach(t => {
      if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
        problematicWebOrderIds.add(t.source_order_id)
      }
    })
    const problematicWebOrdersCount = problematicWebOrderIds.size

    // Count problematic non-web orders (includes non-order transactions like disputes)
    const problematicNonWebOrderIds = new Set<string>()
    let problematicNonWebNonOrderCount = 0
    localTransactions.filter(t => {
      if (t.is_web_order === false) return true
      if (t.is_web_order === true) return false
      // Non-order transactions (no source) count as non-web
      if (!t.source_name) return true
      return t.source_name !== 'web' && t.source_name !== 'checkout'
    }).forEach(t => {
      if (isProblematicTransaction(t)) {
        if (t.source_order_id && t.source_order_id !== 'N/A') {
          problematicNonWebOrderIds.add(t.source_order_id)
        } else {
          problematicNonWebNonOrderCount++
        }
      }
    })
    const problematicNonWebOrdersCount = problematicNonWebOrderIds.size + problematicNonWebNonOrderCount

    return {
      webOrdersCount,
      nonWebOrdersCount,
      problematicOrdersCount,
      problematicWebOrdersCount,
      problematicNonWebOrdersCount,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTransactions])

  // Identify transactions with missing orders
  const missingOrderIds = localTransactions
    .filter(t => {
      const hasOrderId = t.source_order_id && t.source_order_id !== 'N/A'
      const missingOrderName = !t.order_name || t.order_name === '—'
      return hasOrderId && missingOrderName
    })
    .map(t => t.source_order_id)
    .filter((id, index, self) => self.indexOf(id) === index) // unique

  // Identify transactions with missing NetSuite IDs
  // Exclude transactions that have a dropdown selection (handled via deposit mapping)
  // or are excluded/ignored
  const missingNSTransactions = localTransactions.filter(
    t => t.order_name && t.order_name !== '—' && !t.netsuiteTransactionId
      && !hasDropdownAssignment(t) && t.includeInNetSuite !== false
  )

  // Separate top-level (Shopify-visible) from child (split) transactions
  const topLevelTransactions = localTransactions.filter(t => !t.parentTransactionId)

  // Calculate Shopify summary breakdown (matching Shopify payout format)
  const includedTransactions = topLevelTransactions.filter(t => t.includeInNetSuite !== false)

  const totalCharges = includedTransactions
    .filter(t => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return t.type === 'charge' && (amount || 0) > 0
    })
    .reduce((sum, t) => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return sum + (amount || 0)
    }, 0)

  const totalRefunds = includedTransactions
    .filter(t => t.type === 'refund')
    .reduce((sum, t) => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return sum + (amount || 0) // Refunds are already negative in Shopify
    }, 0)

  const totalAdjustments = includedTransactions
    .filter(t => (t.adjustmentReason && t.adjustmentReason !== null) || t.type === 'dispute')
    .reduce((sum, t) => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return sum + (amount || 0)
    }, 0)

  const totalMarketplaceSalesTax = includedTransactions
    .filter(t => t.type === 'marketplace_sales_tax' || (t.type && t.type.toLowerCase().includes('marketplace')))
    .reduce((sum, t) => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return sum + (amount || 0)
    }, 0)

  // Sum fees from included transactions (same set as charges/refunds/adjustments)
  // Fees are positive for charges (Shopify takes money) and negative for
  // fee refunds (e.g. won dispute fee reversal). Signed sum is correct.
  const totalFeesRaw = includedTransactions.reduce((sum, t) => {
    const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : (t.fee ?? 0)
    return sum + (fee || 0)
  }, 0)

  // Fees are displayed as negative (they reduce the payout)
  const totalFees = -totalFeesRaw

  // Debug: Log fee calculation (remove in production)
  if (process.env.NODE_ENV === 'development') {
    const transactionsWithFees = localTransactions.filter(t => {
      const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : (t.fee ?? 0)
      return Math.abs(fee) > 0.01
    })
    console.log('Fee calculation debug:', {
      totalTransactions: localTransactions.length,
      transactionsWithFees: transactionsWithFees.length,
      totalFeesRaw,
      totalFees,
    })
  }

  // Calculate total (matching Shopify payout format)
  // Fees are negative, so they subtract from the total
  const calculatedShopifyTotal = totalCharges + totalRefunds + totalAdjustments + totalMarketplaceSalesTax + totalFees
  const totalShopifyAmount = payoutTotalAmount ?? calculatedShopifyTotal

  // Calculate NetSuite total using hybrid approach:
  // - For cash sales: use NetSuite amount if available, otherwise Shopify amount
  // - For non-cash sales (with dropdown): use Shopify amount
  // Memoize includedTransactionsForNetSuite to prevent unnecessary recalculations
  const includedTransactionsForNetSuite = useMemo(
    () => localTransactions.filter(t => t.includeInNetSuite !== false),
    [localTransactions]
  )

  // Calculate NetSuite breakdown first (needed for both summary and total)
  const nsCharges = includedTransactionsForNetSuite
    .filter(t => t.type === 'charge' && getNetSuiteAmount(t) > 0)
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)

  const nsRefunds = includedTransactionsForNetSuite
    .filter(t => t.type === 'refund')
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0) // Refunds are already negative

  const nsAdjustments = includedTransactionsForNetSuite
    .filter(t => (t.adjustmentReason && t.adjustmentReason !== null) || t.type === 'dispute')
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)

  // Calculate NetSuite fees: only actual transaction fees (fee column).
  // Dropdown-assigned amounts (shipping labels, ad fees, etc.) are tracked
  // separately in groupedFeeItems and shown as individual line items.
  const nsFeesRaw = includedTransactionsForNetSuite
    .reduce((sum, t) => {
      const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
      return sum + (fee || 0)
    }, 0)
  const nsFees = -nsFeesRaw // Fees are negative

  // Calculate NS marketplace sales tax (if any transactions have this type)
  const nsMarketplaceSalesTax = includedTransactionsForNetSuite
    .filter(t => t.type === 'marketplace_sales_tax' || (t.type && t.type.toLowerCase().includes('marketplace')))
    .reduce((sum, t) => {
      const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
      return sum + (amount || 0)
    }, 0)

  // Calculate total: sum all components (refunds, fees are already negative)
  const totalNetSuiteAmount = nsCharges + nsRefunds + nsAdjustments + nsMarketplaceSalesTax + nsFees

  // --- Deposit Structure Classification ---
  // Classify transactions the same way the NS deposit does: Payments tab vs Cash Back tab
  const isNsCashSale = (t: TransactionItem) => {
    const n = (t.netsuiteTransactionName || '').toUpperCase().trim()
    return n.startsWith('CS') || n.includes('CASH SALE')
  }
  const isNsRefund = (t: TransactionItem) => {
    const n = (t.netsuiteTransactionName || '').toUpperCase().trim()
    return n.startsWith('RFND') || n.includes('CASH REFUND')
  }
  const isNsPayment = (t: TransactionItem) => {
    const n = (t.netsuiteTransactionName || '').toUpperCase().trim()
    return n.startsWith('PYMT') || n.startsWith('CUSTPYMT') || n.includes('PAYMENT')
  }

  // Payment tab items
  const depositCashSales = includedTransactionsForNetSuite.filter(isNsCashSale)
  const depositRefunds = includedTransactionsForNetSuite.filter(isNsRefund)
  const depositPayments = includedTransactionsForNetSuite.filter(isNsPayment)

  const depositCashSalesTotal = depositCashSales.reduce((s, t) => s + getNetSuiteAmount(t), 0)
  const depositRefundsTotal = depositRefunds.reduce((s, t) => s + getNetSuiteAmount(t), 0)
  const depositPaymentsTotal = depositPayments.reduce((s, t) => s + getNetSuiteAmount(t), 0)
  const paymentsTabTotal = depositCashSalesTotal + depositRefundsTotal + depositPaymentsTotal

  // Cash Back total: nsFees (already negative) + dropdown item amounts (already negative)
  const cashBackTotal = nsFees + groupedFeeItems
    .filter(fi => fi.description !== 'Shopify Fees')
    .reduce((s, fi) => s + fi.netsuiteAmount, 0)

  const depositTotal = paymentsTabTotal + cashBackTotal

  const currency = payoutCurrency || localTransactions[0]?.currency || 'USD'
  const transactionsWithNS = localTransactions.filter(t => t.netsuiteTransactionId)

  // Calculate grouped fee items effect
  useEffect(() => {
    // Guard: Don't run if transactions array is empty or hasn't been initialized
    if (!localTransactions || localTransactions.length === 0) {
      setGroupedFeeItems([])
      return
    }

    let cancelled = false

    const calculateFeeItems = async () => {
      try {
        // Fetch payout mappings to resolve descriptions
        const response = await fetch('/api/mappings/payout-mappings')

        if (cancelled || !isMountedRef.current) return

        if (!response.ok) {
          console.error('Failed to fetch payout mappings:', response.status, response.statusText)
          if (isMountedRef.current) {
            setGroupedFeeItems([])
          }
          return
        }

        const data = await response.json()

        if (cancelled || !isMountedRef.current) return

        if (!data.success || !data.data) {
          console.warn('Payout mappings response missing data:', data)
          if (isMountedRef.current) {
            setGroupedFeeItems([])
          }
          return
        }

        // Handle both array and object formats
        const payoutMappings = Array.isArray(data.data)
          ? data.data
          : Object.values(data.data).flat() as Array<{ id: number; netsuiteId: string; description: string | null }>

        // Helper to find mapping
        const findMapping = (value: string | null | undefined) => {
          if (!value) return null
          return payoutMappings.find(
            (m: { netsuiteId: string; description: string }) => m.netsuiteId === value || m.description === value
          )
        }

        // Group by description for both Shopify and NetSuite
        const shopifyFeeMap = new Map<string, number>()
        const netsuiteFeeMap = new Map<string, number>()

        // Add ALL fees from transactions table to Shopify Fees (signed sum)
        const shopifyFeesRaw = localTransactions.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + (fee || 0)
        }, 0)
        // Always set Shopify Fees, even if 0, so it shows the total
        shopifyFeeMap.set('Shopify Fees', shopifyFeesRaw)

        // Add ALL fees from included transactions to NetSuite Fees (signed sum)
        const netsuiteFeesRaw = includedTransactionsForNetSuite.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + (fee || 0)
        }, 0)
        // Always set Shopify Fees, even if 0, so it shows the total
        netsuiteFeeMap.set('Shopify Fees', netsuiteFeesRaw)

        // Add dropdown selections
        localTransactions.forEach((txn) => {
          // amountDescription dropdown
          if (txn.amountDescription) {
            const mapping = findMapping(txn.amountDescription)
            if (mapping) {
              const description = mapping.description || txn.amountDescription
              const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
              const existing = shopifyFeeMap.get(description) || 0
              shopifyFeeMap.set(description, existing + (amount || 0))
            }
          }

        })

        // Add NetSuite dropdown selections (only for transactions without cash sale)
        includedTransactionsForNetSuite.forEach((txn) => {
          const hasNoCashSale = !txn.netsuiteTransactionId || txn.netsuiteTransactionId.trim() === ''

          // amountDescription dropdown
          if (txn.amountDescription && hasNoCashSale) {
            const mapping = findMapping(txn.amountDescription)
            if (mapping) {
              const description = mapping.description || txn.amountDescription
              const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
              const existing = netsuiteFeeMap.get(description) || 0
              netsuiteFeeMap.set(description, existing + (amount || 0))
            }
          }
        })

        // Ensure "Shopify Fees" always shows the sum of ALL fees from the transactions table
        // Recalculate to make sure it's the total of all fees (not affected by dropdown selections)
        const allFeesTotal = localTransactions.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + (fee || 0)
        }, 0)
        shopifyFeeMap.set('Shopify Fees', allFeesTotal)

        // For NetSuite, sum all fees from included transactions
        const allNetSuiteFeesTotal = includedTransactionsForNetSuite.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + (fee || 0)
        }, 0)
        netsuiteFeeMap.set('Shopify Fees', allNetSuiteFeesTotal)

        // Combine all unique descriptions and create items
        const allDescriptions = new Set([...Array.from(shopifyFeeMap.keys()), ...Array.from(netsuiteFeeMap.keys())])
        const items = Array.from(allDescriptions)
          .map(description => ({
            description,
            shopifyAmount: shopifyFeeMap.get(description) || 0,
            netsuiteAmount: netsuiteFeeMap.get(description) || 0,
          }))
          .sort((a, b) => {
            // Put "Shopify Fees" first, then sort others alphabetically
            if (a.description === 'Shopify Fees') return -1
            if (b.description === 'Shopify Fees') return 1
            return a.description.localeCompare(b.description)
          })

        if (!cancelled && isMountedRef.current) {
          setGroupedFeeItems(items)
        }
      } catch (error) {
        console.error('Error calculating fee items:', error)
        if (!cancelled && isMountedRef.current) {
          setGroupedFeeItems([])
        }
      }
    }

    calculateFeeItems()

    return () => {
      cancelled = true
      // Don't set isMountedRef.current = false here - that's only for component unmount
    }
  }, [localTransactions, includedTransactionsForNetSuite]) // includedTransactionsForNetSuite is memoized from localTransactions

  return {
    localTransactions,
    setLocalTransactions,
    isMountedRef,
    groupedFeeItems,
    orderSourceMappings,
    isProblematicTransaction,
    isCashSaleOrRefund,
    getNetSuiteAmount,
    calculateFilterCounts,
    missingOrderIds,
    missingNSTransactions,
    topLevelTransactions,
    includedTransactions,
    totalCharges,
    totalRefunds,
    totalAdjustments,
    totalMarketplaceSalesTax,
    totalFees,
    totalShopifyAmount,
    includedTransactionsForNetSuite,
    nsCharges,
    nsRefunds,
    nsAdjustments,
    nsFees,
    totalNetSuiteAmount,
    currency,
    transactionsWithNS,
    // Deposit structure
    paymentsTabTotal,
    depositCashSalesTotal,
    depositCashSalesCount: depositCashSales.length,
    depositRefundsTotal,
    depositRefundsCount: depositRefunds.length,
    depositPaymentsTotal,
    depositPaymentsCount: depositPayments.length,
    cashBackTotal,
    depositTotal,
  }
}
