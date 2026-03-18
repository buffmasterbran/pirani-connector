"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Download, Loader2, Database, Search, Pencil, Store } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { FilterCounts } from "./useTransactionData"

interface TransactionFiltersProps {
  // Filter state
  filterMissingCashSale: boolean
  setFilterMissingCashSale: (value: boolean) => void
  webOrderFilter: 'all' | 'web' | 'non-web'
  setWebOrderFilter: (value: 'all' | 'web' | 'non-web') => void
  adjustmentReasonFilter: string
  setAdjustmentReasonFilter: (value: string) => void
  adjustmentReasonOptions: string[]
  typeFilter: string
  setTypeFilter: (value: string) => void
  typeOptions: string[]
  searchTerm: string
  setSearchTerm: (value: string) => void

  // Counts
  calculateFilterCounts: FilterCounts
  missingOrderIdsCount: number
  missingNSTransactionsCount: number

  // Loading states
  isImporting: boolean
  isFetchingNS: boolean
  importProgress: { imported: number; total: number } | null

  // Auto-process
  editedOrderCount: number
  marketplaceOrderCount: number
  isAutoProcessing: boolean
  onAutoProcessEdited: () => void
  onAutoProcessMarketplace: () => void

  // Handlers
  onImportMissingOrders: () => void
  onFetchMissingNSTransactions: () => void
}

export function TransactionFilters({
  filterMissingCashSale,
  setFilterMissingCashSale,
  webOrderFilter,
  setWebOrderFilter,
  adjustmentReasonFilter,
  setAdjustmentReasonFilter,
  adjustmentReasonOptions,
  typeFilter,
  setTypeFilter,
  typeOptions,
  searchTerm,
  setSearchTerm,
  calculateFilterCounts,
  missingOrderIdsCount,
  missingNSTransactionsCount,
  editedOrderCount,
  marketplaceOrderCount,
  isAutoProcessing,
  onAutoProcessEdited,
  onAutoProcessMarketplace,
  isImporting,
  isFetchingNS,
  importProgress,
  onImportMissingOrders,
  onFetchMissingNSTransactions,
}: TransactionFiltersProps) {
  // Auto-reset filters if they would result in 0 transactions
  // Use a ref to track if we've already reset to prevent infinite loops
  // Skip auto-reset if there's an active search term (user might be filtering)
  const hasResetFiltersRef = useRef(false)
  useEffect(() => {
    // Don't auto-reset filters if user is actively searching
    if (searchTerm.trim().length > 0) {
      return
    }

    if (missingOrderIdsCount === 0 && missingNSTransactionsCount === 0 &&
        calculateFilterCounts.webOrdersCount === 0 && calculateFilterCounts.nonWebOrdersCount === 0) {
      if (filterMissingCashSale || webOrderFilter !== 'all') {
        setFilterMissingCashSale(false)
        setWebOrderFilter('all')
      }
      hasResetFiltersRef.current = false
      return
    }

    // Check if current filter combination would result in 0 transactions
    let wouldBeEmpty = false

    if (webOrderFilter === 'web') {
      if (filterMissingCashSale) {
        wouldBeEmpty = calculateFilterCounts.problematicWebOrdersCount === 0
      } else {
        wouldBeEmpty = calculateFilterCounts.webOrdersCount === 0
      }
    } else if (webOrderFilter === 'non-web') {
      if (filterMissingCashSale) {
        wouldBeEmpty = calculateFilterCounts.problematicNonWebOrdersCount === 0
      } else {
        wouldBeEmpty = calculateFilterCounts.nonWebOrdersCount === 0
      }
    } else {
      if (filterMissingCashSale) {
        wouldBeEmpty = calculateFilterCounts.problematicOrdersCount === 0
      }
    }

    if (wouldBeEmpty && !hasResetFiltersRef.current) {
      // Reset filters to prevent 0 results
      hasResetFiltersRef.current = true
      setFilterMissingCashSale(false)
      setWebOrderFilter('all')
      // Reset the flag after a short delay to allow for future resets if needed
      setTimeout(() => {
        hasResetFiltersRef.current = false
      }, 100)
    } else if (!wouldBeEmpty) {
      hasResetFiltersRef.current = false
    }
  }, [webOrderFilter, filterMissingCashSale, calculateFilterCounts, searchTerm, missingOrderIdsCount, missingNSTransactionsCount, setFilterMissingCashSale, setWebOrderFilter])

  return (
    <>
      <div className="mt-4 space-y-2">
        {missingOrderIdsCount > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {missingOrderIdsCount} order{missingOrderIdsCount !== 1 ? 's' : ''} missing from database
              </p>
              {importProgress && (
                <p className="text-sm font-medium text-blue-600">
                  {importProgress.imported} / {importProgress.total} imported
                </p>
              )}
            </div>
            <Button
              onClick={onImportMissingOrders}
              disabled={isImporting}
              size="sm"
              className="flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {importProgress ? `Importing... ${importProgress.imported}/${importProgress.total}` : 'Importing...'}
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
            {missingNSTransactionsCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {missingNSTransactionsCount} transaction{missingNSTransactionsCount !== 1 ? 's' : ''} missing NetSuite IDs
              </p>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-missing-cash-sale"
                checked={filterMissingCashSale}
                disabled={
                  calculateFilterCounts.problematicOrdersCount === 0 ||
                  (webOrderFilter === 'web' && calculateFilterCounts.problematicWebOrdersCount === 0) ||
                  (webOrderFilter === 'non-web' && calculateFilterCounts.problematicNonWebOrdersCount === 0)
                }
                onCheckedChange={(checked) => {
                  const newValue = checked === true
                  // Check if this would result in 0 transactions
                  let wouldBeEmpty = false
                  if (webOrderFilter === 'web') {
                    wouldBeEmpty = newValue && calculateFilterCounts.problematicWebOrdersCount === 0
                  } else if (webOrderFilter === 'non-web') {
                    wouldBeEmpty = newValue && calculateFilterCounts.problematicNonWebOrdersCount === 0
                  } else {
                    wouldBeEmpty = newValue && calculateFilterCounts.problematicOrdersCount === 0
                  }
                  if (!wouldBeEmpty) {
                    setFilterMissingCashSale(newValue)
                  }
                }}
              />
              <label
                htmlFor="filter-missing-cash-sale"
                className={`text-sm font-medium leading-none ${
                  (calculateFilterCounts.problematicOrdersCount === 0 ||
                   (webOrderFilter === 'web' && calculateFilterCounts.problematicWebOrdersCount === 0) ||
                   (webOrderFilter === 'non-web' && calculateFilterCounts.problematicNonWebOrdersCount === 0))
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer'
                }`}
              >
                Orders with Issues
                {calculateFilterCounts.problematicOrdersCount === 0 && webOrderFilter === 'all' && (
                  <span className="text-xs text-muted-foreground ml-1">(0)</span>
                )}
                {webOrderFilter === 'web' && calculateFilterCounts.problematicWebOrdersCount === 0 && (
                  <span className="text-xs text-muted-foreground ml-1">(0)</span>
                )}
                {webOrderFilter === 'non-web' && calculateFilterCounts.problematicNonWebOrdersCount === 0 && (
                  <span className="text-xs text-muted-foreground ml-1">(0)</span>
                )}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="web-order-filter" className="text-sm font-medium">
                Order Source:
              </label>
              <select
                id="web-order-filter"
                value={webOrderFilter}
                onChange={(e) => {
                  const newValue = e.target.value as 'all' | 'web' | 'non-web'
                  // Check if this would result in 0 transactions
                  let wouldBeEmpty = false
                  if (newValue === 'web') {
                    wouldBeEmpty = filterMissingCashSale
                      ? calculateFilterCounts.problematicWebOrdersCount === 0
                      : calculateFilterCounts.webOrdersCount === 0
                  } else if (newValue === 'non-web') {
                    wouldBeEmpty = filterMissingCashSale
                      ? calculateFilterCounts.problematicNonWebOrdersCount === 0
                      : calculateFilterCounts.nonWebOrdersCount === 0
                  }
                  if (!wouldBeEmpty) {
                    setWebOrderFilter(newValue)
                  }
                }}
                className="px-2 py-1 text-sm border rounded-md"
              >
                <option value="all">All Orders</option>
                <option
                  value="web"
                  disabled={filterMissingCashSale
                    ? calculateFilterCounts.problematicWebOrdersCount === 0
                    : calculateFilterCounts.webOrdersCount === 0}
                >
                  Web Orders {filterMissingCashSale
                    ? `(${calculateFilterCounts.problematicWebOrdersCount})`
                    : `(${calculateFilterCounts.webOrdersCount})`}
                </option>
                <option
                  value="non-web"
                  disabled={filterMissingCashSale
                    ? calculateFilterCounts.problematicNonWebOrdersCount === 0
                    : calculateFilterCounts.nonWebOrdersCount === 0}
                >
                  Non-Web Orders {filterMissingCashSale
                    ? `(${calculateFilterCounts.problematicNonWebOrdersCount})`
                    : `(${calculateFilterCounts.nonWebOrdersCount})`}
                </option>
              </select>
            </div>
            {typeOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="type-filter" className="text-sm font-medium">
                  Type:
                </label>
                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-2 py-1 text-sm border rounded-md"
                >
                  <option value="all">All Types</option>
                  {typeOptions.map(type => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {adjustmentReasonOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="adjustment-reason-filter" className="text-sm font-medium">
                  Adjustment:
                </label>
                <select
                  id="adjustment-reason-filter"
                  value={adjustmentReasonFilter}
                  onChange={(e) => setAdjustmentReasonFilter(e.target.value)}
                  className="px-2 py-1 text-sm border rounded-md"
                >
                  <option value="all">All Types</option>
                  {adjustmentReasonOptions.map(reason => (
                    <option key={reason} value={reason}>
                      {reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {missingNSTransactionsCount > 0 && (
              <Button
                onClick={() => {
                  if (window.confirm(`Sync ${missingNSTransactionsCount} missing NetSuite transactions? This may take a moment.`)) {
                    onFetchMissingNSTransactions?.()
                  }
                }}
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
            {editedOrderCount > 0 && (
              <Button
                onClick={onAutoProcessEdited}
                disabled={isAutoProcessing}
                size="sm"
                variant="outline"
                className="flex items-center gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Pencil className="h-4 w-4" />
                Process Edited Orders ({editedOrderCount})
              </Button>
            )}
            {marketplaceOrderCount > 0 && (
              <Button
                onClick={onAutoProcessMarketplace}
                disabled={isAutoProcessing}
                size="sm"
                variant="outline"
                className="flex items-center gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Store className="h-4 w-4" />
                Process Shop Cash ({marketplaceOrderCount})
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions by order name, order ID, amount, type, or NetSuite transaction..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="h-9"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
