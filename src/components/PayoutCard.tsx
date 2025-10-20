import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { safeFormatDate } from "@/lib/dateUtils"

interface PayoutCardProps {
  payout: {
    id: string | number
    date: string
    amount: string | number
    currency: string
    status: string
    inDatabase?: boolean
    addedToDatabaseAt?: string
    netsuiteDepositNumber?: string | null
  }
  onViewTransactions: (payoutId: string) => void
  isLoading?: boolean
  hideSensitiveData?: boolean
}

export function PayoutCard({ payout, onViewTransactions, isLoading, hideSensitiveData = false }: PayoutCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-lg">
          Payout #{String(payout.id).slice(-8)}
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          {safeFormatDate(payout.date, 'MMM dd, yyyy')}
        </div>
        <div className="flex gap-2 mt-2">
          {payout.inDatabase && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              ✓ In DB
              {payout.addedToDatabaseAt && (
                <span className="ml-1 text-green-600">
                  ({safeFormatDate(payout.addedToDatabaseAt, 'MM/dd')})
                </span>
              )}
            </span>
          )}
          {payout.netsuiteDepositNumber && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              ✓ NS: {payout.netsuiteDepositNumber}
            </span>
          )}
          {payout.inDatabase && !payout.netsuiteDepositNumber && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              Ready for NS
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Amount:</span>
          <span className="font-bold">
            {hideSensitiveData ? (
              <span className="text-gray-500">••••••</span>
            ) : (
              `${payout.currency} ${Number(payout.amount).toFixed(2)}`
            )}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Status:</span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            payout.status === 'paid' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {payout.status}
          </span>
        </div>
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onViewTransactions(String(payout.id))}
                disabled={isLoading}
              >
                View Transactions
              </Button>
            </div>
      </CardContent>
    </Card>
  )
}
