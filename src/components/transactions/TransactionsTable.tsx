import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, GitMerge } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import React, { useState, useEffect } from "react"
import { MergeTransactionsDialog } from "@/components/MergeTransactionsDialog"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
} from "@dnd-kit/core"
import type { Transaction, DisplayTransaction, TransactionsTableProps, FeesDescriptionOption } from "./types"
import { useDragDropTransactions } from "./useDragDropTransactions"
import { TransactionRow } from "./TransactionRow"

export function TransactionsTable({
  transactions,
  isLoading,
  hideSensitiveData = false,
  orderSourceMappings = [],
  onDeleteNetSuiteId,
  onReassignNetSuite,
  onAddNetSuite,
  onUpdateOtherFeesDescription,
  onUpdateAmountDescription,
  onUpdateFeeDescription,
  onToggleInclude,
  onMergeTransactions,
  onSplitTransaction,
  onProcessMarketplaceOrder
}: TransactionsTableProps) {

  // Helper function to get friendly name for order source
  const getOrderSourceDisplayName = (transaction: Transaction): string => {
    if (orderSourceMappings.length > 0) {
      const mapping = orderSourceMappings.find(m =>
        m.isActive && (
          (transaction.app_id && m.appId === transaction.app_id) ||
          (transaction.source_name && m.sourceName === transaction.source_name)
        )
      )

      if (mapping) {
        return mapping.friendlyName
      }
    }

    if (transaction.is_web_order) {
      return 'Web'
    }

    if (transaction.source_name) {
      if (transaction.source_name === 'checkout') {
        return 'Checkout'
      }
      return transaction.source_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }

    if (transaction.app_id) {
      return `App (${transaction.app_id})`
    }

    return '\u2014'
  }

  const {
    activeId,
    draggedTransactionId,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  } = useDragDropTransactions(transactions, onReassignNetSuite)

  const [feesDescriptionOptions, setFeesDescriptionOptions] = useState<FeesDescriptionOption[]>([])
  const [loadingFeesOptions, setLoadingFeesOptions] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set())
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set())

  // Fetch fees description options from payout mappings
  useEffect(() => {
    const fetchFeesOptions = async () => {
      setLoadingFeesOptions(true)
      try {
        const response = await fetch('/api/mappings/payout-mappings')
        const data = await response.json()
        console.log('Fees description API response:', data)
        if (data.success && data.data) {
          const allMappings = Array.isArray(data.data) ? data.data : []

          const allFeesOptions: FeesDescriptionOption[] = []

          const excludedTypes = ['deposit_account', 'fees_account']

          allMappings.forEach((mapping: any) => {
            const mappingType = (mapping.mappingType || '').toLowerCase()
            if (!excludedTypes.includes(mappingType) && mapping.isActive !== false) {
              allFeesOptions.push({
                id: mapping.id,
                netsuiteId: mapping.netsuiteId || '',
                description: mapping.description || null
              })
            }
          })

          console.log('Setting fees description options:', allFeesOptions)
          setFeesDescriptionOptions(allFeesOptions)
        } else {
          console.warn('No fees_description in API response:', data)
        }
      } catch (error) {
        console.error('Error fetching fees description options:', error)
      } finally {
        setLoadingFeesOptions(false)
      }
    }
    fetchFeesOptions()
  }, [])

  // Helper function to check if transaction is cash sale or cash refund
  const isCashSaleOrRefund = (transaction: Transaction): boolean => {
    if (!transaction.netsuiteTransactionName) return false
    const name = transaction.netsuiteTransactionName.toUpperCase()
    return name.startsWith('CS') ||
           name.startsWith('RFND') ||
           name.includes('CASH SALE') ||
           name.includes('CASH REFUND')
  }

  // Group transactions by shopifyOrderId
  const groupedTransactions = new Map<string, Transaction[]>()
  const ungroupedTransactions: Transaction[] = []

  transactions.forEach((txn) => {
    if (txn.source_order_id && txn.source_order_id !== 'N/A') {
      if (!groupedTransactions.has(txn.source_order_id)) {
        groupedTransactions.set(txn.source_order_id, [])
      }
      groupedTransactions.get(txn.source_order_id)!.push(txn)
    } else {
      ungroupedTransactions.push(txn)
    }
  })

  // Find orders with multiple transactions
  const multiTransactionOrders = Array.from(groupedTransactions.entries())
    .filter(([_, txns]) => txns.length > 1)
    .map(([orderId, txns]) => ({ orderId, txns }))

  // Flatten grouped transactions for display
  const displayTransactions: DisplayTransaction[] = []

  groupedTransactions.forEach((txns) => {
    txns.forEach((txn, index) => {
      displayTransactions.push({
        ...txn,
        isGrouped: txns.length > 1,
        groupSize: txns.length,
        groupIndex: index,
      })
    })
  })

  ungroupedTransactions.forEach((txn) => {
    displayTransactions.push(txn)
  })

  // Pagination calculations
  const totalTransactions = displayTransactions.length
  const totalPages = Math.ceil(totalTransactions / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTransactions = displayTransactions.slice(startIndex, endIndex)

  // Reset to page 1 if current page is out of bounds
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions found for this payout.
      </div>
    )
  }

  const activeTransaction = activeId
    ? transactions.find(t => `netsuite-${t.id}` === activeId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="rounded-md border">
        {selectedTransactionIds.size >= 2 && (
          <div className="p-3 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <GitMerge className="h-4 w-4" />
                <span>
                  {selectedTransactionIds.size} transaction{selectedTransactionIds.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <Button
                onClick={() => setShowMergeDialog(true)}
                size="sm"
                className="flex items-center gap-2"
              >
                <GitMerge className="h-4 w-4" />
                Merge Selected
              </Button>
            </div>
          </div>
        )}
        {multiTransactionOrders.length > 0 && (
          <div className="p-3 bg-yellow-50 border-b border-yellow-200">
            <div className="flex items-center gap-2 text-sm text-yellow-800">
              <Users className="h-4 w-4" />
              <span>
                {multiTransactionOrders.length} order{multiTransactionOrders.length !== 1 ? 's' : ''} with multiple transactions detected.
                Use the &quot;Ignore&quot; option in dropdowns to exclude transactions from NetSuite matching.
              </span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedTransactionIds.size === transactions.length && transactions.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedTransactionIds(new Set(transactions.map(t => t.id)))
                  } else {
                    setSelectedTransactionIds(new Set())
                  }
                }}
              />
            </TableHead>
            <TableHead>Transaction ID</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Order Name</TableHead>
            <TableHead>Order Source</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Adjustment Reason</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Net</TableHead>
            <TableHead>NetSuite Amount</TableHead>
            <TableHead>NetSuite ID</TableHead>
            <TableHead>Processed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedTransactions.map((transaction, idx) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              idx={idx}
              groupedTransactions={groupedTransactions}
              draggedTransactionId={draggedTransactionId}
              hideSensitiveData={hideSensitiveData}
              orderSourceMappings={orderSourceMappings}
              feesDescriptionOptions={feesDescriptionOptions}
              loadingFeesOptions={loadingFeesOptions}
              selectedTransactionIds={selectedTransactionIds}
              expandedSplits={expandedSplits}
              getOrderSourceDisplayName={getOrderSourceDisplayName}
              isCashSaleOrRefund={isCashSaleOrRefund}
              onSelectTransaction={(transactionId, checked) => {
                const newSelected = new Set(selectedTransactionIds)
                if (checked) {
                  newSelected.add(transactionId)
                } else {
                  newSelected.delete(transactionId)
                }
                setSelectedTransactionIds(newSelected)
              }}
              onToggleExpandSplit={(transactionId) => {
                setExpandedSplits(prev => {
                  const next = new Set(prev)
                  if (next.has(transactionId)) next.delete(transactionId)
                  else next.add(transactionId)
                  return next
                })
              }}
              onDeleteNetSuiteId={onDeleteNetSuiteId}
              onAddNetSuite={onAddNetSuite}
              onUpdateAmountDescription={onUpdateAmountDescription}
              onToggleInclude={onToggleInclude}
              onSplitTransaction={onSplitTransaction}
              onProcessMarketplaceOrder={onProcessMarketplaceOrder}
            />
          ))}
        </TableBody>
      </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalTransactions > itemsPerPage && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600">
              Showing {startIndex + 1} &ndash; {Math.min(endIndex, totalTransactions)} of {totalTransactions} transactions
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Rows per page:</span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              &laquo;&laquo;
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              &laquo;
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 7) {
                  pageNum = i + 1
                } else if (currentPage <= 4) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i
                } else {
                  pageNum = currentPage - 3 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="min-w-[40px]"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              &raquo;
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              &raquo;&raquo;
            </Button>
          </div>
        </div>
      )}
      <DragOverlay>
        {activeTransaction && activeTransaction.netsuiteTransactionName ? (
          <div className="px-3 py-2 bg-white border-2 border-blue-400 rounded-lg shadow-lg">
            <div className="text-sm font-medium text-blue-600">
              {activeTransaction.netsuiteTransactionName}
            </div>
            <div className="text-xs text-muted-foreground">
              Drag to reassign
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {onMergeTransactions && (
        <MergeTransactionsDialog
          isOpen={showMergeDialog}
          onClose={() => {
            setShowMergeDialog(false)
            setSelectedTransactionIds(new Set())
          }}
          transactions={transactions}
          selectedTransactionIds={Array.from(selectedTransactionIds)}
          onMerge={async (sourceTransactionIds, targetTransactionId) => {
            await onMergeTransactions(sourceTransactionIds, targetTransactionId)
            setSelectedTransactionIds(new Set())
            setShowMergeDialog(false)
          }}
        />
      )}
    </DndContext>
  )
}
