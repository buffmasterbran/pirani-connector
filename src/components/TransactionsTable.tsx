import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, Users, GripVertical, Plus } from "lucide-react"
import { safeFormatDate } from "@/lib/dateUtils"
import { useState, type ReactNode } from "react"
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
}

interface TransactionsTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  hideSensitiveData?: boolean
  onDeleteNetSuiteId?: (transactionId: string) => void
  onToggleInclude?: (transactionId: string, include: boolean) => void
  onReassignNetSuite?: (fromTransactionId: string, toTransactionId: string) => Promise<void>
  onAddNetSuite?: (transactionId: string) => void
}

// Helper function to get NetSuite URL based on transaction type
function getNetSuiteUrl(transactionId: string, transactionType: string): string {
  const isRefund = transactionType?.toLowerCase() === 'refund'
  const baseUrl = 'https://7913744.app.netsuite.com/app/accounting/transactions'
  const endpoint = isRefund ? 'transaction.nl' : 'cashsale.nl'
  return `${baseUrl}/${endpoint}?id=${transactionId}`
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
                href={getNetSuiteUrl(transaction.netsuiteTransactionId, transaction.type)}
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
                href={getNetSuiteUrl(transaction.netsuiteTransactionId, transaction.type)}
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

  return (
    <TableRow
      ref={setNodeRef}
      data-transaction-id={transaction.id} // Add data attribute as backup
      className={`
        ${transaction.includeInNetSuite === false 
          ? 'opacity-50 bg-gray-50' 
          : isEvenRow 
            ? 'bg-white' 
            : 'bg-gray-50/50'}
        ${isDroppable ? 'bg-blue-50 border-2 border-blue-400 border-dashed' : ''}
        ${isDraggingOver && !transaction.netsuiteTransactionId ? 'bg-blue-100' : ''}
        transition-colors
        hover:bg-gray-100
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
  onDeleteNetSuiteId,
  onToggleInclude,
  onReassignNetSuite,
  onAddNetSuite
}: TransactionsTableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedTransactionId, setDraggedTransactionId] = useState<string | null>(null)

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
        {multiTransactionOrders.length > 0 && (
          <div className="p-3 bg-yellow-50 border-b border-yellow-200">
            <div className="flex items-center gap-2 text-sm text-yellow-800">
              <Users className="h-4 w-4" />
              <span>
                {multiTransactionOrders.length} order{multiTransactionOrders.length !== 1 ? 's' : ''} with multiple transactions detected. 
                Use checkboxes to control which transactions are included in NetSuite matching.
              </span>
            </div>
          </div>
        )}
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Include</TableHead>
            <TableHead>Transaction ID</TableHead>
                <TableHead>Order ID</TableHead>
            <TableHead>Order Name</TableHead>
                <TableHead>Type</TableHead>
            <TableHead>Adjustment Reason</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Other Fees</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>NetSuite Amount</TableHead>
            <TableHead>NetSuite ID</TableHead>
                <TableHead>Processed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayTransactions.map((transaction, idx) => {
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
                  {onToggleInclude && (
                    <Checkbox
                      checked={transaction.includeInNetSuite !== false}
                      onCheckedChange={(checked) => {
                        const newValue = checked === true
                        onToggleInclude(transaction.id, newValue)
                      }}
                      title={transaction.includeInNetSuite === false ? 'Excluded from NetSuite matching' : 'Included in NetSuite matching'}
                    />
                  )}
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
                ) : (
                  `${transaction.currency} ${Number(transaction.amount).toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="text-red-600">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `-${transaction.currency} ${Number(transaction.fee).toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="text-red-600">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (() => {
                  // Calculate other fees: (amount - net) - fee
                  const amount = Number(transaction.amount) || 0
                  const net = Number(transaction.net) || 0
                  const fee = Number(transaction.fee) || 0
                  const totalFees = amount - net
                  const otherFees = totalFees - fee
                  if (Math.abs(otherFees) < 0.01) {
                    return <span className="text-muted-foreground text-xs">—</span>
                  }
                  return `-${transaction.currency} ${Math.abs(otherFees).toFixed(2)}`
                })()}
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
                  {safeFormatDate(transaction.processedAt || undefined, 'MMM dd, yyyy HH:mm')}
                </TableCell>
              </DroppableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
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
    </DndContext>
  )
}
