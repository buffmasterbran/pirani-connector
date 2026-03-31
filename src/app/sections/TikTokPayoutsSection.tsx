'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  ArrowRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TikTokPayout {
  id: string
  paymentId: string | null
  status: string | null
  currency: string | null
  totalAmount: number | null
  netSales: number | null
  shipping: number | null
  fees: number | null
  adjustments: number | null
  payableAmount: number | null
  payoutDate: string | null
  netsuiteDepositId: string | null
  pushedToNsAt: string | null
  pushedToNsBy: string | null
  transactionCount: number
  uniqueOrderCount: number
  matchedCount: number
  unmatchedCount: number
}

interface TikTokTransaction {
  id: string
  tiktokOrderId: string | null
  type: string | null
  productName: string | null
  skuName: string | null
  quantity: number | null
  totalSettlementAmount: number | null
  grossSales: number | null
  fees: number | null
  shopifyOrderId: string | null
  shopifyOrderName: string | null
  netsuiteTransactionId: string | null
  netsuiteTransactionName: string | null
  matchStatus: string | null
  matchError: string | null
  includeInNetSuite: boolean
}

interface PreviewData {
  preview: {
    payoutId: string
    paymentId: string | null
    payoutDate: string
    totalAmount: number | null
    payableAmount: number | null
    depositItemCount: number
    skippedItems: Array<{ id: number; tranid: string; reason: string }>
    otherItems: Array<{ description: string; amount: number }>
    unmatchedOrders: Array<{
      tiktokOrderId: string
      productName: string | null
      amount: number | null
      matchError: string | null
    }>
  }
  payload: any
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TikTokPayoutsSection() {
  const [payouts, setPayouts] = useState<TikTokPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [expandedPayoutId, setExpandedPayoutId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TikTokTransaction[]>([])
  const [isLoadingTxns, setIsLoadingTxns] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [matchResult, setMatchResult] = useState<any>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isCreatingDeposit, setIsCreatingDeposit] = useState(false)
  const [depositResult, setDepositResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Load payouts ──────────────────────────────────────────────────────────

  const loadPayouts = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/tiktok/payouts')
      const data = await res.json()
      console.log('[TikTok UI] Loaded payouts:', data.payouts?.length, data)
      setPayouts(data.payouts || [])
    } catch (err) {
      console.error('[TikTok UI] Failed to load TikTok payouts:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadPayouts() }, [loadPayouts])

  // ─── Upload Excel ──────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/tiktok/payouts/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        setUploadResult({ success: true, ...data })
        loadPayouts()
      } else {
        setUploadResult({ success: false, error: data.error })
      }
    } catch (err: any) {
      setUploadResult({ success: false, error: err.message })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── Expand payout → load transactions ──────────────────────────────────

  const toggleExpand = async (payoutId: string) => {
    if (expandedPayoutId === payoutId) {
      setExpandedPayoutId(null)
      setTransactions([])
      setPreviewData(null)
      setMatchResult(null)
      setDepositResult(null)
      return
    }

    setExpandedPayoutId(payoutId)
    setIsLoadingTxns(true)
    setPreviewData(null)
    setMatchResult(null)
    setDepositResult(null)
    try {
      const res = await fetch(`/api/tiktok/payouts/${payoutId}`)
      const data = await res.json()
      setTransactions(data.payout?.transactions || [])
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setIsLoadingTxns(false)
    }
  }

  // ─── Match orders ──────────────────────────────────────────────────────────

  const handleMatch = async (payoutId: string) => {
    setIsMatching(true)
    setMatchResult(null)
    try {
      const res = await fetch(`/api/tiktok/payouts/${payoutId}/match`, { method: 'POST' })
      const data = await res.json()
      setMatchResult(data)

      // Reload transactions to see updated match status
      const txnRes = await fetch(`/api/tiktok/payouts/${payoutId}`)
      const txnData = await txnRes.json()
      setTransactions(txnData.payout?.transactions || [])
      loadPayouts()
    } catch (err: any) {
      setMatchResult({ success: false, error: err.message })
    } finally {
      setIsMatching(false)
    }
  }

  // ─── Preview deposit ──────────────────────────────────────────────────────

  const handlePreview = async (payoutId: string) => {
    setIsPreviewLoading(true)
    setPreviewData(null)
    try {
      const res = await fetch(`/api/tiktok/payouts/${payoutId}/preview-deposit`)
      const data = await res.json()
      if (res.ok) {
        setPreviewData(data)
      } else {
        setPreviewData(null)
        alert(data.error || 'Preview failed')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // ─── Create deposit ───────────────────────────────────────────────────────

  const handleCreateDeposit = async (payoutId: string) => {
    if (!confirm('Create this deposit in NetSuite?')) return

    setIsCreatingDeposit(true)
    setDepositResult(null)
    try {
      const res = await fetch(`/api/tiktok/payouts/${payoutId}/create-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: 'TikTok UI' }),
      })
      const data = await res.json()
      setDepositResult(data)
      if (data.success) loadPayouts()
    } catch (err: any) {
      setDepositResult({ success: false, error: err.message })
    } finally {
      setIsCreatingDeposit(false)
    }
  }

  // ─── Clear deposit ─────────────────────────────────────────────────────────

  const [isClearingDeposit, setIsClearingDeposit] = useState(false)

  const handleClearDeposit = async (payoutId: string) => {
    if (!confirm('Clear the deposit reference? Make sure you already deleted the deposit in NetSuite first.')) return

    setIsClearingDeposit(true)
    try {
      const res = await fetch(`/api/tiktok/payouts/${payoutId}/clear-deposit`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setDepositResult(null)
        setPreviewData(null)
        loadPayouts()
        // Reload transactions
        const txnRes = await fetch(`/api/tiktok/payouts/${payoutId}`)
        const txnData = await txnRes.json()
        setTransactions(txnData.payout?.transactions || [])
      } else {
        alert(data.error || 'Failed to clear deposit')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsClearingDeposit(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">TikTok Payouts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload TikTok income reports, match orders to NetSuite, and create deposits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadPayouts} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUpload}
              className="hidden"
              id="tiktok-upload"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload TikTok Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <Card className={uploadResult.success
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-red-200 bg-red-50'
        }>
          <CardContent className="p-4">
            {uploadResult.success ? (
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  Imported {uploadResult.payoutsCreated} payouts and{' '}
                  {uploadResult.transactionsCreated} order lines.
                  {uploadResult.payoutsUpdated > 0 && (
                    <> {uploadResult.payoutsUpdated} payouts updated (matched transactions preserved).</>
                  )}
                  {uploadResult.payoutsSkipped > 0 && (
                    <> {uploadResult.payoutsSkipped} already-deposited payouts skipped.</>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-800">
                <XCircle className="h-5 w-5" />
                <span>{uploadResult.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Flow explanation */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Workflow:</span>
            <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded">1. Upload Excel</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">2. Match Orders</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">3. Preview Deposit</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">4. Create Deposit</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Matching searches Shopify for orders tagged with <code className="bg-slate-100 px-1 rounded">TikTokOrderID:xxx</code>,
            then finds the corresponding NetSuite Cash Sale.
          </p>
        </CardContent>
      </Card>

      {/* Payouts list */}
      {isLoading && payouts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading payouts...</span>
        </div>
      ) : payouts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">No TikTok payouts yet</h3>
            <p className="text-sm text-slate-500">
              Upload a TikTok income Excel file to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payouts.map(payout => (
            <Card key={payout.id} className={`border ${
              payout.netsuiteDepositId
                ? 'border-emerald-200 bg-emerald-50/30'
                : 'border-slate-200'
            }`}>
              <CardContent className="p-0">
                {/* Payout header row */}
                <button
                  onClick={() => toggleExpand(payout.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs text-slate-500">Date</div>
                      <div className="font-medium text-slate-800">{fmtDate(payout.payoutDate)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Amount</div>
                      <div className="font-semibold text-slate-800">{fmt(payout.totalAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Net Sales</div>
                      <div className="text-sm text-slate-700">{fmt(payout.netSales)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Fees</div>
                      <div className="text-sm text-red-600">{fmt(payout.fees)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Orders</div>
                      <div className="text-sm text-slate-700">{payout.uniqueOrderCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Matched</div>
                      <div className="text-sm">
                        {payout.matchedCount > 0 ? (
                          <span className="text-emerald-600 font-medium">{payout.matchedCount}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                        {payout.unmatchedCount > 0 && (
                          <span className="text-amber-600 ml-1">/ {payout.unmatchedCount} unmatched</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {payout.netsuiteDepositId ? (
                      <a
                        href={`https://7913744.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${payout.netsuiteDepositId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Deposited: {payout.netsuiteDepositId}
                      </a>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                        {payout.status}
                      </span>
                    )}
                    {expandedPayoutId === payout.id
                      ? <ChevronUp className="h-5 w-5 text-slate-400" />
                      : <ChevronDown className="h-5 w-5 text-slate-400" />
                    }
                  </div>
                </button>

                {/* Expanded detail panel */}
                {expandedPayoutId === payout.id && (
                  <div className="border-t border-slate-200 px-5 py-4 bg-slate-50/50">
                    {/* Action bar */}
                    <div className="flex items-center gap-3 mb-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMatch(payout.id)}
                        disabled={isMatching || !!payout.netsuiteDepositId}
                      >
                        {isMatching ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Match Orders
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreview(payout.id)}
                        disabled={isPreviewLoading || !!payout.netsuiteDepositId}
                      >
                        {isPreviewLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4 mr-2" />
                        )}
                        Preview Deposit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCreateDeposit(payout.id)}
                        disabled={isCreatingDeposit || !!payout.netsuiteDepositId || !previewData}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isCreatingDeposit ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Create Deposit
                      </Button>

                      {payout.netsuiteDepositId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearDeposit(payout.id)}
                          disabled={isClearingDeposit}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          {isClearingDeposit ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Clear Deposit
                        </Button>
                      )}

                      <div className="ml-auto text-xs text-slate-500">
                        Statement: {payout.id} | Payment: {payout.paymentId || '—'}
                      </div>
                    </div>

                    {/* Match result banner */}
                    {matchResult && (
                      <div className={`mb-4 p-3 rounded-lg text-sm ${
                        matchResult.success ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'
                      }`}>
                        {matchResult.success ? (
                          <>
                            Matching complete: {matchResult.matched} matched, {matchResult.unmatched} unmatched
                            out of {matchResult.totalOrders} unique orders.
                          </>
                        ) : (
                          <>Error: {matchResult.error}</>
                        )}
                      </div>
                    )}

                    {/* Deposit result banner */}
                    {depositResult && (
                      <div className={`mb-4 p-3 rounded-lg text-sm ${
                        depositResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                      }`}>
                        {depositResult.success ? (
                          <>
                            Deposit created:{' '}
                            <a
                              href={`https://7913744.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositResult.depositId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold underline"
                            >
                              {depositResult.depositId}
                            </a>{' '}
                            with {depositResult.depositItemCount} items.
                          </>
                        ) : (
                          <div>
                            <div>Error: {depositResult.error}</div>
                            {depositResult.details && (
                              <pre className="mt-1 text-xs whitespace-pre-wrap max-h-40 overflow-auto">{depositResult.details}</pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview panel */}
                    {previewData && (
                      <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <h4 className="font-medium text-amber-900 mb-2">Deposit Preview</h4>
                        <div className="grid grid-cols-4 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-amber-700">Items:</span>{' '}
                            <strong>{previewData.preview.depositItemCount}</strong>
                          </div>
                          <div>
                            <span className="text-amber-700">Total:</span>{' '}
                            <strong>{fmt(previewData.preview.totalAmount)}</strong>
                          </div>
                          <div>
                            <span className="text-amber-700">Payable:</span>{' '}
                            <strong>{fmt(previewData.preview.payableAmount)}</strong>
                          </div>
                          <div>
                            <span className="text-amber-700">Date:</span>{' '}
                            <strong>{previewData.preview.payoutDate}</strong>
                          </div>
                        </div>
                        {previewData.preview.otherItems.length > 0 && (
                          <div className="text-sm mb-2">
                            <span className="text-amber-700">Fee lines:</span>
                            {previewData.preview.otherItems.map((item, i) => (
                              <span key={i} className="ml-2">
                                {item.description}: {fmt(item.amount)}
                              </span>
                            ))}
                          </div>
                        )}
                        {previewData.preview.skippedItems.length > 0 && (
                          <div className="text-sm text-amber-800">
                            <span className="font-medium">Skipped ({previewData.preview.skippedItems.length}):</span>
                            {previewData.preview.skippedItems.map((s, i) => (
                              <span key={i} className="ml-2">{s.tranid}: {s.reason}</span>
                            ))}
                          </div>
                        )}
                        {previewData.preview.unmatchedOrders.length > 0 && (
                          <div className="text-sm text-amber-800 mt-2">
                            <span className="font-medium">
                              Unmatched orders ({previewData.preview.unmatchedOrders.length}):
                            </span>
                            <ul className="ml-4 mt-1 list-disc">
                              {previewData.preview.unmatchedOrders.map((o, i) => (
                                <li key={i}>
                                  {o.tiktokOrderId} — {o.productName || 'Unknown'} ({fmt(o.amount)})
                                  {o.matchError && <span className="text-xs ml-1">({o.matchError})</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transactions table */}
                    {isLoadingTxns ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        <span className="ml-2 text-sm text-slate-500">Loading order details...</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left">
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">TikTok Order</th>
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">Product</th>
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">Qty</th>
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">Settlement</th>
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">Shopify</th>
                              <th className="pb-2 pr-3 text-xs font-medium text-slate-500">NetSuite</th>
                              <th className="pb-2 text-xs font-medium text-slate-500">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {transactions.map(txn => (
                              <tr key={txn.id} className="hover:bg-white">
                                <td className="py-2 pr-3">
                                  <span className="font-mono text-xs text-slate-600">
                                    {txn.tiktokOrderId ? `...${txn.tiktokOrderId.slice(-8)}` : '—'}
                                  </span>
                                </td>
                                <td className="py-2 pr-3">
                                  <div className="text-slate-800">{txn.productName || '—'}</div>
                                  {txn.skuName && (
                                    <div className="text-xs text-slate-500">{txn.skuName}</div>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-slate-700">{txn.quantity ?? '—'}</td>
                                <td className="py-2 pr-3 font-medium text-slate-800">
                                  {fmt(txn.totalSettlementAmount)}
                                </td>
                                <td className="py-2 pr-3">
                                  {txn.shopifyOrderName && txn.shopifyOrderId ? (
                                    <a
                                      href={`https://admin.shopify.com/store/pirani-life/orders/${txn.shopifyOrderId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 font-medium hover:underline"
                                    >
                                      {txn.shopifyOrderName}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3">
                                  {txn.netsuiteTransactionName && txn.netsuiteTransactionId ? (
                                    <a
                                      href={`https://7913744.app.netsuite.com/app/accounting/transactions/cashsale.nl?id=${txn.netsuiteTransactionId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-600 font-medium hover:underline"
                                    >
                                      {txn.netsuiteTransactionName}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2">
                                  {txn.matchStatus === 'matched' ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs">
                                      <CheckCircle2 className="h-3 w-3" /> Matched
                                    </span>
                                  ) : txn.matchStatus === 'unmatched' ? (
                                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs" title={txn.matchError || ''}>
                                      <AlertCircle className="h-3 w-3" /> Unmatched
                                    </span>
                                  ) : txn.matchStatus === 'error' ? (
                                    <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-xs" title={txn.matchError || ''}>
                                      <XCircle className="h-3 w-3" /> Error
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">Pending</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {transactions.length === 0 && (
                          <p className="text-center text-sm text-slate-500 py-4">No order details.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
