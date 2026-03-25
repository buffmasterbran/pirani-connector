'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Loader2 } from 'lucide-react'

interface SavedPayout {
  id: string
  netsuiteDepositNumber?: string | null
  transactionCount?: number
  transactions?: any[]
}

export function OverviewSection() {
  const [savedPayouts, setSavedPayouts] = useState<SavedPayout[]>([])
  const [clearDbDialog, setClearDbDialog] = useState<{isOpen: boolean, isClearing: boolean}>({
    isOpen: false,
    isClearing: false
  })

  const fetchSavedPayouts = async () => {
    try {
      const response = await fetch(`/api/payouts?t=${Date.now()}`)
      const result = await response.json()
      if (result.success) {
        setSavedPayouts(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching saved payouts:', error)
    }
  }

  const handleClearDatabase = async () => {
    setClearDbDialog({ isOpen: true, isClearing: true })
    try {
      const response = await fetch('/api/admin/clear-database', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        fetchSavedPayouts()
        setClearDbDialog({ isOpen: false, isClearing: false })
        const stats = data.stats || {}
        alert(`Database cleared successfully!\n\nDeleted:\n- ${stats.transactions || 0} transactions\n- ${stats.payouts || 0} payouts\n- ${stats.orderLines || 0} order lines\n- ${stats.orders || 0} orders\n- ${stats.customerAddresses || 0} customer addresses\n- ${stats.customers || 0} customers`)
      } else {
        console.error('Error clearing database:', data.error)
        alert(`Error clearing database: ${data.error || 'Unknown error'}`)
        setClearDbDialog({ isOpen: false, isClearing: false })
      }
    } catch (error) {
      console.error('Error clearing database:', error)
      alert(`Error clearing database: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setClearDbDialog({ isOpen: false, isClearing: false })
    }
  }

  useEffect(() => {
    fetchSavedPayouts()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Overview</h2>
        <p className="text-slate-600">Welcome to Pirani Payout Sync - your Shopify to NetSuite integration hub.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-600 mb-2">{savedPayouts.length}</div>
            <div className="text-sm text-emerald-700">Saved Payouts</div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {savedPayouts.filter(p => p.netsuiteDepositNumber).length}
            </div>
            <div className="text-sm text-blue-700">NetSuite Synced</div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600 mb-2">
              {savedPayouts.filter(p => !p.netsuiteDepositNumber).length}
            </div>
            <div className="text-sm text-orange-700">Ready for NS</div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-600 mb-2">
              {savedPayouts.reduce((sum, p) => sum + (p.transactionCount ?? p.transactions?.length ?? 0), 0)}
            </div>
            <div className="text-sm text-slate-700">Total Transactions</div>
          </div>
        </Card>
      </div>

      {/* Clear Database Button */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-1">Database Management</h3>
              <p className="text-sm text-red-700">Clear all payouts, transactions, and order lines from the database.</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setClearDbDialog({ isOpen: true, isClearing: false })}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear Database
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Clear Database Confirmation Dialog */}
      <Dialog open={clearDbDialog.isOpen} onOpenChange={(open) => {
        if (!clearDbDialog.isClearing) {
          setClearDbDialog({ isOpen: open, isClearing: false })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Clear Database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-700">
              Are you sure you want to clear the entire database? This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              <li>All payouts and transactions</li>
              <li>All orders and order lines</li>
              <li>All customers and customer addresses</li>
            </ul>
            <p className="text-sm font-semibold text-red-600">
              This action cannot be undone!
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setClearDbDialog({ isOpen: false, isClearing: false })}
                disabled={clearDbDialog.isClearing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearDatabase}
                disabled={clearDbDialog.isClearing}
                className="flex items-center gap-2"
              >
                {clearDbDialog.isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Clear Database
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
