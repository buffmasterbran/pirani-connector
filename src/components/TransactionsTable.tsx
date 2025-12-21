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
import { Trash2, Users, GripVertical, Plus, GitMerge } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { safeFormatDate } from "@/lib/dateUtils"
import { useState, type ReactNode, useEffect } from "react"
import { MergeTransactionsDialog } from "@/components/MergeTransactionsDialog"
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"

interface Transaction {
  id: string
  source_order_id: string
  order_name?: string | null
  source_name?: string | null
  app_id?: number | null
  is_web_order?: boolean
  amount: number
  fee: number
  net: number
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
}

interface OrderSourceMapping {
  id: number
  appId: number | null
  sourceName: string | null
  friendlyName: string
  isActive: boolean
}

interface TransactionsTableProps {
  transactions: Transaction[]
  isLoading?: boolean
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
}

// Helper function to get NetSuite URL based on transaction type
function getNetSuiteUrl(transactionId: string, transactionType: string | undefined, netsuiteTransactionName?: string | null): string {
  const baseUrl = 'https://7913744.app.netsuite.com/app/accounting/transactions'
  
  // Prioritize NetSuite transaction name for transaction type detection (more reliable)
  // Check NetSuite transaction name first - this is the most reliable indicator
  const netsuiteNameUpper = (netsuiteTransactionName || '').toUpperCase().trim()
  
  // Check for refund indicators
  const isRefundByName = netsuiteNameUpper.startsWith('RFND') || 
                         netsuiteNameUpper.includes('CASH REFUND') ||
                         netsuiteNameUpper.includes('REFUND')
  
  // Check for payment indicators (common payment transaction IDs/names)
  const isPaymentByName = netsuiteNameUpper.startsWith('CUSTPYMT') ||
                         netsuiteNameUpper.startsWith('PYMT') ||
                         netsuiteNameUpper.includes('CUSTOMER PAYMENT') ||
                         netsuiteNameUpper.includes('PAYMENT')
  
  // Also check transaction type as fallback (handle undefined/empty)
  const transactionTypeLower = (transactionType || '').toLowerCase().trim()
  const isRefundByType = transactionTypeLower === 'refund'
  const isPaymentByType = transactionTypeLower === 'payment' || transactionTypeLower === 'custpymt'
  
  // Determine endpoint based on transaction type
  // Priority: Payment > Refund > Cash Sale (default)
  if (isPaymentByName || isPaymentByType) {
    return `${baseUrl}/custpymt.nl?id=${transactionId}`
  } else if (isRefundByName || isRefundByType) {
    return `${baseUrl}/cashrfnd.nl?id=${transactionId}`
  } else {
    return `${baseUrl}/cashsale.nl?id=${transactionId}`
  }
}

// Draggable NetSuite ID component
function DraggableNetSuiteId({ 
  transaction, 
  onDeleteNetSuiteId 
}: { 
  transaction: Transaction
  onDeleteNetSuiteId?: (transactionId: string) => void 
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `netsuite-${transaction.id}`,
    data: {
      type: 'netsuite-id',
      transactionId: transaction.id,
      netsuiteId: transaction.netsuiteTransactionId,
      netsuiteName: transaction.netsuiteTransactionName,
    },
  })

  return (
    <div 
      ref={setNodeRef} 
      className={`flex items-center gap-1 ${isDragging ? 'opacity-30' : ''}`}
      {...(transaction.netsuiteTransactionId ? { ...attributes, ...listeners } : {})}
    >
      {transaction.amountMismatch ? (
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            {transaction.netsuiteTransactionName && transaction.netsuiteTransactionId ? (
              <a
                href={getNetSuiteUrl(transaction.netsuiteTransactionId!, transaction.type, transaction.netsuiteTransactionName)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-red-600 hover:text-red-800 hover:underline"
                title={`View ${transaction.netsuiteTransactionName} in NetSuite`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {transaction.netsuiteTransactionName}
              </a>
            ) : transaction.netsuiteTransactionName ? (
              <div className="text-sm font-medium text-red-600">
                {transaction.netsuiteTransactionName}
              </div>
            ) : null}
            {transaction.netsuiteTransactionId && onDeleteNetSuiteId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDeleteNetSuiteId(transaction.id)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Delete NetSuite transaction ID"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="text-xs text-red-600">
            Amount mismatch!
          </div>
          {transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined && (
            <div className="text-xs text-muted-foreground">
              NS: {transaction.currency} {Math.abs(transaction.netsuiteAmount).toFixed(2)}
            </div>
          )}
        </div>
      ) : transaction.netsuiteTransactionName ? (
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            {transaction.netsuiteTransactionId ? (
              <a
                href={getNetSuiteUrl(transaction.netsuiteTransactionId!, transaction.type, transaction.netsuiteTransactionName || null)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-green-600 hover:text-green-800 hover:underline"
                title={`View ${transaction.netsuiteTransactionName} in NetSuite`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {transaction.netsuiteTransactionName}
              </a>
            ) : (
              <div className="text-sm font-medium text-green-600">
                {transaction.netsuiteTransactionName}
              </div>
            )}
            {transaction.netsuiteTransactionId && onDeleteNetSuiteId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDeleteNetSuiteId(transaction.id)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Delete NetSuite transaction ID"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          {transaction.netsuiteTransactionId && (
            <div className="text-xs text-muted-foreground">
              ID: {transaction.netsuiteTransactionId}
            </div>
          )}
        </div>
      ) : null}
      {transaction.netsuiteTransactionId && (
        <div
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none flex-shrink-0"
          title="Drag handle - drag to reassign NetSuite ID"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

// Droppable row component
function DroppableRow({ 
  transaction, 
  children,
  isDraggingOver,
  rowIndex
}: { 
  transaction: Transaction
  children: ReactNode
  isDraggingOver: boolean
  rowIndex: number
}) {
  // Ensure unique ID for each droppable
  const droppableId = `transaction-${transaction.id}`
  
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'transaction-row',
      transactionId: String(transaction.id), // Ensure it's a string
    },
    disabled: !!transaction.netsuiteTransactionId, // Can't drop if already has NetSuite ID
  })

  const isDroppable = isOver && !transaction.netsuiteTransactionId
  const isEvenRow = rowIndex % 2 === 0

  // Check if transaction is missing a cash sale
  // A transaction is missing a cash sale if it has an order_name but no netsuiteTransactionName
  // However, if any dropdown is selected OR transaction is ignored, don't highlight it in red as it's being handled/resolved
  const hasOrderName = transaction.order_name && 
                      transaction.order_name !== '—' && 
                      transaction.order_name !== 'N/A'
  const missingNetSuiteName = !transaction.netsuiteTransactionName || 
                              transaction.netsuiteTransactionName === null ||
                              transaction.netsuiteTransactionName === ''
  
  // Check if any dropdown has a selection
  const hasDropdownSelection = !!(transaction.amountDescription || 
                                  transaction.otherFeesDescription)
  
  // Check if transaction is ignored (resolved)
  const isIgnored = transaction.includeInNetSuite === false
  
  // Check if amount mismatch is actually a problem
  // For payments, recalculate mismatch using net amount instead of amount
  let isActualMismatch = transaction.amountMismatch === true
  if (isActualMismatch && transaction.netsuiteTransactionName && transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined) {
    const netsuiteNameUpper = (transaction.netsuiteTransactionName || '').toUpperCase().trim()
    const isPayment = netsuiteNameUpper.startsWith('PYMT') ||
                     netsuiteNameUpper.startsWith('CUSTPYMT') ||
                     netsuiteNameUpper.includes('PAYMENT')
    
    if (isPayment) {
      // For payments, compare net amount with NetSuite amount
      const shopifyNet = typeof transaction.net === 'string' ? parseFloat(transaction.net) : (transaction.net || 0)
      const netsuiteAmount = typeof transaction.netsuiteAmount === 'string' ? parseFloat(transaction.netsuiteAmount) : transaction.netsuiteAmount
      const actualMismatch = Math.abs(Math.abs(shopifyNet) - Math.abs(netsuiteAmount)) > 0.01
      // If amounts actually match, don't treat as mismatch
      if (!actualMismatch) isActualMismatch = false
    }
  }
  
  // Only show red highlighting if:
  // - Missing NetSuite name AND no dropdown is selected AND not ignored, OR
  // - Actual amount mismatch (not false positive for payments)
  const isMissingCashSale = (hasOrderName && missingNetSuiteName && !hasDropdownSelection && !isIgnored) || 
                            (isActualMismatch && !hasDropdownSelection && !isIgnored)

  return (
    <TableRow
      ref={setNodeRef}
      data-transaction-id={transaction.id} // Add data attribute as backup
      className={`
        ${isMissingCashSale 
          ? 'bg-red-50 border-l-4 border-red-500' 
          : transaction.includeInNetSuite === false 
            ? 'opacity-50 bg-gray-50' 
            : isEvenRow 
              ? 'bg-white' 
              : 'bg-gray-50/50'}
        ${isDroppable ? 'bg-blue-50 border-2 border-blue-400 border-dashed' : ''}
        ${isDraggingOver && !transaction.netsuiteTransactionId ? 'bg-blue-100' : ''}
        transition-colors
        ${isMissingCashSale ? 'hover:bg-red-100' : 'hover:bg-gray-100'}
      `}
    >
      {children}
    </TableRow>
  )
}

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
  onMergeTransactions
}: TransactionsTableProps) {
  
  // Helper function to get friendly name for order source
  const getOrderSourceDisplayName = (transaction: Transaction): string => {
    // First, check if there's a mapping for this app_id or source_name
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
    
    // Fallback to default display logic
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
    
    return '—'
  }
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedTransactionId, setDraggedTransactionId] = useState<string | null>(null)
  const [feesDescriptionOptions, setFeesDescriptionOptions] = useState<Array<{ id: number; netsuiteId: string; description: string | null }>>([])
  const [loadingFeesOptions, setLoadingFeesOptions] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set())
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Fetch fees description options from payout mappings
  useEffect(() => {
    const fetchFeesOptions = async () => {
      setLoadingFeesOptions(true)
      try {
        const response = await fetch('/api/mappings/payout-mappings')
        const data = await response.json()
        console.log('Fees description API response:', data)
        if (data.success && data.data) {
          // API now returns a flat array of mappings
          const allMappings = Array.isArray(data.data) ? data.data : []
          
          // Collect all mappings except deposit_account and fees_account
          // This includes fees_description, test mappings, and any other fee-related mappings
          const allFeesOptions: Array<{ id: number; netsuiteId: string; description: string | null }> = []
          
          // Exclude these account types - they're not for the "Other Fees" dropdown
          const excludedTypes = ['deposit_account', 'fees_account']
          
          allMappings.forEach((mapping: any) => {
            const mappingType = (mapping.mappingType || '').toLowerCase()
            // Include all mappings except deposit_account and fees_account
            if (!excludedTypes.includes(mappingType)) {
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
    // Check for NetSuite transaction name patterns: CS (Cash Sale), RFND (Cash Refund)
    // or explicit "Cash Sale"/"Cash Refund" text
    return name.startsWith('CS') || 
           name.startsWith('RFND') || 
           name.includes('CASH SALE') || 
           name.includes('CASH REFUND')
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Require 5px of movement before drag starts (prevents accidental drags)
      },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    const data = event.active.data.current
    if (data?.type === 'netsuite-id') {
      setDraggedTransactionId(data.transactionId)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    setActiveId(null)
    setDraggedTransactionId(null)

    if (!over || !onReassignNetSuite) return

    const activeData = active.data.current
    const overData = over.data.current
    
    // Extract transaction ID from the droppable ID (format: "transaction-{id}")
    const overId = String(over.id)
    let toTransactionId: string | null = null
    
    // Try multiple methods to get the transaction ID
    if (overData?.type === 'transaction-row' && overData.transactionId) {
      // Method 1: Use the transaction ID from the droppable data (most reliable)
      toTransactionId = String(overData.transactionId)
    } else if (overId.startsWith('transaction-')) {
      // Method 2: Extract from the ID string
      toTransactionId = overId.replace('transaction-', '')
    } else {
      // Method 3: Try to find the element and get data attribute
      const element = document.querySelector(`[data-transaction-id]`)
      if (element) {
        toTransactionId = element.getAttribute('data-transaction-id')
      }
    }
    
    if (!toTransactionId) {
      console.warn('Could not determine target transaction ID:', { 
        overId, 
        overData,
        overElement: over.id
      })
      return
    }
    
    if (
      activeData?.type === 'netsuite-id' &&
      activeData.transactionId &&
      toTransactionId &&
      activeData.transactionId !== toTransactionId
    ) {
      const fromTransactionId = activeData.transactionId

      // Check if target already has NetSuite ID
      const targetTransaction = transactions.find(t => t.id === toTransactionId)
      if (!targetTransaction) {
        console.error('Target transaction not found:', toTransactionId)
        alert(`Target transaction ${toTransactionId} not found`)
        return
      }
      
      if (targetTransaction.netsuiteTransactionId) {
        alert('Target transaction already has a NetSuite ID. Please remove it first.')
        return
      }

      if (confirm(`Reassign NetSuite ID from transaction ${fromTransactionId.slice(-8)} to transaction ${toTransactionId.slice(-8)}?`)) {
        try {
          await onReassignNetSuite(fromTransactionId, toTransactionId)
        } catch (error) {
          console.error('Error reassigning NetSuite ID:', error)
          alert(`Error reassigning NetSuite ID: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    } else {
      // Debug logging for troubleshooting
      if (process.env.NODE_ENV === 'development') {
        console.log('Drag end debug:', {
          activeId: active.id,
          overId: over.id,
          activeData,
          overData,
          toTransactionId,
          fromTransactionId: activeData?.transactionId,
          matches: activeData?.type === 'netsuite-id',
          sameTransaction: activeData?.transactionId === toTransactionId,
        })
      }
    }
  }
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
  const displayTransactions: Array<Transaction & { isGrouped?: boolean; groupSize?: number; groupIndex?: number }> = []
  
  groupedTransactions.forEach((txns, orderId) => {
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

  const activeTransaction = activeId 
    ? transactions.find(t => `netsuite-${t.id}` === activeId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setDraggedTransactionId(null)
      }}
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
                Use the "Ignore" option in dropdowns to exclude transactions from NetSuite matching.
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
          {paginatedTransactions.map((transaction, idx) => {
            const isFirstInGroup = transaction.isGrouped && transaction.groupIndex === 0
            const isLastInGroup = transaction.isGrouped && transaction.groupIndex === (transaction.groupSize! - 1)
            const showGroupIndicator = transaction.isGrouped && isFirstInGroup
            const groupTotal = transaction.isGrouped 
              ? groupedTransactions.get(transaction.source_order_id)!.reduce((sum, t) => sum + (t.net || 0), 0)
              : null
            const groupIncludedCount = transaction.isGrouped
              ? groupedTransactions.get(transaction.source_order_id)!.filter(t => t.includeInNetSuite !== false).length
              : null

            return (
              <DroppableRow
                key={transaction.id}
                transaction={transaction}
                isDraggingOver={draggedTransactionId === transaction.id}
                rowIndex={idx}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedTransactionIds.has(transaction.id)}
                    onCheckedChange={(checked) => {
                      const newSelected = new Set(selectedTransactionIds)
                      if (checked) {
                        newSelected.add(transaction.id)
                      } else {
                        newSelected.delete(transaction.id)
                      }
                      setSelectedTransactionIds(newSelected)
                    }}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {transaction.id ? `#${String(transaction.id).slice(-8)}` : 'N/A'}
                </TableCell>
              <TableCell className="font-medium">
                {transaction.source_order_id ? `#${transaction.source_order_id}` : 'N/A'}
              </TableCell>
               <TableCell>
                  {showGroupIndicator && (
                    <div className="mb-1 text-xs text-yellow-600 font-medium">
                      {transaction.groupSize} transaction{transaction.groupSize !== 1 ? 's' : ''} • 
                      Total: {transaction.currency} {groupTotal?.toFixed(2)} • 
                      Included: {groupIncludedCount}/{transaction.groupSize}
                    </div>
                  )}
                 {hideSensitiveData ? (
                   <span className="text-gray-500">••••••</span>
                  ) : transaction.source_order_id && transaction.source_order_id !== 'N/A' ? (
                    <a
                      href={`https://admin.shopify.com/store/pirani-life/orders/${transaction.source_order_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      title={`View order ${transaction.source_order_id} in Shopify`}
                    >
                      {transaction.order_name || `#${transaction.source_order_id}`}
                    </a>
                  ) : (
                    transaction.order_name || '—'
                 )}
               </TableCell>
              <TableCell>
                {(() => {
                  const displayName = getOrderSourceDisplayName(transaction)
                  const hasMapping = orderSourceMappings.some(m => 
                    m.isActive && (
                      (transaction.app_id && m.appId === transaction.app_id) ||
                      (transaction.source_name && m.sourceName === transaction.source_name)
                    )
                  )
                  
                  if (displayName === '—') {
                    return <span className="text-muted-foreground text-xs">—</span>
                  }
                  
                  // Use different colors based on whether it's a web order or has a mapping
                  const isWeb = transaction.is_web_order === true
                  const bgColor = isWeb ? 'bg-green-100 text-green-800' : (hasMapping ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')
                  
                  return (
                    <span className={`px-2 py-1 ${bgColor} rounded-full text-xs font-medium`} 
                          title={transaction.app_id ? `App ID: ${transaction.app_id}` : `Source: ${transaction.source_name || 'Unknown'}`}>
                      {displayName}
                    </span>
                  )
                })()}
              </TableCell>
              <TableCell>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {transaction.type}
                </span>
              </TableCell>
                <TableCell>
                  {transaction.adjustmentReason ? (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium" title={transaction.adjustmentReason}>
                      {transaction.adjustmentReason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              <TableCell>
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (() => {
                  const isCashSaleRefund = isCashSaleOrRefund(transaction)
                  return (
                    <div className="flex flex-col gap-1">
                      <span>{transaction.currency || 'USD'} {Number(transaction.amount).toFixed(2)}</span>
                      {!isCashSaleRefund && onUpdateAmountDescription && (
                        <Select
                          value={(() => {
                            // If transaction is ignored, show "Ignore" in dropdown
                            if (transaction.includeInNetSuite === false) return '__ignore__'
                            if (!transaction.amountDescription) return '__none__'
                            const matchingOption = feesDescriptionOptions.find(
                              opt => opt.netsuiteId === transaction.amountDescription ||
                                     opt.description === transaction.amountDescription ||
                                     (!opt.netsuiteId && opt.description === transaction.amountDescription)
                            )
                            if (matchingOption) {
                              if (matchingOption.netsuiteId && matchingOption.netsuiteId.trim() !== '') {
                                return matchingOption.netsuiteId
                              } else {
                                return `opt_${matchingOption.id}_${matchingOption.description || 'unknown'}`
                              }
                            }
                            return transaction.amountDescription
                          })()}
                          onValueChange={async (value) => {
                            if (onUpdateAmountDescription && onToggleInclude) {
                              // Handle "Ignore" option - ignore transaction and clear dropdown value
                              if (value === '__ignore__') {
                                await onToggleInclude(String(transaction.id), false)
                                await onUpdateAmountDescription(String(transaction.id), null)
                                return
                              }
                              
                              // If transaction was ignored, un-ignore it first
                              if (transaction.includeInNetSuite === false) {
                                await onToggleInclude(String(transaction.id), true)
                              }
                              
                              if (value === '__none__') {
                                await onUpdateAmountDescription(String(transaction.id), null)
                                return
                              }
                              const selectedOption = feesDescriptionOptions.find(opt => {
                                if (opt.netsuiteId && opt.netsuiteId.trim() !== '' && opt.netsuiteId === value) {
                                  return true
                                }
                                const expectedValue = `opt_${opt.id}_${opt.description || 'unknown'}`
                                if (expectedValue === value) {
                                  return true
                                }
                                return false
                              })
                              const valueToStore = selectedOption?.netsuiteId && selectedOption.netsuiteId.trim() !== '' 
                                ? selectedOption.netsuiteId 
                                : selectedOption?.description || null
                              await onUpdateAmountDescription(String(transaction.id), valueToStore)
                            }
                          }}
                          disabled={loadingFeesOptions}
                        >
                          <SelectTrigger className="h-7 w-[140px] text-xs border border-gray-300">
                            <SelectValue placeholder={loadingFeesOptions ? "Loading..." : "Select..."} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            <SelectItem value="__ignore__">Ignore</SelectItem>
                            {feesDescriptionOptions.length === 0 && !loadingFeesOptions ? (
                              <SelectItem value="__no_options__" disabled>No options available</SelectItem>
                            ) : (
                              feesDescriptionOptions.map((option) => {
                                const value = option.netsuiteId && option.netsuiteId.trim() !== '' 
                                  ? option.netsuiteId 
                                  : `opt_${option.id}_${option.description || 'unknown'}`
                                const display = option.description || option.netsuiteId || 'Unknown'
                                return (
                                  <SelectItem key={option.id} value={value}>
                                    {display}
                                  </SelectItem>
                                )
                              })
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )
                })()}
              </TableCell>
              <TableCell className="text-red-600">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  <span>-{transaction.currency || 'USD'} {Number(transaction.fee).toFixed(2)}</span>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${transaction.currency} ${Number(transaction.net).toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="font-medium">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined ? (
                  <span className={transaction.amountMismatch ? 'text-red-600' : 'text-green-600'}>
                    {transaction.currency} {transaction.netsuiteAmount.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell>
                  {hideSensitiveData ? (
                    <span className="text-gray-500">••••••</span>
                  ) : transaction.netsuiteTransactionId ? (
                    <DraggableNetSuiteId
                      transaction={transaction}
                      onDeleteNetSuiteId={onDeleteNetSuiteId}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">—</span>
                      {onAddNetSuite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => onAddNetSuite(transaction.id)}
                          title="Add NetSuite transaction"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {transaction.processedAt ? safeFormatDate(transaction.processedAt, 'MMM dd, yyyy HH:mm') : '—'}
                </TableCell>
              </DroppableRow>
            )
          })}
        </TableBody>
      </Table>
        </div>
      </div>
      
      {/* Pagination Controls */}
      {totalTransactions > itemsPerPage && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600">
              Showing {startIndex + 1} – {Math.min(endIndex, totalTransactions)} of {totalTransactions} transactions
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
              ««
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              «
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
              »
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              »»
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
