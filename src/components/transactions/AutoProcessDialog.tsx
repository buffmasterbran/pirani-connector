"use client"

import { useState, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  RotateCcw,
  Pencil,
  Store,
  ExternalLink,
} from "lucide-react"
import type { AutoProcessOrder } from "./useAutoProcessData"

type OrderStatus = 'pending' | 'running' | 'success' | 'error'

interface OrderProgress {
  orderName: string
  sourceOrderId: string
  status: OrderStatus
  currentStep?: string
  results: TransactionResult[]
  error?: string
}

interface TransactionResult {
  transactionId: string
  amount: number
  type: string
  status: 'pending' | 'running' | 'success' | 'error'
  detail?: string
  error?: string
}

interface AutoProcessDialogProps {
  mode: 'edited' | 'marketplace'
  queue: AutoProcessOrder[]
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export function AutoProcessDialog({
  mode,
  queue,
  isOpen,
  onClose,
  onComplete,
}: AutoProcessDialogProps) {
  const [orderProgress, setOrderProgress] = useState<OrderProgress[]>([])
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'stopped' | 'completed' | 'error'>('idle')
  const [processedCount, setProcessedCount] = useState(0)
  const [currentOrderIndex, setCurrentOrderIndex] = useState(-1)
  const shouldStopRef = useRef(false)
  const isRunningRef = useRef(false)

  const totalTransactions = queue.reduce((sum, o) => sum + o.transactions.length, 0)
  const apiEndpoint = mode === 'edited'
    ? '/api/netsuite/process-edited-order'
    : '/api/netsuite/process-marketplace-order'

  const initProgress = useCallback(() => {
    setOrderProgress(queue.map(order => ({
      orderName: order.orderName,
      sourceOrderId: order.sourceOrderId,
      status: 'pending',
      results: order.transactions.map(t => ({
        transactionId: t.id,
        amount: Math.abs(t.amount),
        type: t.type,
        status: 'pending',
      })),
    })))
    setProcessedCount(0)
    setCurrentOrderIndex(-1)
  }, [queue])

  // Initialize on open
  const prevOpenRef = useRef(false)
  if (isOpen && !prevOpenRef.current) {
    prevOpenRef.current = true
    initProgress()
    setBatchStatus('idle')
    shouldStopRef.current = false
    isRunningRef.current = false
  } else if (!isOpen && prevOpenRef.current) {
    prevOpenRef.current = false
  }

  const updateOrder = (idx: number, updates: Partial<OrderProgress>) => {
    setOrderProgress(prev => prev.map((o, i) => i === idx ? { ...o, ...updates } : o))
  }

  const updateTransaction = (orderIdx: number, txnIdx: number, updates: Partial<TransactionResult>) => {
    setOrderProgress(prev => prev.map((o, i) => {
      if (i !== orderIdx) return o
      return {
        ...o,
        results: o.results.map((r, j) => j === txnIdx ? { ...r, ...updates } : r),
      }
    }))
  }

  const runBatch = async (startFrom = 0) => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    shouldStopRef.current = false
    setBatchStatus('running')

    let processed = processedCount
    let hadError = false

    for (let orderIdx = startFrom; orderIdx < queue.length; orderIdx++) {
      if (shouldStopRef.current) {
        setBatchStatus('stopped')
        isRunningRef.current = false
        return
      }

      const order = queue[orderIdx]
      setCurrentOrderIndex(orderIdx)
      updateOrder(orderIdx, { status: 'running' })

      let orderFailed = false

      for (let txnIdx = 0; txnIdx < order.transactions.length; txnIdx++) {
        const txn = order.transactions[txnIdx]
        const tranDate = txn.processedAt
          ? txn.processedAt.split('T')[0]
          : new Date().toISOString().split('T')[0]

        updateTransaction(orderIdx, txnIdx, { status: 'running' })
        updateOrder(orderIdx, { currentStep: txnIdx === 0 ? 'Processing order...' : `Processing transaction ${txnIdx + 1}/${order.transactions.length}...` })

        try {
          const res = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderName: order.orderName,
              step: 'auto',
              transactionId: txn.id,
              paymentAmount: Math.abs(txn.amount),
              currency: txn.currency,
              tranDate,
            }),
          })

          const data = await res.json()

          if (data.success) {
            // Extract payment info from results
            const paymentStep = data.results?.find((r: any) => r.step === 'create-payment' && r.success)
            const detail = paymentStep?.detail || 'Completed'
            updateTransaction(orderIdx, txnIdx, { status: 'success', detail })
            processed++
            setProcessedCount(processed)
          } else {
            // Find which step failed
            const failedStep = data.results?.find((r: any) => !r.success && r.error)
            const errorMsg = failedStep?.error || data.error || 'Unknown error'
            updateTransaction(orderIdx, txnIdx, { status: 'error', error: errorMsg })
            updateOrder(orderIdx, {
              status: 'error',
              error: `${failedStep?.step || 'auto'}: ${errorMsg}`,
              currentStep: undefined,
            })
            orderFailed = true
            hadError = true
            break
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Network error'
          updateTransaction(orderIdx, txnIdx, { status: 'error', error: errorMsg })
          updateOrder(orderIdx, { status: 'error', error: errorMsg, currentStep: undefined })
          orderFailed = true
          hadError = true
          break
        }
      }

      if (orderFailed) {
        setBatchStatus('error')
        isRunningRef.current = false
        // Refresh to show any NS IDs that were created before the failure
        onComplete()
        return
      }

      updateOrder(orderIdx, { status: 'success', currentStep: undefined })
      // Refresh after each completed order so table updates progressively
      onComplete()
    }

    setBatchStatus(hadError ? 'error' : 'completed')
    isRunningRef.current = false
  }

  const handleStart = () => runBatch(0)

  const handleStop = () => {
    shouldStopRef.current = true
  }

  const handleRetry = () => {
    // Find first non-success order
    const firstPending = orderProgress.findIndex(o => o.status !== 'success')
    if (firstPending >= 0) {
      // Reset pending/error orders
      setOrderProgress(prev => prev.map((o, i) => {
        if (i < firstPending) return o // already succeeded
        return {
          ...o,
          status: 'pending',
          error: undefined,
          currentStep: undefined,
          results: o.results.map(r => ({
            ...r,
            status: 'pending',
            detail: undefined,
            error: undefined,
          })),
        }
      }))
      runBatch(firstPending)
    }
  }

  const canClose = batchStatus !== 'running'
  const progressPercent = totalTransactions > 0 ? (processedCount / totalTransactions) * 100 : 0

  const Icon = mode === 'edited' ? Pencil : Store
  const iconColor = mode === 'edited' ? 'text-amber-600' : 'text-purple-600'
  const title = mode === 'edited' ? 'Auto Process Edited Orders' : 'Auto Process Shop Cash Orders'
  const btnColor = mode === 'edited' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-600 hover:bg-purple-700'

  return (
    <Dialog open={isOpen} onOpenChange={() => { if (canClose) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            {title}
            <span className="text-sm font-normal text-muted-foreground">
              ({queue.length} order{queue.length !== 1 ? 's' : ''}, {totalTransactions} transaction{totalTransactions !== 1 ? 's' : ''})
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        {batchStatus !== 'idle' && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {batchStatus === 'completed'
                  ? `All ${processedCount} transactions processed`
                  : batchStatus === 'running'
                    ? `Order ${currentOrderIndex + 1} of ${queue.length}`
                    : batchStatus === 'error'
                      ? `Stopped at order ${currentOrderIndex + 1} — ${processedCount} processed`
                      : batchStatus === 'stopped'
                        ? `Stopped — ${processedCount} of ${totalTransactions} processed`
                        : ''}
              </span>
              <span>{processedCount}/{totalTransactions}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Order list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh] pr-1">
          {orderProgress.map((order, idx) => {
            const queueOrder = queue[idx]
            return (
              <div
                key={order.sourceOrderId}
                className={`p-3 rounded-lg border ${
                  order.status === 'error' ? 'bg-red-50 border-red-200' :
                  order.status === 'success' ? 'bg-green-50 border-green-200' :
                  order.status === 'running' ? 'bg-blue-50 border-blue-200' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  {order.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
                  {order.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                  {order.status === 'error' && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                  {order.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />}

                  {/* Order name */}
                  <a
                    href={`https://admin.shopify.com/store/pirani-life/orders/${order.sourceOrderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                  >
                    {order.orderName}
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  {/* Alone/Grouped badge (for edited orders) */}
                  {mode === 'edited' && (
                    queueOrder?.isAlone ? (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-semibold">
                        Alone
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-semibold">
                        Grouped ({queueOrder?.groupSize} in payout)
                      </span>
                    )
                  )}

                  {/* Transaction count */}
                  {order.results.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {order.results.length} txns
                    </span>
                  )}

                  {/* Current step */}
                  {order.currentStep && (
                    <span className="text-xs text-blue-600 ml-auto">{order.currentStep}</span>
                  )}
                </div>

                {/* Transaction sub-rows */}
                {order.results.map((txnResult, txnIdx) => {
                  const txn = queueOrder?.transactions[txnIdx]
                  return (
                    <div key={txnResult.transactionId} className="ml-6 mt-1 flex items-center gap-2 text-xs">
                      {txnResult.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                      {txnResult.status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {txnResult.status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                      {txnResult.status === 'pending' && <div className="h-3 w-3 rounded-full border border-gray-300" />}

                      <span className={`px-1 py-0.5 rounded ${txnResult.type === 'charge' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {txnResult.type}
                      </span>
                      <span className="text-muted-foreground">
                        ${txnResult.amount.toFixed(2)}
                      </span>

                      {txnResult.detail && (
                        <span className="text-green-600 truncate">{txnResult.detail}</span>
                      )}
                      {txnResult.error && (
                        <span className="text-red-600 truncate">{txnResult.error}</span>
                      )}
                    </div>
                  )
                })}

                {/* Order-level error */}
                {order.error && (
                  <div className="ml-6 mt-1 text-xs text-red-600">{order.error}</div>
                )}
              </div>
            )
          })}
        </div>

        {batchStatus === 'completed' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            All {processedCount} transaction{processedCount !== 1 ? 's' : ''} processed successfully.
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          {batchStatus === 'idle' && (
            <Button onClick={handleStart} className={btnColor}>
              <Play className="h-4 w-4 mr-2" />
              Start Processing
            </Button>
          )}
          {batchStatus === 'running' && (
            <Button onClick={handleStop} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          )}
          {(batchStatus === 'error' || batchStatus === 'stopped') && (
            <Button onClick={handleRetry} className={btnColor}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry from Failed
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={!canClose}
          >
            {batchStatus === 'completed' ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
