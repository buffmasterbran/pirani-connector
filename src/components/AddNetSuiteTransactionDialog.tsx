"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface AddNetSuiteTransactionDialogProps {
  isOpen: boolean
  onClose: () => void
  transaction: {
    id: string
    source_order_id?: string | null
    order_name?: string | null
    amount: number
    net: number
    currency: string
  }
  onSave: (data: {
    netsuiteTransactionId: string
    netsuiteTransactionName: string
    netsuiteAmount: number
    netsuiteTransactionType?: string
  }) => Promise<void>
}

export function AddNetSuiteTransactionDialog({
  isOpen,
  onClose,
  transaction,
  onSave,
}: AddNetSuiteTransactionDialogProps) {
  const [netsuiteTransactionId, setNetsuiteTransactionId] = useState("")
  const [netsuiteTransactionName, setNetsuiteTransactionName] = useState("")
  const [netsuiteAmount, setNetsuiteAmount] = useState("")
  const [transactionType, setTransactionType] = useState<{
    cashSale: boolean
    refund: boolean
    customerRefund: boolean
    payment: boolean
  }>({
    cashSale: false,
    refund: false,
    customerRefund: false,
    payment: false,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)

    if (!netsuiteTransactionId.trim()) {
      setError("NetSuite Transaction ID is required")
      return
    }

    if (!netsuiteTransactionName.trim()) {
      setError("NetSuite Transaction Name is required")
      return
    }

    if (!netsuiteAmount.trim()) {
      setError("NetSuite Amount is required")
      return
    }

    const amount = parseFloat(netsuiteAmount)
    if (isNaN(amount)) {
      setError("NetSuite Amount must be a valid number")
      return
    }

    // Derive type from checkbox selection
    const selectedType = transactionType.customerRefund ? 'customerRefund'
      : transactionType.refund ? 'cashRefund'
      : transactionType.payment ? 'payment'
      : transactionType.cashSale ? 'cashSale'
      : undefined

    setIsSaving(true)
    try {
      await onSave({
        netsuiteTransactionId: netsuiteTransactionId.trim(),
        netsuiteTransactionName: netsuiteTransactionName.trim(),
        netsuiteAmount: amount,
        netsuiteTransactionType: selectedType,
      })
      
      // Reset form
      setNetsuiteTransactionId("")
      setNetsuiteTransactionName("")
      setNetsuiteAmount("")
      setTransactionType({ cashSale: false, refund: false, customerRefund: false, payment: false })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction")
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (!isSaving) {
      setNetsuiteTransactionId("")
      setNetsuiteTransactionName("")
      setNetsuiteAmount("")
      setTransactionType({ cashSale: false, refund: false, customerRefund: false, payment: false })
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add NetSuite Transaction</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="order-id">Order ID</Label>
            <Input
              id="order-id"
              value={transaction.source_order_id && transaction.source_order_id !== 'N/A' 
                ? `#${transaction.source_order_id}` 
                : transaction.order_name || "N/A"}
              disabled
              className="bg-gray-50"
            />
            {transaction.source_order_id && transaction.source_order_id !== 'N/A' && (
              <a
                href={`https://admin.shopify.com/store/pirani-life/orders/${transaction.source_order_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                View order in Shopify →
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shopify-amount">Shopify Amount</Label>
            <Input
              id="shopify-amount"
              value={`${transaction.currency} ${transaction.net.toFixed(2)}`}
              disabled
              className="bg-gray-50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="netsuite-id">
              NetSuite Transaction ID <span className="text-red-500">*</span>
            </Label>
            <Input
              id="netsuite-id"
              value={netsuiteTransactionId}
              onChange={(e) => setNetsuiteTransactionId(e.target.value)}
              placeholder="e.g., 1376989"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              The internal NetSuite transaction ID
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="netsuite-name">
              NetSuite Transaction Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="netsuite-name"
              value={netsuiteTransactionName}
              onChange={(e) => setNetsuiteTransactionName(e.target.value)}
              placeholder="e.g., CS123, RFND296"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              The transaction name/tranid from NetSuite
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="netsuite-amount">
              NetSuite Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="netsuite-amount"
              type="number"
              step="0.01"
              value={netsuiteAmount}
              onChange={(e) => setNetsuiteAmount(e.target.value)}
              placeholder={`e.g., ${transaction.net.toFixed(2)}`}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              The transaction amount from NetSuite (will be compared with Shopify amount)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Transaction Type</Label>
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="type-cash-sale"
                  checked={transactionType.cashSale}
                  onCheckedChange={(checked) =>
                    setTransactionType((prev) => ({ ...prev, cashSale: checked === true }))
                  }
                  disabled={isSaving}
                />
                <Label
                  htmlFor="type-cash-sale"
                  className="text-sm font-normal cursor-pointer"
                >
                  Cash Sale
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="type-refund"
                  checked={transactionType.refund}
                  onCheckedChange={(checked) =>
                    setTransactionType((prev) => ({ ...prev, refund: checked === true }))
                  }
                  disabled={isSaving}
                />
                <Label
                  htmlFor="type-refund"
                  className="text-sm font-normal cursor-pointer"
                >
                  Cash Refund
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="type-customer-refund"
                  checked={transactionType.customerRefund}
                  onCheckedChange={(checked) =>
                    setTransactionType((prev) => ({ ...prev, customerRefund: checked === true }))
                  }
                  disabled={isSaving}
                />
                <Label
                  htmlFor="type-customer-refund"
                  className="text-sm font-normal cursor-pointer"
                >
                  Customer Refund
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="type-payment"
                  checked={transactionType.payment}
                  onCheckedChange={(checked) =>
                    setTransactionType((prev) => ({ ...prev, payment: checked === true }))
                  }
                  disabled={isSaving}
                />
                <Label
                  htmlFor="type-payment"
                  className="text-sm font-normal cursor-pointer"
                >
                  Payment
                </Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Select the transaction type(s) to help identify this NetSuite transaction
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

