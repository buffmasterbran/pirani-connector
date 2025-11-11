"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TransactionsTable } from "@/components/TransactionsTable"
import { Download, Loader2, Database } from "lucide-react"

interface TransactionsDialogProps {
  isOpen: boolean
  onClose: () => void
  payoutId: string | null
  transactions: Array<{
    id: string
    source_order_id: string
    order_name?: string | null
    amount: string | number
    fee: string | number
    net: string | number
    type: string
    currency: string
    processedAt: string | null
    netsuiteTransactionId?: string | null
    netsuiteTransactionName?: string | null
    netsuiteAmount?: number | null
    amountMismatch?: boolean
  }>
  isLoading: boolean
  hideSensitiveData?: boolean
  onRefreshTransactions?: () => void
}

export function TransactionsDialog({ 
  isOpen, 
  onClose, 
  payoutId, 
  transactions, 
  isLoading, 
  hideSensitiveData = false,
  onRefreshTransactions
}: TransactionsDialogProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [isFetchingNS, setIsFetchingNS] = useState(false)

  // Identify transactions with missing orders
  const missingOrderIds = transactions
    .filter(t => {
      const hasOrderId = t.source_order_id && t.source_order_id !== 'N/A'
      const missingOrderName = !t.order_name || t.order_name === '—'
      return hasOrderId && missingOrderName
    })
    .map(t => t.source_order_id)
    .filter((id, index, self) => self.indexOf(id) === index) // unique

  // Identify transactions with missing NetSuite IDs
  const missingNSTransactions = transactions.filter(
    t => t.order_name && t.order_name !== '—' && !t.netsuiteTransactionId
  )

  // Calculate totals
  const totalShopifyAmount = transactions.reduce((sum, t) => {
    const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
    return sum + (amount || 0)
  }, 0)

  const totalNetSuiteAmount = transactions.reduce((sum, t) => {
    return sum + (t.netsuiteAmount || 0)
  }, 0)

  const totalFees = transactions.reduce((sum, t) => {
    const fee = typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee
    return sum + (fee || 0)
  }, 0)

  const totalNet = transactions.reduce((sum, t) => {
    const net = typeof t.net === 'string' ? parseFloat(t.net) : t.net
    return sum + (net || 0)
  }, 0)

  const currency = transactions[0]?.currency || 'USD'
  const transactionsWithNS = transactions.filter(t => t.netsuiteTransactionId)

  const handleImportMissingOrders = async () => {
    if (missingOrderIds.length === 0) return

    setIsImporting(true)
    try {
      const response = await fetch('/api/orders/import-by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderIds: missingOrderIds }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const importedCount = data.imported || 0
        const updatedCount = data.updated || 0
        const totalProcessed = importedCount + updatedCount
        
        if (data.errors && data.errors.length > 0) {
          console.warn('Some orders failed to import:', data.errors)
          alert(`Imported ${totalProcessed} order(s). Some orders failed to import. Check console for details.`)
        } else {
          alert(`Successfully imported ${importedCount} new order(s) and updated ${updatedCount} existing order(s).`)
        }

        // Refresh transactions to show the newly imported order names
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error importing orders:', data.error)
        alert(`Error importing orders: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error importing orders:', error)
      alert(`Error importing orders: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleFetchMissingNSTransactions = async () => {
    if (!payoutId || missingNSTransactions.length === 0) return

    setIsFetchingNS(true)
    try {
      const response = await fetch(`/api/payouts/${payoutId}/netsuite-transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const updatedCount = data.updated || 0
        const errorCount = data.errors?.length || 0
        
        if (data.errors && data.errors.length > 0) {
          const errorMessage = data.errors.slice(0, 5).join('\n')
          const moreErrors = data.errors.length > 5 ? `\n... and ${data.errors.length - 5} more` : ''
          alert(`Updated ${updatedCount} transaction(s) with NetSuite IDs.\n\nAmount mismatches:\n${errorMessage}${moreErrors}`)
        } else {
          alert(`Successfully fetched NetSuite IDs for ${updatedCount} transaction(s).`)
        }

        // Refresh transactions to show the newly fetched NetSuite IDs
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error fetching NetSuite transactions:', data.error)
        alert(`Error fetching NetSuite transactions: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching NetSuite transactions:', error)
      alert(`Error fetching NetSuite transactions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsFetchingNS(false)
    }
  }

  const handleDeleteNetSuiteId = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete the NetSuite transaction ID? This will allow you to reimport it after resolving issues.')) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/transactions/${transactionId}/clear-netsuite`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh transactions to show the updated data
        if (onRefreshTransactions) {
          onRefreshTransactions()
        }
      } else {
        console.error('Error deleting NetSuite transaction ID:', data.error)
        alert(`Error deleting NetSuite transaction ID: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting NetSuite transaction ID:', error)
      alert(`Error deleting NetSuite transaction ID: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transactions for Payout #{payoutId ? String(payoutId).slice(-8) : ''}
          </DialogTitle>
        </DialogHeader>
        
        {/* Summary Totals */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Shopify Total</p>
              <p className="text-lg font-semibold">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${currency} ${totalShopifyAmount.toFixed(2)}`
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">NetSuite Total</p>
              <p className={`text-lg font-semibold ${transactionsWithNS.length > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : transactionsWithNS.length > 0 ? (
                  `${currency} ${Math.abs(totalNetSuiteAmount).toFixed(2)}`
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Fees</p>
              <p className="text-lg font-semibold text-red-600">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${currency} ${totalFees.toFixed(2)}`
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Net Amount</p>
              <p className="text-lg font-semibold">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${currency} ${totalNet.toFixed(2)}`
                )}
              </p>
            </div>
          </div>
          {transactionsWithNS.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                {transactionsWithNS.length} of {transactions.length} transactions matched with NetSuite
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {missingOrderIds.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {missingOrderIds.length} order{missingOrderIds.length !== 1 ? 's' : ''} missing from database
              </p>
              <Button
                onClick={handleImportMissingOrders}
                disabled={isImporting}
                size="sm"
                className="flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Import Missing Orders
                  </>
                )}
              </Button>
            </div>
          )}
          {missingNSTransactions.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {missingNSTransactions.length} transaction{missingNSTransactions.length !== 1 ? 's' : ''} missing NetSuite IDs
              </p>
              <Button
                onClick={handleFetchMissingNSTransactions}
                disabled={isFetchingNS}
                size="sm"
                variant="outline"
                className="flex items-center gap-2"
              >
                {isFetchingNS ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    Get Missing NS Transactions
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4">
          <TransactionsTable
            transactions={transactions.map(t => ({
              ...t,
              amount: typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount,
              fee: typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee,
              net: typeof t.net === 'string' ? parseFloat(t.net) : t.net,
            }))}
            isLoading={isLoading}
            hideSensitiveData={hideSensitiveData}
            onDeleteNetSuiteId={handleDeleteNetSuiteId}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
