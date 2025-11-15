"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TransactionsTable } from "@/components/TransactionsTable"
import { AddNetSuiteTransactionDialog } from "@/components/AddNetSuiteTransactionDialog"
import { Download, Loader2, Database, Check, X } from "lucide-react"

interface TransactionsDialogProps {
  isOpen: boolean
  onClose: () => void
  payoutId: string | null
  transactions: Array<{
    id: string
    source_order_id: string
    order_name?: string | null
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
    otherFeesDescription?: string | null
    amountDescription?: string | null
    feeDescription?: string | null
  }>
  payoutTotalAmount?: number | null
  payoutCurrency?: string
  isLoading: boolean
  hideSensitiveData?: boolean
  onRefreshTransactions?: () => void
}

export function TransactionsDialog({ 
  isOpen, 
  onClose, 
  payoutId, 
  transactions, 
  payoutTotalAmount,
  payoutCurrency = 'USD',
  isLoading, 
  hideSensitiveData = false,
  onRefreshTransactions
}: TransactionsDialogProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [isFetchingNS, setIsFetchingNS] = useState(false)
  const [filterMissingCashSale, setFilterMissingCashSale] = useState(false)
  const [addNetSuiteDialogOpen, setAddNetSuiteDialogOpen] = useState(false)
  const [selectedTransactionForAdd, setSelectedTransactionForAdd] = useState<typeof transactions[0] | null>(null)

  // Identify transactions with missing orders
  const missingOrderIds = transactions
    .filter(t => {
      const hasOrderId = t.source_order_id && t.source_order_id !== 'N/A'
      const missingOrderName = !t.order_name || t.order_name === '—'
      return hasOrderId && missingOrderName
    })
    .map(t => t.source_order_id)
    .filter((id, index, self) => self.indexOf(id) === index) // unique

  // Identify transactions with missing NetSuite IDs
  const missingNSTransactions = transactions.filter(
    t => t.order_name && t.order_name !== '—' && !t.netsuiteTransactionId
  )

  // Helper function to check if transaction is cash sale, cash refund, or payment
  const isCashSaleOrRefund = (transaction: typeof transactions[0]): boolean => {
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
  const getNetSuiteAmount = (transaction: typeof transactions[0]): number => {
    const isCashSale = isCashSaleOrRefund(transaction)
    
    if (isCashSale) {
      // For cash sales, prefer NetSuite amount, fall back to Shopify amount
      if (transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined) {
        const nsAmount = typeof transaction.netsuiteAmount === 'string' 
          ? parseFloat(transaction.netsuiteAmount) 
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

  // Calculate Shopify summary breakdown (matching Shopify payout format)
  const includedTransactions = transactions.filter(t => t.includeInNetSuite !== false)
  
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
    .filter(t => t.adjustmentReason && t.adjustmentReason !== null)
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

  // Sum all fees (they're stored as positive in DB, but should be negative for display/calculation)
  // Fees should be included from ALL transactions in the payout, not just included ones
  // IMPORTANT: Fees are only on charge transactions, not on refunds/adjustments/marketplace sales tax
  const totalFeesRaw = transactions.reduce((sum, t) => {
    const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : (t.fee ?? 0)
    // Fees can be positive or negative in DB, but we want absolute value for summing
    // Then we'll make it negative for display
    const feeValue = fee || 0
    return sum + Math.abs(feeValue)
  }, 0)
  
  // Fees are displayed as negative (they reduce the payout)
  const totalFees = -totalFeesRaw
  
  // Debug: Log fee calculation (remove in production)
  if (process.env.NODE_ENV === 'development') {
    const transactionsWithFees = transactions.filter(t => {
      const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : (t.fee ?? 0)
      return Math.abs(fee) > 0.01
    })
    console.log('Fee calculation debug:', {
      totalTransactions: transactions.length,
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
  const includedTransactionsForNetSuite = transactions.filter(t => t.includeInNetSuite !== false)
  
  // Calculate NetSuite breakdown first (needed for both summary and total)
  const nsCharges = includedTransactionsForNetSuite
    .filter(t => t.type === 'charge' && getNetSuiteAmount(t) > 0)
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)
  
  const nsRefunds = includedTransactionsForNetSuite
    .filter(t => t.type === 'refund')
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0) // Refunds are already negative
  
  const nsAdjustments = includedTransactionsForNetSuite
    .filter(t => t.adjustmentReason && t.adjustmentReason !== null)
    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)
  
  // Calculate NetSuite fees: includes actual fees PLUS amounts from dropdown selections when there's no cash sale
  const nsFeesRaw = includedTransactionsForNetSuite
    .reduce((sum, t) => {
      // Start with actual fee amount
      const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
      let feeAmount = Math.abs(fee || 0)
      
      // If there's no cash sale (no netsuiteTransactionId) and a dropdown is selected, add that amount to fees
      const hasNoCashSale = !t.netsuiteTransactionId || t.netsuiteTransactionId.trim() === ''
      const hasDropdownSelection = !!(t.amountDescription || t.otherFeesDescription)
      
      if (hasNoCashSale && hasDropdownSelection) {
        // For amountDescription, use the transaction amount
        if (t.amountDescription) {
          const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
          feeAmount += Math.abs(amount || 0)
        }
        
        // For otherFeesDescription, use amount or fee (whichever is available)
        if (t.otherFeesDescription) {
          const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
          const feeValue = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          const amountToUse = Math.abs(amount || 0) || Math.abs(feeValue || 0)
          feeAmount += amountToUse
        }
      }
      
      return sum + feeAmount
    }, 0)
  const nsFees = -nsFeesRaw // Fees are negative
  
  // Calculate total as: charges - refunds - adjustments - fees
  // This represents what actually hits the account
  const totalNetSuiteAmount = nsCharges - Math.abs(nsRefunds) - Math.abs(nsAdjustments) - Math.abs(nsFees)

  const currency = payoutCurrency || transactions[0]?.currency || 'USD'
  const transactionsWithNS = transactions.filter(t => t.netsuiteTransactionId)

  // Calculate grouped fee items (Shopify Fees, Shop Ads, etc.)
  const [groupedFeeItems, setGroupedFeeItems] = useState<Array<{ description: string; shopifyAmount: number; netsuiteAmount: number }>>([])

  useEffect(() => {
    const calculateFeeItems = async () => {
      try {
        // Fetch payout mappings to resolve descriptions
        const response = await fetch('/api/mappings/payout-mappings')
        const data = await response.json()
        
        if (!data.success || !data.data) {
          setGroupedFeeItems([])
          return
        }

        const payoutMappings = Object.values(data.data).flat() as Array<{ id: number; netsuiteId: string; description: string | null }>
        
        // Helper to find mapping
        const findMapping = (value: string | null | undefined) => {
          if (!value) return null
          return payoutMappings.find(
            (m) => m.netsuiteId === value || m.description === value
          )
        }

        // Group by description for both Shopify and NetSuite
        const shopifyFeeMap = new Map<string, number>()
        const netsuiteFeeMap = new Map<string, number>()

        // Add ALL fees from transactions table to Shopify Fees (sum all fees)
        const shopifyFeesRaw = transactions.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + Math.abs(fee || 0)
        }, 0)
        // Always set Shopify Fees, even if 0, so it shows the total
        shopifyFeeMap.set('Shopify Fees', shopifyFeesRaw)

        // Add ALL fees from included transactions to NetSuite Fees (sum all fees)
        const netsuiteFeesRaw = includedTransactionsForNetSuite.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + Math.abs(fee || 0)
        }, 0)
        // Always set Shopify Fees, even if 0, so it shows the total
        netsuiteFeeMap.set('Shopify Fees', netsuiteFeesRaw)

        // Add dropdown selections
        transactions.forEach((txn) => {
          // amountDescription dropdown
          if (txn.amountDescription) {
            const mapping = findMapping(txn.amountDescription)
            if (mapping) {
              const description = mapping.description || txn.amountDescription
              const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
              const existing = shopifyFeeMap.get(description) || 0
              shopifyFeeMap.set(description, existing + Math.abs(amount || 0))
            }
          }

          // otherFeesDescription dropdown
          if (txn.otherFeesDescription) {
            const mapping = findMapping(txn.otherFeesDescription)
            if (mapping) {
              const description = mapping.description || txn.otherFeesDescription
              const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
              const feeValue = typeof txn.fee === 'string' ? parseFloat(txn.fee) : txn.fee
              const amountToUse = Math.abs(amount || 0) || Math.abs(feeValue || 0)
              const existing = shopifyFeeMap.get(description) || 0
              shopifyFeeMap.set(description, existing + amountToUse)
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
              netsuiteFeeMap.set(description, existing + Math.abs(amount || 0))
            }
          }

          // otherFeesDescription dropdown
          if (txn.otherFeesDescription && hasNoCashSale) {
            const mapping = findMapping(txn.otherFeesDescription)
            if (mapping) {
              const description = mapping.description || txn.otherFeesDescription
              const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
              const feeValue = typeof txn.fee === 'string' ? parseFloat(txn.fee) : txn.fee
              const amountToUse = Math.abs(amount || 0) || Math.abs(feeValue || 0)
              const existing = netsuiteFeeMap.get(description) || 0
              netsuiteFeeMap.set(description, existing + amountToUse)
            }
          }
        })

        // Ensure "Shopify Fees" always shows the sum of ALL fees from the transactions table
        // Recalculate to make sure it's the total of all fees (not affected by dropdown selections)
        const allFeesTotal = transactions.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + Math.abs(fee || 0)
        }, 0)
        shopifyFeeMap.set('Shopify Fees', allFeesTotal)
        
        // For NetSuite, sum all fees from included transactions
        const allNetSuiteFeesTotal = includedTransactionsForNetSuite.reduce((sum, t) => {
          const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
          return sum + Math.abs(fee || 0)
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
        
        setGroupedFeeItems(items)
      } catch (error) {
        console.error('Error calculating fee items:', error)
        setGroupedFeeItems([])
      }
    }

    calculateFeeItems()
  }, [transactions, includedTransactionsForNetSuite])

  const handleImportMissingOrders = async () => {
    if (missingOrderIds.length === 0) return

    setIsImporting(true)
    try {
      const response = await fetch('/api/orders/import-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderIds: missingOrderIds }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const importedCount = data.imported || 0
        const updatedCount = data.updated || 0
        const totalProcessed = importedCount + updatedCount
        
        if (data.errors && data.errors.length > 0) {
          console.warn('Some orders failed to import:', data.errors)
          alert(`Imported ${totalProcessed} order(s). Some orders failed to import. Check console for details.`)
        } else {
          alert(`Successfully imported ${importedCount} new order(s) and updated ${updatedCount} existing order(s).`)
        }

        // Refresh transactions to show the newly imported order names
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error importing orders:', data.error)
        alert(`Error importing orders: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error importing orders:', error)
      alert(`Error importing orders: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFetchMissingNSTransactions = async () => {
    if (!payoutId || missingNSTransactions.length === 0) return

    setIsFetchingNS(true)
    try {
      const response = await fetch(`/api/payouts/${payoutId}/netsuite-transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const updatedCount = data.updated || 0
        const errorCount = data.errors?.length || 0
        
        if (data.errors && data.errors.length > 0) {
          const errorMessage = data.errors.slice(0, 5).join('\n')
          const moreErrors = data.errors.length > 5 ? `\n... and ${data.errors.length - 5} more` : ''
          alert(`Updated ${updatedCount} transaction(s) with NetSuite IDs.\n\nAmount mismatches:\n${errorMessage}${moreErrors}`)
        } else {
          alert(`Successfully fetched NetSuite IDs for ${updatedCount} transaction(s).`)
        }

        // Refresh transactions to show the newly fetched NetSuite IDs
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error fetching NetSuite transactions:', data.error)
        alert(`Error fetching NetSuite transactions: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching NetSuite transactions:', error)
      alert(`Error fetching NetSuite transactions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsFetchingNS(false)
    }
  }

  const handleDeleteNetSuiteId = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete the NetSuite transaction ID? This will allow you to reimport it after resolving issues.')) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/clear-netsuite`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh transactions to show the updated data
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error deleting NetSuite transaction ID:', data.error)
        alert(`Error deleting NetSuite transaction ID: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting NetSuite transaction ID:', error)
      alert(`Error deleting NetSuite transaction ID: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleToggleInclude = async (transactionId: string, include: boolean) => {
    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/toggle-include`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ includeInNetSuite: include }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh transactions to show the updated data
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error toggling includeInNetSuite:', data.error)
        alert(`Error updating transaction: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error toggling includeInNetSuite:', error)
      alert(`Error updating transaction: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleReassignNetSuite = async (fromTransactionId: string, toTransactionId: string) => {
    try {
      const response = await fetch('/api/payouts/transactions/reassign-netsuite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromTransactionId,
          toTransactionId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh transactions to show the updated data
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error reassigning NetSuite ID:', data.error)
        throw new Error(data.error || 'Unknown error')
      }
    } catch (error) {
      console.error('Error reassigning NetSuite ID:', error)
      throw error
    }
  }

  const handleAddNetSuite = (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId)
    if (transaction) {
      setSelectedTransactionForAdd(transaction)
      setAddNetSuiteDialogOpen(true)
    }
  }

  const handleSaveNetSuite = async (data: {
    netsuiteTransactionId: string
    netsuiteTransactionName: string
    netsuiteAmount: number
  }) => {
    if (!selectedTransactionForAdd) {
      throw new Error('No transaction selected')
    }

    const response = await fetch(`/api/payouts/transactions/${selectedTransactionForAdd.id}/add-netsuite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (response.ok && result.success) {
      // Refresh transactions to show the updated data
      if (onRefreshTransactions) {
        onRefreshTransactions()
      }
    } else {
      throw new Error(result.error || 'Failed to add NetSuite transaction')
    }
  }

  const handleUpdateOtherFeesDescription = async (transactionId: string, description: string | null) => {
    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/other-fees-description`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ otherFeesDescription: description }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh transactions to show the updated data
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error updating other fees description:', data.error)
        alert(`Error updating other fees description: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating other fees description:', error)
      alert(`Error updating other fees description: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleUpdateAmountDescription = async (transactionId: string, description: string | null) => {
    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/amount-description`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amountDescription: description }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error updating amount description:', data.error)
        alert(`Error updating amount description: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating amount description:', error)
      alert(`Error updating amount description: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleUpdateFeeDescription = async (transactionId: string, description: string | null) => {
    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/fee-description`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feeDescription: description }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error updating fee description:', data.error)
        alert(`Error updating fee description: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating fee description:', error)
      alert(`Error updating fee description: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleMergeTransactions = async (sourceTransactionIds: string[], targetTransactionId: string) => {
    try {
      const response = await fetch('/api/payouts/transactions/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceTransactionIds,
          targetTransactionId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error merging transactions:', data.error)
        throw new Error(data.error || 'Failed to merge transactions')
      }
    } catch (error) {
      console.error('Error merging transactions:', error)
      throw error
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transactions for Payout #{payoutId || ''}
          </DialogTitle>
        </DialogHeader>
        
        {/* Summary Totals */}
        {(() => {
          // NetSuite breakdown is already calculated above, reuse those values

          // Calculate matches for each category
          const chargesMatch = Math.abs(totalCharges - nsCharges) < 0.01
          const refundsMatch = Math.abs(totalRefunds - nsRefunds) < 0.01
          const adjustmentsMatch = Math.abs(totalAdjustments - nsAdjustments) < 0.01
          const feesMatch = Math.abs(totalFees - nsFees) < 0.01

          // Create unified list of items to display (always show all items for alignment)
          // Show item if it appears in Shopify OR NetSuite to ensure alignment
          const summaryItems = [
            { label: 'Charges', shopify: totalCharges, netsuite: nsCharges, match: chargesMatch, showShopify: true, showNetSuite: nsCharges !== 0, isNegative: false },
            { label: 'Refunds', shopify: totalRefunds, netsuite: nsRefunds, match: refundsMatch, showShopify: totalRefunds !== 0, showNetSuite: nsRefunds !== 0, isNegative: true },
            { label: 'Adjustments', shopify: totalAdjustments, netsuite: nsAdjustments, match: adjustmentsMatch, showShopify: totalAdjustments !== 0, showNetSuite: nsAdjustments !== 0, isNegative: false },
            { label: 'Marketplace sales tax', shopify: totalMarketplaceSalesTax, netsuite: 0, match: true, showShopify: totalMarketplaceSalesTax !== 0, showNetSuite: false, isNegative: false },
            { label: 'Fees', shopify: totalFees, netsuite: nsFees, match: feesMatch, showShopify: totalFees !== 0, showNetSuite: nsFees !== 0, isNegative: true },
          ].filter(item => item.showShopify || item.showNetSuite) // Only show items that appear in at least one column

          return (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Shopify Summary (Left) */}
              <div className="p-4 bg-white rounded-lg border">
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Shopify</p>
                  <p className="text-2xl font-bold">
                    {hideSensitiveData ? (
                      <span className="text-gray-500">••••••</span>
                    ) : (
                      `${currency} ${totalShopifyAmount.toFixed(2)}`
                    )}
                  </p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Summary</p>
                  <div className="space-y-2">
                    {summaryItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                        <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                        <span className="text-sm font-medium text-right min-w-[100px]">
                          {item.showShopify ? (
                            <span className={item.isNegative ? 'text-red-600' : ''}>
                              {hideSensitiveData ? (
                                <span className="text-gray-500">••••••</span>
                              ) : (
                                `${currency} ${item.shopify.toFixed(2)}`
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Column (Middle) */}
              <div className="p-4 bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200">
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <p className="text-2xl font-bold text-slate-700">
                    {hideSensitiveData ? (
                      <span className="text-gray-500">••••••</span>
                    ) : Math.abs(totalNetSuiteAmount - totalShopifyAmount) < 0.01 ? (
                      <span className="text-green-600">Matched</span>
                    ) : (
                      <span className="text-orange-600">Mismatch</span>
                    )}
                  </p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Match Status</p>
                  <div className="space-y-2">
                    {summaryItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                        <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                        <span className="text-right min-w-[100px] flex justify-end">
                          {!hideSensitiveData && item.showShopify && item.showNetSuite ? (
                            item.match ? (
                              <div className="flex items-center gap-1 text-green-600" title="Shopify matches NetSuite">
                                <Check className="h-4 w-4" />
                                <span className="text-xs font-medium">Match</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-red-600" title="Shopify does not match NetSuite">
                                <X className="h-4 w-4" />
                                <span className="text-xs font-medium">Mismatch</span>
                              </div>
                            )
                          ) : (
                            <span className="text-gray-500 text-xs">—</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Proposed NetSuite Summary (Right) */}
              <div className="p-4 bg-white rounded-lg border">
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Proposed NetSuite</p>
                  <p className={`text-2xl font-bold ${
                    includedTransactionsForNetSuite.length > 0 
                      ? Math.abs(totalNetSuiteAmount - totalShopifyAmount) < 0.01 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                      : 'text-muted-foreground'
                  }`}>
                    {hideSensitiveData ? (
                      <span className="text-gray-500">••••••</span>
                    ) : includedTransactionsForNetSuite.length > 0 ? (
                      `${currency} ${totalNetSuiteAmount.toFixed(2)}`
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Summary</p>
                  <div className="space-y-2">
                    {summaryItems.map((item, idx) => {
                      // Special handling for Fees - show breakdown
                      if (item.label === 'Fees' && groupedFeeItems.length > 0) {
                        return (
                          <div key={idx}>
                            <div className="flex justify-between items-center min-h-[28px] py-0.5">
                              <span className="text-sm font-semibold text-slate-700 flex-1">{item.label}</span>
                              <span className={`text-sm font-medium text-right min-w-[100px] ${item.isNegative ? 'text-red-600' : ''}`}>
                                {item.showNetSuite ? (
                                  hideSensitiveData ? (
                                    <span className="text-gray-500">••••••</span>
                                  ) : (
                                    `${currency} ${item.netsuite.toFixed(2)}`
                                  )
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </span>
                            </div>
                            {groupedFeeItems.map((feeItem, feeIdx) => (
                              <div key={`fee-${feeIdx}`} className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                                <span className="text-xs text-slate-500 flex-1">- {feeItem.description}</span>
                                <span className="text-xs font-medium text-red-600 text-right min-w-[100px]">
                                  {hideSensitiveData ? (
                                    <span className="text-gray-500">••••••</span>
                                  ) : feeItem.netsuiteAmount > 0 ? (
                                    `-${currency} ${feeItem.netsuiteAmount.toFixed(2)}`
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      
                      // Regular items
                      return (
                        <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                          <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                          <span className={`text-sm font-medium text-right min-w-[100px] ${item.isNegative ? 'text-red-600' : ''}`}>
                            {item.showNetSuite ? (
                              hideSensitiveData ? (
                                <span className="text-gray-500">••••••</span>
                              ) : (
                                `${currency} ${item.netsuite.toFixed(2)}`
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                    {transactionsWithNS.length === 0 && summaryItems.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        No transactions matched yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        <div className="mt-4 space-y-2">
          {missingOrderIds.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {missingOrderIds.length} order{missingOrderIds.length !== 1 ? 's' : ''} missing from database
              </p>
              <Button
                onClick={handleImportMissingOrders}
                disabled={isImporting}
                size="sm"
                className="flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Import Missing Orders
                  </>
                )}
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {missingNSTransactions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {missingNSTransactions.length} transaction{missingNSTransactions.length !== 1 ? 's' : ''} missing NetSuite IDs
                </p>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-missing-cash-sale"
                  checked={filterMissingCashSale}
                  onCheckedChange={(checked) => setFilterMissingCashSale(checked === true)}
                />
                <label
                  htmlFor="filter-missing-cash-sale"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Orders with Issues
                </label>
              </div>
            </div>
            {missingNSTransactions.length > 0 && (
              <Button
                onClick={handleFetchMissingNSTransactions}
                disabled={isFetchingNS}
                size="sm"
                variant="outline"
                className="flex items-center gap-2"
              >
                {isFetchingNS ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    Get Missing NS Transactions
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <TransactionsTable
            transactions={(() => {
              // When filterMissingCashSale is checked, show all transactions for Order IDs
              // that have at least one problematic transaction
              if (filterMissingCashSale) {
                // Helper function to check if a transaction is problematic
                const isProblematicTransaction = (t: typeof transactions[0]): boolean => {
                  // If transaction is resolved (ignored or has dropdown selection), it's not problematic
                  const isResolved = t.includeInNetSuite === false || 
                                    !!(t.amountDescription || t.feeDescription || t.otherFeesDescription)
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
                      const netsuiteAmount = typeof t.netsuiteAmount === 'string' ? parseFloat(t.netsuiteAmount) : t.netsuiteAmount
                      const actualMismatch = Math.abs(Math.abs(shopifyNet) - Math.abs(netsuiteAmount)) > 0.01
                      // If amounts actually match, don't treat as problematic
                      if (!actualMismatch) return false
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
                
                // Find all Order IDs that have at least one problematic transaction
                const problematicOrderIds = new Set<string>()
                transactions.forEach(t => {
                  if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
                    problematicOrderIds.add(t.source_order_id)
                  }
                })
                
                // Return all transactions for those Order IDs
                return transactions.filter(t => 
                  t.source_order_id && 
                  t.source_order_id !== 'N/A' && 
                  problematicOrderIds.has(t.source_order_id)
                )
              }
              
              // No filter applied, return all transactions
              return transactions
            })().map(t => ({
              ...t,
              amount: typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount,
              fee: typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee,
              net: typeof t.net === 'string' ? parseFloat(t.net) : t.net,
            }))}
            isLoading={isLoading}
            hideSensitiveData={hideSensitiveData}
            onDeleteNetSuiteId={handleDeleteNetSuiteId}
            onToggleInclude={handleToggleInclude}
            onReassignNetSuite={handleReassignNetSuite}
            onAddNetSuite={handleAddNetSuite}
            onUpdateOtherFeesDescription={handleUpdateOtherFeesDescription}
            onUpdateAmountDescription={handleUpdateAmountDescription}
            onUpdateFeeDescription={handleUpdateFeeDescription}
            onMergeTransactions={handleMergeTransactions}
          />
        </div>
      </DialogContent>

      {selectedTransactionForAdd && (
        <AddNetSuiteTransactionDialog
          isOpen={addNetSuiteDialogOpen}
          onClose={() => {
            setAddNetSuiteDialogOpen(false)
            setSelectedTransactionForAdd(null)
          }}
          transaction={{
            id: selectedTransactionForAdd.id,
            source_order_id: selectedTransactionForAdd.source_order_id,
            order_name: selectedTransactionForAdd.order_name,
            amount: typeof selectedTransactionForAdd.amount === 'string' 
              ? parseFloat(selectedTransactionForAdd.amount) 
              : selectedTransactionForAdd.amount || 0,
            net: typeof selectedTransactionForAdd.net === 'string' 
              ? parseFloat(selectedTransactionForAdd.net) 
              : selectedTransactionForAdd.net || 0,
            currency: selectedTransactionForAdd.currency || 'USD',
          }}
          onSave={handleSaveNetSuite}
        />
      )}
    </Dialog>
  )
}
