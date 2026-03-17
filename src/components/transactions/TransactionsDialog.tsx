"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ClipboardList } from "lucide-react"
import { TransactionsTable } from "./TransactionsTable"
import { AddNetSuiteTransactionDialog } from "@/components/AddNetSuiteTransactionDialog"
import { SplitTransactionDialog } from "@/components/SplitTransactionDialog"
import { useTransactionData, type TransactionItem } from "./useTransactionData"
import { TransactionFilters } from "./TransactionFilters"
import { TransactionSummary } from "./TransactionSummary"
import { AuditLogDialog } from "./AuditLogDialog"
import { MarketplaceOrderDialog } from "./MarketplaceOrderDialog"

interface TransactionsDialogProps {
  isOpen: boolean
  onClose: () => void
  payoutId: string | null
  transactions: TransactionItem[]
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
  // Data hook
  const {
    localTransactions,
    setLocalTransactions,
    isMountedRef,
    groupedFeeItems,
    orderSourceMappings,
    isProblematicTransaction,
    calculateFilterCounts,
    missingOrderIds,
    missingNSTransactions,
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
  } = useTransactionData({
    transactions,
    payoutTotalAmount,
    payoutCurrency,
    isOpen,
  })

  // Filter state
  const [filterMissingCashSale, setFilterMissingCashSale] = useState(false)
  const [webOrderFilter, setWebOrderFilter] = useState<'all' | 'web' | 'non-web'>('all')
  const [adjustmentReasonFilter, setAdjustmentReasonFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Import/fetch state
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number } | null>(null)
  const [isFetchingNS, setIsFetchingNS] = useState(false)

  // Dialog state
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [addNetSuiteDialogOpen, setAddNetSuiteDialogOpen] = useState(false)
  const [selectedTransactionForAdd, setSelectedTransactionForAdd] = useState<TransactionItem | null>(null)
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [selectedTransactionForSplit, setSelectedTransactionForSplit] = useState<TransactionItem | null>(null)
  const [marketplaceDialogOpen, setMarketplaceDialogOpen] = useState(false)
  const [selectedMarketplaceTransaction, setSelectedMarketplaceTransaction] = useState<TransactionItem | null>(null)

  // Helper function to safely refresh transactions, deferring to next frame to prevent hook order issues
  const safeRefreshTransactions = () => {
    console.log('🏪 safeRefreshTransactions called, mounted:', isMountedRef.current, 'hasCallback:', !!onRefreshTransactions)
    if (!onRefreshTransactions || !isMountedRef.current) return
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log('🏪 safeRefreshTransactions executing (after rAF+setTimeout), mounted:', isMountedRef.current)
        if (isMountedRef.current && onRefreshTransactions) {
          onRefreshTransactions()
        }
      }, 0)
    })
  }

  // --- Import / Fetch handlers (passed to TransactionFilters) ---

  const handleImportMissingOrders = async () => {
    if (missingOrderIds.length === 0) return

    const BATCH_SIZE = 25
    const totalOrders = missingOrderIds.length
    setIsImporting(true)
    setImportProgress({ imported: 0, total: totalOrders })

    let totalImported = 0
    let totalUpdated = 0
    let totalErrors: string[] = []
    let ordersProcessed = 0

    try {
      const batches: string[][] = []
      for (let i = 0; i < missingOrderIds.length; i += BATCH_SIZE) {
        batches.push(missingOrderIds.slice(i, i + BATCH_SIZE))
      }

      console.log(`Starting import of ${totalOrders} orders in ${batches.length} batches of ${BATCH_SIZE}`)

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx]

        try {
          const response = await fetch('/api/orders/import-by-ids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderIds: batch }),
          })

          if (!response.ok) {
            let errorMsg = `Batch ${batchIdx + 1}: HTTP ${response.status}`
            try { const errData = await response.json(); errorMsg = errData.error || errorMsg } catch { /* response may not be JSON */ }
            console.error(errorMsg)
            totalErrors.push(errorMsg)
            ordersProcessed += batch.length
            setImportProgress({ imported: ordersProcessed, total: totalOrders })
            continue
          }

          const data = await response.json()
          totalImported += data.imported || 0
          totalUpdated += data.updated || 0
          if (data.errors) totalErrors.push(...data.errors)

          ordersProcessed += batch.length
          setImportProgress({ imported: ordersProcessed, total: totalOrders })

          if ((batchIdx + 1) % 10 === 0 || batchIdx === batches.length - 1) {
            console.log(`Batch ${batchIdx + 1}/${batches.length}: ${totalImported} imported, ${totalUpdated} updated, ${totalErrors.length} errors`)
          }
        } catch (err: any) {
          console.error(`Batch ${batchIdx + 1} failed:`, err.message)
          totalErrors.push(`Batch ${batchIdx + 1}: ${err.message}`)
          ordersProcessed += batch.length
          setImportProgress({ imported: ordersProcessed, total: totalOrders })
        }
      }

      setImportProgress({ imported: totalOrders, total: totalOrders })

      const errorCount = totalErrors.length
      if (errorCount > 0 && totalImported === 0 && totalUpdated === 0) {
        console.warn('Order import errors:', totalErrors.slice(0, 20))
        alert(`Processed ${totalOrders} orders. ${errorCount} error(s) occurred. Check console for details.`)
      } else {
        const errorMsg = errorCount > 0 ? ` Note: ${errorCount} error(s) occurred (check console).` : ''
        alert(`Successfully processed ${totalOrders} order(s) (${totalImported} new line items, ${totalUpdated} updated line items).${errorMsg}`)
      }

      safeRefreshTransactions()
      setTimeout(() => { setImportProgress(null) }, 3000)
    } catch (error) {
      console.error('Error importing orders:', error)
      alert(`Error importing orders: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setImportProgress(null)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFetchMissingNSTransactions = async () => {
    if (!payoutId || missingNSTransactions.length === 0) return

    setIsFetchingNS(true)
    try {
      const apiUrl = `/api/payouts/${payoutId}/netsuite-transactions`

      console.log('Fetching all NetSuite transactions in a single call...')
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) }
      catch { throw new Error(`Invalid response: ${text.slice(0, 200)}`) }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'NetSuite fetch failed')
      }

      const { updated, cashSalesMatched, refundsMatched, paymentsMatched, errors: nsErrors } = data
      console.log(`Done: ${updated} updated (${cashSalesMatched} CS, ${refundsMatched} RF, ${paymentsMatched} PM)`)

      if (updated === 0) {
        alert('No matching NetSuite transactions found.')
        safeRefreshTransactions()
        return
      }

      if (nsErrors && nsErrors.length > 0) {
        const errorMessage = nsErrors.slice(0, 5).join('\n')
        const moreErrors = nsErrors.length > 5 ? `\n... and ${nsErrors.length - 5} more` : ''
        alert(`Updated ${updated} transaction(s) with NetSuite IDs.\n\nAmount mismatches:\n${errorMessage}${moreErrors}`)
      } else {
        alert(`Successfully fetched NetSuite IDs for ${updated} transaction(s).`)
      }

      safeRefreshTransactions()
    } catch (error) {
      console.error('Error fetching NetSuite transactions:', error)
      alert(`Error fetching NetSuite transactions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsFetchingNS(false)
    }
  }

  // --- Transaction manipulation handlers ---

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
        safeRefreshTransactions()
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
        requestAnimationFrame(() => {
          setTimeout(() => {
            safeRefreshTransactions()
          }, 0)
        })
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
        safeRefreshTransactions()
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
    const transaction = localTransactions.find(t => t.id === transactionId)
    if (transaction) {
      setSelectedTransactionForAdd(transaction)
      setAddNetSuiteDialogOpen(true)
    }
  }

  const handleSaveNetSuite = async (data: {
    netsuiteTransactionId: string
    netsuiteTransactionName: string
    netsuiteAmount: number
    netsuiteTransactionType?: string
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
      safeRefreshTransactions()
    } else {
      throw new Error(result.error || 'Failed to add NetSuite transaction')
    }
  }

  const handleUpdateOtherFeesDescription = async (transactionId: string, description: string | null) => {
    // Optimistically update local state immediately
    setLocalTransactions(prev =>
      prev.map(t =>
        t.id === transactionId
          ? { ...t, otherFeesDescription: description }
          : t
      )
    )

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
        if (onRefreshTransactions && isMountedRef.current) {
          Promise.resolve().then(() => {
            if (isMountedRef.current && onRefreshTransactions) {
              onRefreshTransactions()
            }
          })
        }
      } else {
        console.error('Error updating other fees description:', data.error)
        alert(`Error updating other fees description: ${data.error || 'Unknown error'}`)
        setLocalTransactions(transactions)
      }
    } catch (error) {
      console.error('Error updating other fees description:', error)
      alert(`Error updating other fees description: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLocalTransactions(transactions)
    }
  }

  const handleUpdateAmountDescription = async (transactionId: string, description: string | null) => {
    // Optimistically update local state immediately for instant UI feedback
    setLocalTransactions(prev =>
      prev.map(t =>
        t.id === transactionId
          ? { ...t, amountDescription: description }
          : t
      )
    )

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
        if (onRefreshTransactions && isMountedRef.current) {
          Promise.resolve().then(() => {
            if (isMountedRef.current && onRefreshTransactions) {
              onRefreshTransactions()
            }
          })
        }
      } else {
        console.error('Error updating amount description:', data.error)
        alert(`Error updating amount description: ${data.error || 'Unknown error'}`)
        setLocalTransactions(transactions)
      }
    } catch (error) {
      console.error('Error updating amount description:', error)
      alert(`Error updating amount description: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLocalTransactions(transactions)
    }
  }

  const handleUpdateFeeDescription = async (transactionId: string, description: string | null) => {
    // Optimistically update local state immediately
    setLocalTransactions(prev =>
      prev.map(t =>
        t.id === transactionId
          ? { ...t, feeDescription: description }
          : t
      )
    )

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
        if (onRefreshTransactions && isMountedRef.current) {
          Promise.resolve().then(() => {
            if (isMountedRef.current && onRefreshTransactions) {
              onRefreshTransactions()
            }
          })
        }
      } else {
        console.error('Error updating fee description:', data.error)
        alert(`Error updating fee description: ${data.error || 'Unknown error'}`)
        setLocalTransactions(transactions)
      }
    } catch (error) {
      console.error('Error updating fee description:', error)
      alert(`Error updating fee description: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLocalTransactions(transactions)
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
        safeRefreshTransactions()
      } else {
        console.error('Error merging transactions:', data.error)
        throw new Error(data.error || 'Failed to merge transactions')
      }
    } catch (error) {
      console.error('Error merging transactions:', error)
      throw error
    }
  }

  // Compute unique adjustment reasons for filter dropdown
  const adjustmentReasonOptions = useMemo(() => {
    const reasons = new Set<string>()
    localTransactions.forEach(t => {
      if (t.adjustmentReason) reasons.add(t.adjustmentReason)
    })
    return [...reasons].sort()
  }, [localTransactions])

  // Compute unique type values for filter dropdown
  const typeOptions = useMemo(() => {
    const types = new Set<string>()
    localTransactions.forEach(t => {
      if (t.type) types.add(t.type)
    })
    return [...types].sort()
  }, [localTransactions])

  // --- Filtered transactions for the table ---

  const getFilteredTransactions = () => {
    let filtered = localTransactions as TransactionItem[]

    // Apply search filter if search term exists
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(t => {
        const orderName = (t.order_name || '').toLowerCase()
        const orderId = (t.source_order_id || '').toLowerCase()
        const amount = String(t.amount || 0).toLowerCase()
        const fee = String(t.fee || 0).toLowerCase()
        const net = String(t.net || 0).toLowerCase()
        const type = (t.type || '').toLowerCase()
        const netsuiteTransactionName = (t.netsuiteTransactionName || '').toLowerCase()
        const netsuiteTransactionId = (t.netsuiteTransactionId || '').toLowerCase()
        const txCurrency = (t.currency || '').toLowerCase()

        return orderName.includes(searchLower) ||
               orderId.includes(searchLower) ||
               amount.includes(searchLower) ||
               fee.includes(searchLower) ||
               net.includes(searchLower) ||
               type.includes(searchLower) ||
               netsuiteTransactionName.includes(searchLower) ||
               netsuiteTransactionId.includes(searchLower) ||
               txCurrency.includes(searchLower)
      })
    }

    // Apply web/non-web order filter
    if (webOrderFilter !== 'all') {
      filtered = filtered.filter(t => {
        let isWebOrder: boolean

        if (t.is_web_order === true) {
          isWebOrder = true
        } else if (t.is_web_order === false) {
          isWebOrder = false
        } else {
          isWebOrder = t.source_name === 'web' || t.source_name === 'checkout'
        }

        if (webOrderFilter === 'web') {
          return isWebOrder === true
        } else if (webOrderFilter === 'non-web') {
          return isWebOrder === false
        }
        return true
      })
    }

    // Apply adjustment reason filter
    if (adjustmentReasonFilter !== 'all') {
      filtered = filtered.filter(t => t.adjustmentReason === adjustmentReasonFilter)
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => t.type === typeFilter)
    }

    // When filterMissingCashSale is checked, show all transactions for Order IDs
    // that have at least one problematic transaction
    if (filterMissingCashSale) {
      const problematicOrderIds = new Set<string>()
      filtered.forEach(t => {
        if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
          problematicOrderIds.add(t.source_order_id)
        }
      })

      if (problematicOrderIds.size === 0) {
        return []
      }

      return filtered.filter(t =>
        t.source_order_id &&
        t.source_order_id !== 'N/A' &&
        problematicOrderIds.has(t.source_order_id)
      )
    }

    // Return filtered transactions (search already applied)
    return filtered.map(t => ({
      ...t,
      amount: typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount,
      fee: typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee,
      net: typeof t.net === 'string' ? parseFloat(t.net) : t.net,
    }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle>
            Transactions for Payout #{payoutId || ''}
          </DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuditLogOpen(true)}
            className="flex items-center gap-1.5"
          >
            <ClipboardList className="h-4 w-4" />
            Activity Log
          </Button>
        </DialogHeader>

        {/* Summary Totals */}
        <TransactionSummary
          totalCharges={totalCharges}
          totalRefunds={totalRefunds}
          totalAdjustments={totalAdjustments}
          totalMarketplaceSalesTax={totalMarketplaceSalesTax}
          totalFees={totalFees}
          totalShopifyAmount={totalShopifyAmount}
          nsCharges={nsCharges}
          nsRefunds={nsRefunds}
          nsAdjustments={nsAdjustments}
          nsFees={nsFees}
          totalNetSuiteAmount={totalNetSuiteAmount}
          currency={currency}
          hideSensitiveData={hideSensitiveData}
          groupedFeeItems={groupedFeeItems}
          includedTransactionsForNetSuite={includedTransactionsForNetSuite}
          transactionsWithNS={transactionsWithNS}
        />

        {/* Tax adjustment helper notice */}
        {(() => {
          const taxAdjustments = localTransactions.filter(t => t.adjustmentReason === 'tax_adjustment')
          if (taxAdjustments.length === 0) return null
          const totalTaxAdj = taxAdjustments.reduce((sum, t) => {
            const amt = typeof t.amount === 'string' ? parseFloat(t.amount) : (t.amount || 0)
            return sum + amt
          }, 0)
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div className="font-semibold text-amber-900 mb-1">
                {taxAdjustments.length} tax adjustment{taxAdjustments.length !== 1 ? 's' : ''} ({currency} {totalTaxAdj.toFixed(2)})
              </div>
              <p className="text-amber-800">
                These are marketplace tax deductions (Shopify collected and remitted tax on behalf of the seller).
                They should be mapped to a marketplace tax GL account in your deposit.
              </p>
              <p className="text-amber-700 mt-1 text-xs">
                If the related cash sale in NetSuite already has tax calculated (created before the &quot;Taxable in NS&quot; source mapping was configured),
                you may need to: delete the cash sale in NS, set the order source to non-taxable in Settings &gt; Order Source Mappings,
                then re-push the order to create a tax-free cash sale.
              </p>
            </div>
          )
        })()}

        {/* Filters + Action buttons */}
        <TransactionFilters
          filterMissingCashSale={filterMissingCashSale}
          setFilterMissingCashSale={setFilterMissingCashSale}
          webOrderFilter={webOrderFilter}
          setWebOrderFilter={setWebOrderFilter}
          adjustmentReasonFilter={adjustmentReasonFilter}
          setAdjustmentReasonFilter={setAdjustmentReasonFilter}
          adjustmentReasonOptions={adjustmentReasonOptions}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          typeOptions={typeOptions}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          calculateFilterCounts={calculateFilterCounts}
          missingOrderIdsCount={missingOrderIds.length}
          missingNSTransactionsCount={missingNSTransactions.length}
          isImporting={isImporting}
          isFetchingNS={isFetchingNS}
          importProgress={importProgress}
          onImportMissingOrders={handleImportMissingOrders}
          onFetchMissingNSTransactions={handleFetchMissingNSTransactions}
        />

        {/* Transactions Table */}
        <div className="mt-4 space-y-4">
          <TransactionsTable
            key={`transactions-${payoutId}`}
            orderSourceMappings={orderSourceMappings}
            transactions={getFilteredTransactions() as any}
            isLoading={isLoading}
            hasActiveFilters={webOrderFilter !== 'all' || adjustmentReasonFilter !== 'all' || typeFilter !== 'all' || filterMissingCashSale || searchTerm.trim().length > 0}
            hideSensitiveData={hideSensitiveData}
            onDeleteNetSuiteId={handleDeleteNetSuiteId}
            onToggleInclude={handleToggleInclude}
            onReassignNetSuite={handleReassignNetSuite}
            onAddNetSuite={handleAddNetSuite}
            onUpdateOtherFeesDescription={handleUpdateOtherFeesDescription}
            onUpdateAmountDescription={handleUpdateAmountDescription}
            onUpdateFeeDescription={handleUpdateFeeDescription}
            onMergeTransactions={handleMergeTransactions}
            onSplitTransaction={(transaction) => {
              setSelectedTransactionForSplit(transaction as any)
              setSplitDialogOpen(true)
            }}
            onProcessMarketplaceOrder={(transaction) => {
              setSelectedMarketplaceTransaction(transaction as any)
              setMarketplaceDialogOpen(true)
            }}
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

      <AuditLogDialog
        isOpen={auditLogOpen}
        onClose={() => setAuditLogOpen(false)}
        payoutId={payoutId}
      />

      <SplitTransactionDialog
        isOpen={splitDialogOpen}
        onClose={() => {
          setSplitDialogOpen(false)
          setSelectedTransactionForSplit(null)
        }}
        transaction={selectedTransactionForSplit ? {
          id: selectedTransactionForSplit.id,
          source_order_id: selectedTransactionForSplit.source_order_id,
          order_name: selectedTransactionForSplit.order_name,
          amount: typeof selectedTransactionForSplit.amount === 'string'
            ? parseFloat(selectedTransactionForSplit.amount)
            : selectedTransactionForSplit.amount || 0,
          fee: typeof selectedTransactionForSplit.fee === 'string'
            ? parseFloat(selectedTransactionForSplit.fee)
            : selectedTransactionForSplit.fee || 0,
          net: typeof selectedTransactionForSplit.net === 'string'
            ? parseFloat(selectedTransactionForSplit.net)
            : selectedTransactionForSplit.net || 0,
          type: selectedTransactionForSplit.type,
          currency: selectedTransactionForSplit.currency || 'USD',
          children: selectedTransactionForSplit.children,
        } : null}
        onSaved={() => {
          if (onRefreshTransactions) onRefreshTransactions()
        }}
      />

      <MarketplaceOrderDialog
        isOpen={marketplaceDialogOpen}
        onClose={() => {
          setMarketplaceDialogOpen(false)
          setSelectedMarketplaceTransaction(null)
        }}
        transaction={selectedMarketplaceTransaction ? {
          id: selectedMarketplaceTransaction.id,
          source_order_id: selectedMarketplaceTransaction.source_order_id,
          order_name: selectedMarketplaceTransaction.order_name || null,
          amount: typeof selectedMarketplaceTransaction.amount === 'string'
            ? parseFloat(selectedMarketplaceTransaction.amount)
            : selectedMarketplaceTransaction.amount || 0,
          fee: typeof selectedMarketplaceTransaction.fee === 'string'
            ? parseFloat(selectedMarketplaceTransaction.fee)
            : selectedMarketplaceTransaction.fee || 0,
          net: typeof selectedMarketplaceTransaction.net === 'string'
            ? parseFloat(selectedMarketplaceTransaction.net)
            : selectedMarketplaceTransaction.net || 0,
          type: selectedMarketplaceTransaction.type,
          currency: selectedMarketplaceTransaction.currency || 'USD',
          processedAt: selectedMarketplaceTransaction.processedAt,
        } : null}
        onComplete={() => {
          console.log('🏪 MarketplaceOrderDialog onComplete fired, calling safeRefreshTransactions')
          safeRefreshTransactions()
        }}
      />
    </Dialog>
  )
}
