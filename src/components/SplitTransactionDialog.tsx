'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Loader2 } from 'lucide-react'

interface SplitChild {
  id: string
  netsuiteTransactionId: string | null
  netsuiteTransactionName: string | null
  netsuiteAmount: number | null
  amount: number
  amountDescription?: string | null
}

interface PayoutMappingOption {
  id: number
  netsuiteId: string
  description: string | null
  mappingType: string
}

interface SplitTransactionDialogProps {
  isOpen: boolean
  onClose: () => void
  transaction: {
    id: string
    source_order_id: string
    order_name?: string | null
    amount: number
    fee: number
    net: number
    type: string
    currency: string
    children?: SplitChild[]
  } | null
  onSaved: () => void
}

export function SplitTransactionDialog({ isOpen, onClose, transaction, onSaved }: SplitTransactionDialogProps) {
  const [children, setChildren] = useState<SplitChild[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // NS transaction mode state
  const [nsId, setNsId] = useState('')
  const [nsName, setNsName] = useState('')
  const [nsAmount, setNsAmount] = useState('')

  // Account line mode state
  const [addMode, setAddMode] = useState<'ns_transaction' | 'account_line'>('ns_transaction')
  const [payoutMappings, setPayoutMappings] = useState<PayoutMappingOption[]>([])
  const [loadingMappings, setLoadingMappings] = useState(false)
  const [selectedMappingId, setSelectedMappingId] = useState('')
  const [acctAmount, setAcctAmount] = useState('')

  const loadChildren = useCallback(async () => {
    if (!transaction) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/payouts/transactions/${transaction.id}/split`)
      const data = await res.json()
      if (res.ok) {
        setChildren(data.children ?? [])
      }
    } catch (e) {
      console.error('Failed to load split children:', e)
    } finally {
      setIsLoading(false)
    }
  }, [transaction])

  const loadMappings = useCallback(async () => {
    setLoadingMappings(true)
    try {
      const res = await fetch('/api/mappings/payout-mappings')
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        const excluded = ['deposit_account', 'fees_account']
        setPayoutMappings(
          data.data.filter((m: PayoutMappingOption) =>
            !excluded.includes(m.mappingType) && (m as any).isActive !== false
          )
        )
      }
    } catch (e) {
      console.error('Failed to load payout mappings:', e)
    } finally {
      setLoadingMappings(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && transaction) {
      if (transaction.children && transaction.children.length > 0) {
        setChildren(transaction.children)
      } else {
        loadChildren()
      }
      loadMappings()
      setError(null)
      setNsId('')
      setNsName('')
      setNsAmount('')
      setAddMode('ns_transaction')
      setSelectedMappingId('')
      setAcctAmount('')
    }
  }, [isOpen, transaction, loadChildren, loadMappings])

  if (!transaction) return null

  const originalAmount = Math.abs(typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount)
  const allocatedAmount = children.reduce((sum, c) => sum + Math.abs(c.netsuiteAmount ?? c.amount ?? 0), 0)
  const remaining = originalAmount - allocatedAmount
  // Treat over-allocated the same as fully matched — allocations are "done"
  // (the Shopify payout amount ≠ the NS Cash Sale amount for marketplace tax orders)
  const isFullyMatched = remaining <= 0.01
  const currency = transaction.currency || 'USD'

  const handleAdd = async () => {
    if (addMode === 'ns_transaction') {
      if (!nsId.trim()) {
        setError('NetSuite Transaction ID is required')
        return
      }
      const amount = parseFloat(nsAmount)
      if (isNaN(amount) || amount === 0) {
        setError('A valid amount is required')
        return
      }

      setIsSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/payouts/transactions/${transaction.id}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            netsuiteTransactionId: nsId.trim(),
            netsuiteTransactionName: nsName.trim() || null,
            netsuiteAmount: amount,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to add')
          return
        }
        setChildren(prev => [...prev, data.child])
        setNsId('')
        setNsName('')
        setNsAmount('')
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add')
      } finally {
        setIsSaving(false)
      }
    } else {
      if (!selectedMappingId) {
        setError('Select a GL account')
        return
      }
      const amount = parseFloat(acctAmount)
      if (isNaN(amount) || amount === 0) {
        setError('A valid amount is required')
        return
      }

      setIsSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/payouts/transactions/${transaction.id}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountDescription: selectedMappingId,
            amount,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to add')
          return
        }
        setChildren(prev => [...prev, data.child])
        setSelectedMappingId('')
        setAcctAmount('')
        onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add')
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handleRemove = async (childId: string) => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/payouts/transactions/${transaction.id}/split?childId=${encodeURIComponent(childId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to remove')
        return
      }
      setChildren(prev => prev.filter(c => c.id !== childId))
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setIsSaving(false)
    }
  }

  const fmt = (n: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
  }

  const getMappingLabel = (netsuiteId: string) => {
    const mapping = payoutMappings.find(m => m.netsuiteId === netsuiteId)
    return mapping?.description || netsuiteId
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Transaction into Multiple NS Matches</DialogTitle>
        </DialogHeader>

        {/* How splits work */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium">How splits work:</p>
          <p className="mt-1 text-xs text-blue-700">
            When you split a transaction, the original parent line is automatically set to &quot;Ignore&quot; in the deposit.
            Only the child allocations below are included. This prevents double-counting.
          </p>
        </div>

        {/* Original transaction info */}
        <div className="p-4 bg-slate-50 rounded-lg border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Transaction</span>
            <span className="font-mono">#{transaction.id}</span>
          </div>
          {transaction.order_name && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order</span>
              <span>{transaction.order_name}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Type</span>
            <span className="capitalize">{transaction.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Shopify Amount</span>
            <span className="text-lg font-bold">{fmt(originalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fee</span>
            <span>{fmt(typeof transaction.fee === 'string' ? parseFloat(transaction.fee) : transaction.fee)}</span>
          </div>
        </div>

        {/* Running total */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
          <div className="text-sm">
            <span className="text-muted-foreground">Allocated: </span>
            <span className="font-semibold">{fmt(allocatedAmount)}</span>
            <span className="text-muted-foreground"> of {fmt(originalAmount)}</span>
          </div>
          <div className={`text-sm font-bold ${Math.abs(remaining) < 0.01 ? 'text-green-600' : remaining < 0 ? 'text-slate-500' : 'text-orange-600'}`}>
            {Math.abs(remaining) < 0.01 ? 'Fully matched' : remaining < 0 ? `Allocations set` : `Remaining: ${fmt(remaining)}`}
          </div>
        </div>

        {/* Children list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : children.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">NS ID / Account</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name / Description</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody>
                {children.map((child, idx) => (
                  <tr key={child.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {child.netsuiteTransactionId
                        ? <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium">NS Txn</span>
                        : <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-xs font-medium">GL Acct</span>
                      }
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {child.netsuiteTransactionId || child.amountDescription || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {child.netsuiteTransactionId
                        ? (child.netsuiteTransactionName || '—')
                        : (child.amountDescription ? getMappingLabel(child.amountDescription) : '—')
                      }
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(child.netsuiteAmount ?? child.amount)}</td>
                    <td className="px-3 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(child.id)}
                        disabled={isSaving}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No allocations added yet. Add one below.
          </div>
        )}

        {/* Add form - hidden when fully matched */}
        {!isFullyMatched && (
          <div className="p-4 border rounded-lg bg-white space-y-3">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={addMode === 'ns_transaction' ? 'default' : 'outline'}
                onClick={() => { setAddMode('ns_transaction'); setError(null) }}
                className="h-8 text-xs"
              >
                NS Transaction
              </Button>
              <Button
                size="sm"
                variant={addMode === 'account_line' ? 'default' : 'outline'}
                onClick={() => { setAddMode('account_line'); setError(null) }}
                className="h-8 text-xs"
              >
                Account Line
              </Button>
            </div>

            {addMode === 'ns_transaction' && (
              <>
                <p className="text-sm font-medium">Add NetSuite Transaction</p>
                <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground">NS Transaction ID</label>
                    <Input
                      placeholder="e.g. 1517260"
                      value={nsId}
                      onChange={(e) => setNsId(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">NS Name (optional)</label>
                    <Input
                      placeholder="e.g. CS44774"
                      value={nsName}
                      onChange={(e) => setNsName(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Amount</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="15.00"
                      value={nsAmount}
                      onChange={(e) => setNsAmount(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    onClick={handleAdd}
                    disabled={isSaving || !nsId.trim()}
                    size="sm"
                    className="h-9"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}

            {addMode === 'account_line' && (
              <>
                <p className="text-sm font-medium">Add GL Account Line</p>
                <p className="text-xs text-muted-foreground">Routes this amount to a specific NetSuite account on the deposit (e.g. marketplace tax).</p>
                <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground">GL Account</label>
                    <Select
                      value={selectedMappingId}
                      onValueChange={setSelectedMappingId}
                      disabled={loadingMappings}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={loadingMappings ? 'Loading...' : 'Select account...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {payoutMappings.map(m => (
                          <SelectItem key={m.id} value={m.netsuiteId}>
                            {m.description || m.netsuiteId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Amount</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="9.36"
                      value={acctAmount}
                      onChange={(e) => setAcctAmount(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    onClick={handleAdd}
                    disabled={isSaving || !selectedMappingId}
                    size="sm"
                    className="h-9"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
