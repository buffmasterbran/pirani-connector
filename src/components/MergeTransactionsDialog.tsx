"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { GitMerge, AlertTriangle } from "lucide-react"

interface Transaction {
  id: string
  source_order_id: string
  order_name?: string | null
  amount: number
  fee: number
  net: number
  type: string
  currency: string
  netsuiteTransactionId?: string | null
  netsuiteTransactionName?: string | null
}

interface MergeTransactionsDialogProps {
  isOpen: boolean
  onClose: () => void
  transactions: Transaction[]
  selectedTransactionIds: string[]
  onMerge: (sourceTransactionIds: string[], targetTransactionId: string) => Promise<void>
}

export function MergeTransactionsDialog({
  isOpen,
  onClose,
  transactions,
  selectedTransactionIds,
  onMerge,
}: MergeTransactionsDialogProps) {
  const [targetTransactionId, setTargetTransactionId] = useState<string>(selectedTransactionIds[selectedTransactionIds.length - 1] || "")
  const [isMerging, setIsMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTransactions = transactions.filter(t => selectedTransactionIds.includes(t.id))
  const sourceTransactionIds = selectedTransactionIds.filter(id => id !== targetTransactionId)

  // Calculate combined totals
  const combinedAmount = selectedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
  const combinedFee = selectedTransactions.reduce((sum, t) => sum + (t.fee || 0), 0)
  const combinedNet = selectedTransactions.reduce((sum, t) => sum + (t.net || 0), 0)

  const currency = selectedTransactions[0]?.currency || 'USD'

  const handleMerge = async () => {
    if (sourceTransactionIds.length === 0) {
      setError("Please select at least one source transaction to merge")
      return
    }

    if (!targetTransactionId) {
      setError("Please select a target transaction")
      return
    }

    setError(null)
    setIsMerging(true)

    try {
      await onMerge(sourceTransactionIds, targetTransactionId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge transactions")
    } finally {
      setIsMerging(false)
    }
  }

  const handleClose = () => {
    if (!isMerging) {
      setError(null)
      setTargetTransactionId(selectedTransactionIds[selectedTransactionIds.length - 1] || "")
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Transactions
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>{selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? 's' : ''}</strong> will be merged. 
              Select which transaction will be kept (target), and the others will be deleted after merging their amounts and fees.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold mb-3 block">Select Target Transaction (to keep)</Label>
              <RadioGroup value={targetTransactionId} onValueChange={setTargetTransactionId}>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                  {selectedTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded">
                      <RadioGroupItem value={transaction.id} id={transaction.id} className="mt-1" />
                      <Label htmlFor={transaction.id} className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">
                              Transaction #{String(transaction.id).slice(-8)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {transaction.order_name ? `Order: ${transaction.order_name}` : `Order ID: ${transaction.source_order_id}`}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Type: {transaction.type} • Amount: {currency} {transaction.amount.toFixed(2)} • Fee: {currency} {transaction.fee.toFixed(2)}
                            </div>
                            {transaction.netsuiteTransactionId && (
                              <div className="text-xs text-green-600 mt-1">
                                NetSuite: {transaction.netsuiteTransactionName} ({transaction.netsuiteTransactionId})
                              </div>
                            )}
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {sourceTransactionIds.length > 0 && (
              <div>
                <Label className="text-base font-semibold mb-2 block">Source Transactions (to be deleted)</Label>
                <div className="space-y-1 text-sm text-muted-foreground pl-4">
                  {selectedTransactions
                    .filter(t => sourceTransactionIds.includes(t.id))
                    .map(t => (
                      <div key={t.id}>
                        • Transaction #{String(t.id).slice(-8)} ({currency} {t.amount.toFixed(2)})
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-50 border rounded-md">
              <Label className="text-base font-semibold mb-3 block">Combined Totals Preview</Label>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Combined Amount:</span>
                  <span className="font-medium">{currency} {combinedAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Combined Fee:</span>
                  <span className="font-medium">{currency} {combinedFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-semibold">Combined Net:</span>
                  <span className="font-bold text-lg">{currency} {combinedNet.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isMerging || sourceTransactionIds.length === 0}
            className="flex items-center gap-2"
          >
            <GitMerge className="h-4 w-4" />
            {isMerging ? "Merging..." : "Merge Transactions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

