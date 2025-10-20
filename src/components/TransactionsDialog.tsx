import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TransactionsTable } from "@/components/TransactionsTable"

interface TransactionsDialogProps {
  isOpen: boolean
  onClose: () => void
  payoutId: string | null
  transactions: Array<{
    id: string
    source_order_id: string
    amount: string | number
    fee: string | number
    net: string | number
    type: string
    currency: string
    processedAt: string
  }>
  isLoading: boolean
  hideSensitiveData?: boolean
}

export function TransactionsDialog({ 
  isOpen, 
  onClose, 
  payoutId, 
  transactions, 
  isLoading, 
  hideSensitiveData = false 
}: TransactionsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transactions for Payout #{payoutId ? String(payoutId).slice(-8) : ''}
          </DialogTitle>
        </DialogHeader>
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
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
