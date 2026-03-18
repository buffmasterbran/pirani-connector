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
  SkipForward,
  Pencil,
  Store,
  ExternalLink,
} from "lucide-react"
import type { AutoProcessOrder } from "./useAutoProcessData"

type OrderStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

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
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
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
  const skipCurrentRef = useRef(false)
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
    skipCurrentRef.current = false
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

  /**
   * Process a single order at the given index. Returns 'success' | 'error' | 'skipped'.
   * Updates state as it goes. Does NOT handle skip/stop prompts — caller does that.
   */
  const processOneOrder = async (orderIdx: number): Promise<'success' | 'error'> => {
    const order = queue[orderIdx]
    setCurrentOrderIndex(orderIdx)
    skipCurrentRef.current = false
    updateOrder(orderIdx, { status: 'running', error: undefined })

    for (let txnIdx = 0; txnIdx < order.transactions.length; txnIdx++) {
      const txn = order.transactions[txnIdx]
      const tranDate = txn.processedAt
        ? txn.processedAt.split('T')[0]
        : new Date().toISOString().split('T')[0]

      updateTransaction(orderIdx, txnIdx, { status: 'running', error: undefined })
      updateOrder(orderIdx, {
        currentStep: txnIdx === 0
          ? 'Processing order...'
          : `Processing transaction ${txnIdx + 1}/${order.transactions.length}...`,
      })

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
          const paymentStep = data.results?.find((r: any) => r.step === 'create-payment' && r.success)
          const detail = paymentStep?.detail || 'Completed'
          updateTransaction(orderIdx, txnIdx, { status: 'success', detail })
          setProcessedCount(prev => prev + 1)
        } else {
          const failedStep = data.results?.find((r: any) => !r.success && r.error)
          const errorMsg = failedStep?.error || data.error || 'Unknown error'
          updateTransaction(orderIdx, txnIdx, { status: 'error', error: errorMsg })
          updateOrder(orderIdx, {
            status: 'error',
            error: `${failedStep?.step || 'auto'}: ${errorMsg}`,
            currentStep: undefined,
          })
          return 'error'
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Network error'
        updateTransaction(orderIdx, txnIdx, { status: 'error', error: errorMsg })
        updateOrder(orderIdx, { status: 'error', error: errorMsg, currentStep: undefined })
        return 'error'
      }
    }

    updateOrder(orderIdx, { status: 'success', currentStep: undefined })
    return 'success'
  }

  /** Find the next order index that hasn't been processed yet */
  const findNextPending = (from = 0): number => {
    for (let i = from; i < queue.length; i++) {
      const s = orderProgress[i]?.status
      if (s !== 'success' && s !== 'skipped') return i
    }
    return -1
  }

  /** Mark a failed order as skipped (including its remaining transactions) */
  const markOrderSkipped = (orderIdx: number) => {
    const order = queue[orderIdx]
    for (let k = 0; k < order.transactions.length; k++) {
      const txnStatus = orderProgress[orderIdx]?.results[k]?.status
      if (txnStatus !== 'success') {
        updateTransaction(orderIdx, k, { status: 'skipped' })
      }
    }
    updateOrder(orderIdx, { status: 'skipped', currentStep: undefined })
  }

  // --- Run All: loops through all orders, pausing on error for skip/stop ---
  const runBatch = async (startFrom = 0) => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    shouldStopRef.current = false
    setBatchStatus('running')

    let orderIdx = findNextPending(startFrom)

    while (orderIdx >= 0) {
      if (shouldStopRef.current) {
        setBatchStatus('stopped')
        isRunningRef.current = false
        return
      }

      const result = await processOneOrder(orderIdx)
      onComplete()

      if (result === 'error') {
        // Wait for user to skip or stop
        await waitForSkipOrStop()

        if (shouldStopRef.current) {
          setBatchStatus('stopped')
          isRunningRef.current = false
          return
        }

        // User chose skip
        markOrderSkipped(orderIdx)
        onComplete()
      }

      orderIdx = findNextPending(orderIdx + 1)
    }

    setBatchStatus('completed')
    isRunningRef.current = false
  }

  // --- Next: process just one order, then pause ---
  const runNext = async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    setBatchStatus('running')

    const orderIdx = findNextPending()
    if (orderIdx < 0) {
      setBatchStatus('completed')
      isRunningRef.current = false
      return
    }

    const result = await processOneOrder(orderIdx)
    onComplete()

    if (result === 'error') {
      setBatchStatus('error')
    } else {
      // Check if there are more to process
      const next = findNextPending(orderIdx + 1)
      setBatchStatus(next < 0 ? 'completed' : 'stopped')
    }

    isRunningRef.current = false
  }

  // Promise-based wait: resolves when user clicks Skip or Stop
  const waitResolveRef = useRef<(() => void) | null>(null)

  const waitForSkipOrStop = (): Promise<void> => {
    return new Promise(resolve => {
      waitResolveRef.current = resolve
      setBatchStatus('error')
    })
  }

  const handleSkip = () => {
    skipCurrentRef.current = true
    shouldStopRef.current = false
    setBatchStatus('running')
    waitResolveRef.current?.()
    waitResolveRef.current = null
  }

  const handleSkipFromStopped = () => {
    // Skip the current errored order and go to next-stopped state
    const errorIdx = orderProgress.findIndex(o => o.status === 'error')
    if (errorIdx >= 0) {
      markOrderSkipped(errorIdx)
      onComplete()
    }
    const next = findNextPending()
    setBatchStatus(next < 0 ? 'completed' : 'stopped')
  }

  const skipAndNext = async () => {
    // Skip the errored order, then process the next one
    const errorIdx = orderProgress.findIndex(o => o.status === 'error')
    if (errorIdx >= 0) {
      markOrderSkipped(errorIdx)
      onComplete()
    }
    await runNext()
  }

  const handleStopAfterError = () => {
    shouldStopRef.current = true
    skipCurrentRef.current = false
    waitResolveRef.current?.()
    waitResolveRef.current = null
  }

  const handleStart = () => runBatch(0)

  const handleStop = () => {
    shouldStopRef.current = true
  }

  const handleRetry = () => {
    const firstPending = findNextPending()
    if (firstPending >= 0) {
      // Reset error orders back to pending (leave skipped as skipped)
      setOrderProgress(prev => prev.map((o, i) => {
        if (o.status === 'success' || o.status === 'skipped') return o
        return {
          ...o,
          status: 'pending',
          error: undefined,
          currentStep: undefined,
          results: o.results.map(r => ({
            ...r,
            status: r.status === 'success' ? 'success' : 'pending',
            detail: r.status === 'success' ? r.detail : undefined,
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

  // Summary counts
  const successCount = orderProgress.filter(o => o.status === 'success').length
  const errorCount = orderProgress.filter(o => o.status === 'error').length
  const skippedCount = orderProgress.filter(o => o.status === 'skipped').length
  const isWaitingForSkip = batchStatus === 'error' && isRunningRef.current

  return (
    <Dialog open={isOpen} onOpenChange={() => { if (canClose && !isWaitingForSkip) onClose() }}>
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
                  ? `Done — ${successCount} succeeded${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`
                  : batchStatus === 'running'
                    ? `Order ${currentOrderIndex + 1} of ${queue.length}`
                    : batchStatus === 'error'
                      ? isWaitingForSkip
                        ? `Order ${currentOrderIndex + 1} failed — Skip or Stop?`
                        : `Stopped at order ${currentOrderIndex + 1}`
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
                  order.status === 'skipped' ? 'bg-yellow-50 border-yellow-200' :
                  order.status === 'running' ? 'bg-blue-50 border-blue-200' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  {order.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
                  {order.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                  {order.status === 'error' && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                  {order.status === 'skipped' && <SkipForward className="h-4 w-4 text-yellow-600 shrink-0" />}
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
                {order.results.map((txnResult, txnIdx) => (
                  <div key={txnResult.transactionId} className="ml-6 mt-1 flex items-center gap-2 text-xs">
                    {txnResult.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                    {txnResult.status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                    {txnResult.status === 'error' && <XCircle className="h-3 w-3 text-red-500" />}
                    {txnResult.status === 'skipped' && <SkipForward className="h-3 w-3 text-yellow-500" />}
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
                ))}

                {/* Order-level error */}
                {order.error && (
                  <div className="ml-6 mt-1 text-xs text-red-600">{order.error}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Final summary when completed or stopped */}
        {(batchStatus === 'completed' || batchStatus === 'stopped') && (
          <div className="space-y-2">
            {successCount > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <span className="font-medium">{successCount} order{successCount !== 1 ? 's' : ''} processed successfully</span>
                <span className="text-green-600 ml-1">({processedCount} transaction{processedCount !== 1 ? 's' : ''})</span>
              </div>
            )}
            {skippedCount > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <span className="font-medium">{skippedCount} order{skippedCount !== 1 ? 's' : ''} skipped</span>
                <span className="text-yellow-600 ml-1">— requires manual intervention:</span>
                <ul className="mt-1 ml-4 list-disc text-xs text-yellow-700">
                  {orderProgress.filter(o => o.status === 'skipped').map(o => (
                    <li key={o.sourceOrderId}>
                      <a
                        href={`https://admin.shopify.com/store/pirani-life/orders/${o.sourceOrderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {o.orderName}
                      </a>
                      {o.error && <span className="text-red-600 ml-1">— {o.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {errorCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                <span className="font-medium">{errorCount} order{errorCount !== 1 ? 's' : ''} failed:</span>
                <ul className="mt-1 ml-4 list-disc text-xs text-red-700">
                  {orderProgress.filter(o => o.status === 'error').map(o => (
                    <li key={o.sourceOrderId}>
                      <a
                        href={`https://admin.shopify.com/store/pirani-life/orders/${o.sourceOrderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {o.orderName}
                      </a>
                      {o.error && <span className="text-red-600 ml-1">— {o.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          {batchStatus === 'idle' && (
            <>
              <Button onClick={handleStart} className={btnColor}>
                <Play className="h-4 w-4 mr-2" />
                Run All
              </Button>
              <Button onClick={runNext} variant="outline">
                <SkipForward className="h-4 w-4 mr-2" />
                Next
              </Button>
            </>
          )}
          {batchStatus === 'running' && !isWaitingForSkip && (
            <Button onClick={handleStop} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          )}
          {isWaitingForSkip && (
            <>
              <Button onClick={handleSkip} variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50">
                <SkipForward className="h-4 w-4 mr-2" />
                Skip & Continue
              </Button>
              <Button onClick={handleStopAfterError} variant="destructive">
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </>
          )}
          {batchStatus === 'stopped' && (
            <>
              <Button onClick={handleRetry} className={btnColor}>
                <Play className="h-4 w-4 mr-2" />
                Resume All
              </Button>
              <Button onClick={runNext} variant="outline">
                <SkipForward className="h-4 w-4 mr-2" />
                Next
              </Button>
            </>
          )}
          {batchStatus === 'error' && !isWaitingForSkip && (
            <>
              <Button onClick={handleSkipFromStopped} variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50">
                <SkipForward className="h-4 w-4 mr-2" />
                Skip
              </Button>
              <Button onClick={handleRetry} className={btnColor}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={skipAndNext} variant="outline">
                <SkipForward className="h-4 w-4 mr-2" />
                Skip & Next
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={batchStatus === 'running' || isWaitingForSkip}
          >
            {batchStatus === 'completed' || batchStatus === 'stopped' || batchStatus === 'error' ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
