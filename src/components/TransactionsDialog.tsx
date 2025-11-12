"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TransactionsTable } from "@/components/TransactionsTable"
import { AddNetSuiteTransactionDialog } from "@/components/AddNetSuiteTransactionDialog"
import { Download, Loader2, Database } from "lucide-react"

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

  // Helper function to check if transaction is cash sale or cash refund
  const isCashSaleOrRefund = (transaction: typeof transactions[0]): boolean => {
    if (!transaction.netsuiteTransactionName) return false
    const name = transaction.netsuiteTransactionName.toUpperCase()
    // Check for NetSuite transaction name patterns: CS (Cash Sale), RFND (Cash Refund)
    return name.startsWith('CS') || 
           name.startsWith('RFND') || 
           name.includes('CASH SALE') || 
           name.includes('CASH REFUND')
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
    .filter(t => t.type === 'charge' && (t.amount || 0) > 0)
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
  
  const totalNetSuiteAmount = includedTransactionsForNetSuite.reduce((sum, t) => {
    return sum + getNetSuiteAmount(t)
  }, 0)

  const currency = payoutCurrency || transactions[0]?.currency || 'USD'
  const transactionsWithNS = transactions.filter(t => t.netsuiteTransactionId)

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transactions for Payout #{payoutId || ''}
          </DialogTitle>
        </DialogHeader>
        
        {/* Summary Totals */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Charges</span>
                  <span className="text-sm font-medium">
                    {hideSensitiveData ? (
                      <span className="text-gray-500">••••••</span>
                    ) : (
                      `${currency} ${totalCharges.toFixed(2)}`
                    )}
                  </span>
                </div>
                {totalRefunds !== 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Refunds</span>
                    <span className="text-sm font-medium text-red-600">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${currency} ${totalRefunds.toFixed(2)}`
                      )}
                    </span>
                  </div>
                )}
                {totalAdjustments !== 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Adjustments</span>
                    <span className="text-sm font-medium">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${currency} ${totalAdjustments.toFixed(2)}`
                      )}
                    </span>
                  </div>
                )}
                {totalMarketplaceSalesTax !== 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Marketplace sales tax</span>
                    <span className="text-sm font-medium">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${currency} ${totalMarketplaceSalesTax.toFixed(2)}`
                      )}
                    </span>
                  </div>
                )}
                {totalFees !== 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Fees</span>
                    <span className="text-sm font-medium text-red-600">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${currency} ${totalFees.toFixed(2)}`
                      )}
                    </span>
                  </div>
                )}
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
              {includedTransactionsForNetSuite.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {includedTransactionsForNetSuite.length} of {transactions.filter(t => t.includeInNetSuite !== false).length} transactions included
                </p>
              )}
            </div>
            
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Summary</p>
              <div className="space-y-2">
                {(() => {
                  // Calculate NetSuite breakdown using hybrid approach:
                  // - For cash sales: use NetSuite amount if available, otherwise Shopify amount
                  // - For non-cash sales (with dropdown): use Shopify amount
                  const nsCharges = includedTransactionsForNetSuite
                    .filter(t => t.type === 'charge' && getNetSuiteAmount(t) > 0)
                    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)
                  
                  const nsRefunds = includedTransactionsForNetSuite
                    .filter(t => t.type === 'refund')
                    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)
                  
                  const nsAdjustments = includedTransactionsForNetSuite
                    .filter(t => t.adjustmentReason && t.adjustmentReason !== null)
                    .reduce((sum, t) => sum + getNetSuiteAmount(t), 0)
                  
                  // Sum fees from included transactions (fees are stored as positive, displayed as negative)
                  const nsFeesRaw = includedTransactionsForNetSuite
                    .reduce((sum, t) => {
                      const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
                      return sum + Math.abs(fee || 0)
                    }, 0)
                  const nsFees = -nsFeesRaw

                  return (
                    <>
                      {nsCharges !== 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Charges</span>
                          <span className="text-sm font-medium">
                            {hideSensitiveData ? (
                              <span className="text-gray-500">••••••</span>
                            ) : (
                              `${currency} ${nsCharges.toFixed(2)}`
                            )}
                          </span>
                        </div>
                      )}
                      {nsRefunds !== 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Refunds</span>
                          <span className="text-sm font-medium text-red-600">
                            {hideSensitiveData ? (
                              <span className="text-gray-500">••••••</span>
                            ) : (
                              `${currency} ${nsRefunds.toFixed(2)}`
                            )}
                          </span>
                        </div>
                      )}
                      {nsAdjustments !== 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Adjustments</span>
                          <span className="text-sm font-medium">
                            {hideSensitiveData ? (
                              <span className="text-gray-500">••••••</span>
                            ) : (
                              `${currency} ${nsAdjustments.toFixed(2)}`
                            )}
                          </span>
                        </div>
                      )}
                      {nsFees !== 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Fees</span>
                          <span className="text-sm font-medium text-red-600">
                            {hideSensitiveData ? (
                              <span className="text-gray-500">••••••</span>
                            ) : (
                              `${currency} ${nsFees.toFixed(2)}`
                            )}
                          </span>
                        </div>
                      )}
                      {transactionsWithNS.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                          No transactions matched yet
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>

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
                  Missing Cash Sale
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
            transactions={transactions
              .filter(t => {
                if (filterMissingCashSale) {
                  // Show only transactions without NetSuite transaction ID
                  return !t.netsuiteTransactionId
                }
                return true
              })
              .map(t => ({
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
