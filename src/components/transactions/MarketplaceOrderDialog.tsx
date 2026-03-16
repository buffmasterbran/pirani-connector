"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, XCircle, SkipForward, Play, Zap, Store } from "lucide-react"
import type { Transaction } from "./types"

interface MarketplaceOrderDialogProps {
  isOpen: boolean
  onClose: () => void
  transaction: Transaction | null
  onComplete: () => void
}

type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

interface StepState {
  id: string
  label: string
  status: StepStatus
  detail?: string
  error?: string
}

interface OrderState {
  salesOrder?: { id: string; tranid: string; amount: number }
  cashSale?: { id: string; tranid: string; amount: number }
  invoice?: { id: string; tranid: string; amount: number }
  payments?: Array<{ id: string; tranid: string; amount: number }>
  customerId?: string | null
}

export function MarketplaceOrderDialog({
  isOpen,
  onClose,
  transaction,
  onComplete,
}: MarketplaceOrderDialogProps) {
  const [steps, setSteps] = useState<StepState[]>([])
  const [orderState, setOrderState] = useState<OrderState | null>(null)
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const orderName = transaction?.order_name || `#${transaction?.source_order_id || ''}`
  const paymentAmount = transaction ? Math.abs(transaction.net) : 0
  const currency = transaction?.currency || 'USD'
  const tranDate = transaction?.processedAt
    ? transaction.processedAt.split('T')[0]
    : new Date().toISOString().split('T')[0]

  // Initialize steps when dialog opens
  useEffect(() => {
    if (isOpen && transaction) {
      setSteps([
        { id: 'check', label: 'Check NS State', status: 'pending' },
        { id: 'delete-cash-sale', label: 'Delete Cash Sale', status: 'pending' },
        { id: 'update-sales-order', label: 'Update Sales Order', status: 'pending' },
        { id: 'create-invoice', label: 'Create Invoice', status: 'pending' },
        { id: 'create-payment', label: `Create Payment ($${paymentAmount.toFixed(2)})`, status: 'pending' },
      ])
      setOrderState(null)
      setInvoiceId(null)
      setCompleted(false)
      setIsRunningAll(false)

      // Auto-run check on open
      runCheck()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, transaction?.id])

  const updateStep = useCallback((stepId: string, updates: Partial<StepState>) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s))
  }, [])

  const callApi = async (body: any) => {
    const res = await fetch('/api/netsuite/process-marketplace-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  // --- Step runners ---

  const runCheck = async () => {
    updateStep('check', { status: 'running' })

    try {
      const res = await fetch(`/api/netsuite/process-marketplace-order?orderName=${encodeURIComponent(orderName)}`)
      const data = await res.json()

      if (!data.success) {
        updateStep('check', { status: 'error', error: data.error })
        return null
      }

      const state: OrderState = data.state
      setOrderState(state)

      const parts = []
      if (state.salesOrder) parts.push(`SO: ${state.salesOrder.tranid}`)
      if (state.cashSale) parts.push(`CS: ${state.cashSale.tranid}`)
      if (state.invoice) parts.push(`INV: ${state.invoice.tranid}`)
      if (state.payments?.length) parts.push(`${state.payments.length} payment(s)`)
      if (!parts.length) parts.push('No records found')

      updateStep('check', { status: 'success', detail: parts.join(', ') })

      // If invoice already exists, skip steps 2-4
      if (state.invoice) {
        setInvoiceId(state.invoice.id)
        updateStep('delete-cash-sale', { status: 'skipped', detail: 'Invoice already exists' })
        updateStep('update-sales-order', { status: 'skipped', detail: 'Invoice already exists' })
        updateStep('create-invoice', { status: 'skipped', detail: 'Invoice already exists' })
      } else if (!state.salesOrder) {
        updateStep('delete-cash-sale', { status: 'error', error: 'No Sales Order found in NetSuite' })
      }

      return state
    } catch (error) {
      updateStep('check', { status: 'error', error: error instanceof Error ? error.message : 'Failed' })
      return null
    }
  }

  const runDeleteCashSale = async (state?: OrderState | null) => {
    const st = state || orderState
    if (!st?.cashSale) {
      updateStep('delete-cash-sale', { status: 'skipped', detail: 'No Cash Sale to delete' })
      return true
    }

    updateStep('delete-cash-sale', { status: 'running', detail: `Deleting ${st.cashSale.tranid}...` })
    const data = await callApi({ orderName, step: 'delete-cash-sale', cashSaleId: st.cashSale.id })

    if (data.success) {
      updateStep('delete-cash-sale', { status: 'success', detail: `Deleted ${st.cashSale.tranid}` })
      return true
    } else {
      updateStep('delete-cash-sale', { status: 'error', error: data.result?.error || data.error })
      return false
    }
  }

  const runUpdateSO = async (state?: OrderState | null) => {
    const st = state || orderState
    if (!st?.salesOrder) {
      updateStep('update-sales-order', { status: 'error', error: 'No Sales Order found' })
      return false
    }

    updateStep('update-sales-order', { status: 'running', detail: `Updating ${st.salesOrder.tranid}...` })
    const data = await callApi({ orderName, step: 'update-sales-order', salesOrderId: st.salesOrder.id })

    if (data.success) {
      updateStep('update-sales-order', { status: 'success', detail: data.result?.detail })
      return true
    } else {
      updateStep('update-sales-order', { status: 'error', error: data.result?.error || data.error })
      return false
    }
  }

  const runCreateInvoice = async (state?: OrderState | null) => {
    const st = state || orderState
    if (!st?.salesOrder) {
      updateStep('create-invoice', { status: 'error', error: 'No Sales Order found' })
      return false
    }

    updateStep('create-invoice', { status: 'running', detail: `Transforming ${st.salesOrder.tranid} → Invoice...` })
    const data = await callApi({
      orderName,
      step: 'create-invoice',
      salesOrderId: st.salesOrder.id,
      tranDate,
    })

    if (data.success) {
      const newInvoiceId = data.result?.data?.invoiceId
      setInvoiceId(newInvoiceId)
      updateStep('create-invoice', { status: 'success', detail: data.result?.detail })
      return true
    } else {
      updateStep('create-invoice', { status: 'error', error: data.result?.error || data.error })
      return false
    }
  }

  const runCreatePayment = async (state?: OrderState | null, overrideInvoiceId?: string | null) => {
    const st = state || orderState
    const invId = overrideInvoiceId || invoiceId || st?.invoice?.id
    const custId = st?.customerId

    if (!invId) {
      updateStep('create-payment', { status: 'error', error: 'No invoice ID available' })
      return false
    }
    if (!custId) {
      updateStep('create-payment', { status: 'error', error: 'No customer ID found' })
      return false
    }

    updateStep('create-payment', { status: 'running', detail: `Creating payment for $${paymentAmount.toFixed(2)}...` })
    const data = await callApi({
      orderName,
      step: 'create-payment',
      invoiceId: invId,
      customerId: custId,
      paymentAmount,
      currency,
      tranDate,
      transactionId: transaction?.id,
    })

    if (data.success) {
      updateStep('create-payment', { status: 'success', detail: data.result?.detail })
      setCompleted(true)
      return true
    } else {
      updateStep('create-payment', { status: 'error', error: data.result?.error || data.error })
      return false
    }
  }

  // --- Run All Remaining ---
  const runAllRemaining = async () => {
    setIsRunningAll(true)
    try {
      // If check hasn't run yet, run it
      let state = orderState
      const checkStep = steps.find(s => s.id === 'check')
      if (!checkStep || checkStep.status === 'pending') {
        state = await runCheck()
        if (!state) { setIsRunningAll(false); return }
      }

      // If invoice exists, skip to payment
      if (state?.invoice) {
        await runCreatePayment(state)
      } else {
        // Full workflow
        if (!(await runDeleteCashSale(state))) { setIsRunningAll(false); return }
        if (!(await runUpdateSO(state))) { setIsRunningAll(false); return }
        if (!(await runCreateInvoice(state))) { setIsRunningAll(false); return }
        // invoiceId is set by runCreateInvoice via setInvoiceId
        // Need to use a slight delay to let state update
        await new Promise(r => setTimeout(r, 100))
        await runCreatePayment(state)
      }
    } finally {
      setIsRunningAll(false)
    }
  }

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'error': return <XCircle className="h-4 w-4 text-red-600" />
      case 'skipped': return <SkipForward className="h-4 w-4 text-gray-400" />
      default: return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
    }
  }

  const canRunStep = (stepId: string): boolean => {
    if (isRunningAll) return false
    const step = steps.find(s => s.id === stepId)
    if (!step || step.status === 'running' || step.status === 'success' || step.status === 'skipped') return false

    // Check must be done before other steps
    if (stepId !== 'check') {
      const checkDone = steps.find(s => s.id === 'check')?.status === 'success'
      if (!checkDone) return false
    }

    return true
  }

  const hasRemainingSteps = steps.some(s => s.status === 'pending' || s.status === 'error')
  const anyRunning = steps.some(s => s.status === 'running')

  return (
    <Dialog open={isOpen} onOpenChange={() => { if (!anyRunning) { onClose(); if (completed) onComplete() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-purple-600" />
            Process Marketplace Order: {orderName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Payment amount: <span className="font-medium text-foreground">{currency} {paymentAmount.toFixed(2)}</span></div>
          <div>Date: <span className="font-medium text-foreground">{tranDate}</span></div>
          {orderState?.customerId && (
            <div>Customer: <span className="font-medium text-foreground">{orderState.customerId}</span></div>
          )}
        </div>

        <div className="space-y-3 mt-4">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                step.status === 'error' ? 'bg-red-50 border-red-200' :
                step.status === 'success' ? 'bg-green-50 border-green-200' :
                step.status === 'running' ? 'bg-blue-50 border-blue-200' :
                step.status === 'skipped' ? 'bg-gray-50 border-gray-200' :
                'bg-white border-gray-200'
              }`}
            >
              <div className="mt-0.5">{getStepIcon(step.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{step.label}</div>
                {step.detail && (
                  <div className="text-xs text-muted-foreground mt-0.5">{step.detail}</div>
                )}
                {step.error && (
                  <div className="text-xs text-red-600 mt-0.5">{step.error}</div>
                )}
              </div>
              {canRunStep(step.id) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    switch (step.id) {
                      case 'check': runCheck(); break
                      case 'delete-cash-sale': runDeleteCashSale(); break
                      case 'update-sales-order': runUpdateSO(); break
                      case 'create-invoice': runCreateInvoice(); break
                      case 'create-payment': runCreatePayment(); break
                    }
                  }}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Run
                </Button>
              )}
            </div>
          ))}
        </div>

        {completed && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 mt-2">
            Payment created successfully. The transaction will be updated with the NetSuite payment ID.
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          {hasRemainingSteps && !completed && (
            <Button
              onClick={runAllRemaining}
              disabled={anyRunning || isRunningAll}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isRunningAll ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Run All Remaining</>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => { onClose(); if (completed) onComplete() }}
            disabled={anyRunning}
          >
            {completed ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
