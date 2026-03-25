"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface AuditLogEntry {
  id: number
  transactionId: string
  payoutId: string
  action: string
  details: Record<string, any> | null
  createdAt: string
}

interface AuditLogDialogProps {
  isOpen: boolean
  onClose: () => void
  payoutId: string | null
}

const ACTION_LABELS: Record<string, string> = {
  merge: 'Merged Transactions',
  split: 'Split Transaction',
  reassign_netsuite: 'Reassigned NetSuite ID',
  clear_netsuite: 'Cleared NetSuite ID',
  add_netsuite: 'Added NetSuite ID',
  toggle_include: 'Toggled Include in NS',
  set_amount_desc: 'Set Amount Description',
  set_fee_desc: 'Set Fee Description',
  set_other_fees_desc: 'Set Other Fees Description',
}

function formatAmount(val: any): string {
  if (val === null || val === undefined) return '—'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return String(val)
  return `$${num.toFixed(2)}`
}

function formatDetail(action: string, details: Record<string, any> | null): React.ReactNode {
  if (!details) return null

  switch (action) {
    case 'merge': {
      const sources = details.before?.sources || []
      const after = details.after
      return (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Merged {sources.length} transaction{sources.length !== 1 ? 's' : ''} into target
          </div>
          {sources.map((s: any, i: number) => (
            <div key={i} className="text-xs pl-2 border-l-2 border-muted">
              {s.type} — Amount: {formatAmount(s.amount)}, Fee: {formatAmount(s.fee)}, Net: {formatAmount(s.net)}
            </div>
          ))}
          {after && (
            <div className="text-xs font-medium">
              Result → Amount: {formatAmount(after.amount)}, Fee: {formatAmount(after.fee)}, Net: {formatAmount(after.net)}
            </div>
          )}
        </div>
      )
    }
    case 'split': {
      const parts = details.parts || []
      return (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Original: Amount {formatAmount(details.originalAmount)}, Fee {formatAmount(details.originalFee)}
          </div>
          <div className="text-xs text-muted-foreground">Split into {parts.length} parts</div>
          {parts.map((p: any, i: number) => (
            <div key={i} className="text-xs pl-2 border-l-2 border-muted">
              Part {i + 1}: Amount {formatAmount(p.amount)}, Fee {formatAmount(p.fee)}
            </div>
          ))}
        </div>
      )
    }
    case 'reassign_netsuite':
      return (
        <div className="text-xs space-y-0.5">
          <div>From transaction: <span className="font-mono">{details.fromTransactionId}</span></div>
          <div>NS: {details.netsuiteTransactionName} ({formatAmount(details.netsuiteAmount)})</div>
        </div>
      )
    case 'clear_netsuite':
      return (
        <div className="text-xs space-y-0.5">
          <div>Cleared: {details.before?.netsuiteTransactionName}</div>
          <div>NS Amount was: {formatAmount(details.before?.netsuiteAmount)}</div>
        </div>
      )
    case 'add_netsuite':
      return (
        <div className="text-xs space-y-0.5">
          <div>NS: {details.netsuiteTransactionName} ({formatAmount(details.netsuiteAmount)})</div>
          {details.amountMismatch && <div className="text-orange-600 font-medium">Amount mismatch flagged</div>}
        </div>
      )
    case 'toggle_include':
      return (
        <div className="text-xs">
          {details.includeInNetSuite ? 'Included in NetSuite deposit' : 'Excluded from NetSuite deposit'}
        </div>
      )
    case 'set_amount_desc':
    case 'set_fee_desc':
    case 'set_other_fees_desc':
      return (
        <div className="text-xs space-y-0.5">
          <div>Before: <span className="font-mono">{details.before ?? '(none)'}</span></div>
          <div>After: <span className="font-mono">{details.after ?? '(none)'}</span></div>
        </div>
      )
    default:
      return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(details, null, 2)}</pre>
  }
}

export function AuditLogDialog({ isOpen, onClose, payoutId }: AuditLogDialogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !payoutId) return
    setLoading(true)
    fetch(`/api/payouts/${payoutId}/audit-log`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setLogs(data.data)
      })
      .catch(err => console.error('Error fetching audit logs:', err))
      .finally(() => setLoading(false))
  }, [isOpen, payoutId])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Log — Payout #{payoutId}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No activity recorded yet for this payout.
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const date = new Date(log.createdAt)
              const timeStr = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })

              return (
                <div key={log.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeStr}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Transaction: {log.transactionId}
                  </div>
                  {log.details && formatDetail(log.action, log.details)}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
