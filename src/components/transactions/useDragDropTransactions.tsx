import { useState, type ReactNode } from "react"
import {
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { TableRow } from "@/components/ui/table"
import { Trash2, GripVertical } from "lucide-react"
import React from "react"
import type { Transaction } from "./types"

// Helper function to get NetSuite URL based on transaction type
export function getNetSuiteUrl(transactionId: string, transactionType: string | undefined, netsuiteTransactionName?: string | null): string {
  const baseUrl = 'https://7913744.app.netsuite.com/app/accounting/transactions'

  const netsuiteNameUpper = (netsuiteTransactionName || '').toUpperCase().trim()

  const isRefundByName = netsuiteNameUpper.startsWith('RFND') ||
                         netsuiteNameUpper.includes('CASH REFUND') ||
                         netsuiteNameUpper.includes('REFUND')

  const isPaymentByName = netsuiteNameUpper.startsWith('CUSTPYMT') ||
                         netsuiteNameUpper.startsWith('PYMT') ||
                         netsuiteNameUpper.includes('CUSTOMER PAYMENT') ||
                         netsuiteNameUpper.includes('PAYMENT')

  const transactionTypeLower = (transactionType || '').toLowerCase().trim()
  const isRefundByType = transactionTypeLower === 'refund'
  const isPaymentByType = transactionTypeLower === 'payment' || transactionTypeLower === 'custpymt'

  if (isPaymentByName || isPaymentByType) {
    return `${baseUrl}/custpymt.nl?id=${transactionId}`
  } else if (isRefundByName || isRefundByType) {
    return `${baseUrl}/cashrfnd.nl?id=${transactionId}`
  } else {
    return `${baseUrl}/cashsale.nl?id=${transactionId}`
  }
}

// Draggable NetSuite ID component
export function DraggableNetSuiteId({
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
export function DroppableRow({
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
  const droppableId = `transaction-${transaction.id}`

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'transaction-row',
      transactionId: String(transaction.id),
    },
    disabled: !!transaction.netsuiteTransactionId,
  })

  const isDroppable = isOver && !transaction.netsuiteTransactionId
  const isEvenRow = rowIndex % 2 === 0

  const hasOrderName = transaction.order_name &&
                      transaction.order_name !== '\u2014' &&
                      transaction.order_name !== 'N/A'
  const missingNetSuiteName = !transaction.netsuiteTransactionName ||
                              transaction.netsuiteTransactionName === null ||
                              transaction.netsuiteTransactionName === ''

  const hasDropdownSelection = !!(transaction.amountDescription ||
                                  transaction.otherFeesDescription)

  const isIgnored = transaction.includeInNetSuite === false

  let isActualMismatch = transaction.amountMismatch === true
  if (isActualMismatch && transaction.netsuiteTransactionName && transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined) {
    const netsuiteNameUpper = (transaction.netsuiteTransactionName || '').toUpperCase().trim()
    const isPayment = netsuiteNameUpper.startsWith('PYMT') ||
                     netsuiteNameUpper.startsWith('CUSTPYMT') ||
                     netsuiteNameUpper.includes('PAYMENT')

    if (isPayment) {
      const shopifyNet = typeof transaction.net === 'string' ? parseFloat(transaction.net) : (transaction.net || 0)
      const netsuiteAmount = typeof transaction.netsuiteAmount === 'string' ? parseFloat(transaction.netsuiteAmount) : transaction.netsuiteAmount
      const actualMismatch = Math.abs(Math.abs(shopifyNet) - Math.abs(netsuiteAmount)) > 0.01
      if (!actualMismatch) isActualMismatch = false
    }
  }

  const isMissingCashSale = (hasOrderName && missingNetSuiteName && !hasDropdownSelection && !isIgnored) ||
                            (isActualMismatch && !hasDropdownSelection && !isIgnored)

  return (
    <TableRow
      ref={setNodeRef}
      data-transaction-id={transaction.id}
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

export function useDragDropTransactions(
  transactions: Transaction[],
  onReassignNetSuite?: (fromTransactionId: string, toTransactionId: string) => Promise<void>
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggedTransactionId, setDraggedTransactionId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
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

    const overId = String(over.id)
    let toTransactionId: string | null = null

    if (overData?.type === 'transaction-row' && overData.transactionId) {
      toTransactionId = String(overData.transactionId)
    } else if (overId.startsWith('transaction-')) {
      toTransactionId = overId.replace('transaction-', '')
    } else {
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

  const handleDragCancel = () => {
    setActiveId(null)
    setDraggedTransactionId(null)
  }

  return {
    activeId,
    draggedTransactionId,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    DraggableNetSuiteId,
    DroppableRow,
  }
}
