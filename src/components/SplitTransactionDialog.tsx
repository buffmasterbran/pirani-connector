'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Loader2 } from 'lucide-react'

interface SplitChild {
  id: string
  netsuiteTransactionId: string | null
  netsuiteTransactionName: string | null
  netsuiteAmount: number | null
  amount: number
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

  const [nsId, setNsId] = useState('')
  const [nsName, setNsName] = useState('')
  const [nsAmount, setNsAmount] = useState('')

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

  useEffect(() => {
    if (isOpen && transaction) {
      if (transaction.children && transaction.children.length > 0) {
        setChildren(transaction.children)
      } else {
        loadChildren()
      }
      setError(null)
      setNsId('')
      setNsName('')
      setNsAmount('')
    }
  }, [isOpen, transaction, loadChildren])

  if (!transaction) return null

  const originalAmount = Math.abs(typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount)
  const allocatedAmount = children.reduce((sum, c) => sum + Math.abs(c.netsuiteAmount ?? c.amount ?? 0), 0)
  const remaining = originalAmount - allocatedAmount
  const isFullyMatched = remaining < 0.01
  const currency = transaction.currency || 'USD'

  const handleAdd = async () => {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Transaction into Multiple NS Matches</DialogTitle>
        </DialogHeader>

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
          <div className={`text-sm font-bold ${Math.abs(remaining) < 0.01 ? 'text-green-600' : remaining < 0 ? 'text-red-600' : 'text-orange-600'}`}>
            {Math.abs(remaining) < 0.01 ? 'Fully matched' : `Remaining: ${fmt(remaining)}`}
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
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">NS Transaction ID</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">NS Name</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody>
                {children.map((child, idx) => (
                  <tr key={child.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{child.netsuiteTransactionId}</td>
                    <td className="px-3 py-2">{child.netsuiteTransactionName || '—'}</td>
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
            No NS transactions added yet. Add one below.
          </div>
        )}

        {/* Add form - hidden when fully matched */}
        {!isFullyMatched && (
          <div className="p-4 border rounded-lg bg-white space-y-3">
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
