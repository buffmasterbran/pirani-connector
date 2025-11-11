import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { safeFormatDate } from "@/lib/dateUtils"

interface Transaction {
  id: string
  source_order_id: string
  order_name?: string | null
  amount: number
  fee: number
  net: number
  type: string
  currency: string
  processedAt: string | null
  netsuiteTransactionId?: string | null
  netsuiteTransactionName?: string | null
  netsuiteAmount?: number | null
  amountMismatch?: boolean
}

interface TransactionsTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  hideSensitiveData?: boolean
}

export function TransactionsTable({ transactions, isLoading, hideSensitiveData = false }: TransactionsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions found for this payout.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Transaction ID</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Order Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Net</TableHead>
            <TableHead>NetSuite ID</TableHead>
            <TableHead>Processed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">
                {transaction.id ? `#${String(transaction.id).slice(-8)}` : 'N/A'}
              </TableCell>
              <TableCell className="font-medium">
                {transaction.source_order_id ? `#${transaction.source_order_id}` : 'N/A'}
              </TableCell>
              <TableCell>
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  transaction.order_name || '—'
                )}
              </TableCell>
              <TableCell>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {transaction.type}
                </span>
              </TableCell>
              <TableCell>
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${transaction.currency} ${Number(transaction.amount).toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="text-red-600">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `-${transaction.currency} ${Number(transaction.fee).toFixed(2)}`
                )}
              </TableCell>
              <TableCell className="font-medium">
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : (
                  `${transaction.currency} ${Number(transaction.net).toFixed(2)}`
                )}
              </TableCell>
              <TableCell>
                {hideSensitiveData ? (
                  <span className="text-gray-500">••••••</span>
                ) : transaction.amountMismatch ? (
                  <div className="space-y-1">
                    {transaction.netsuiteTransactionName && (
                      <div className="text-sm font-medium text-red-600">
                        {transaction.netsuiteTransactionName}
                      </div>
                    )}
                    <div className="text-xs text-red-600">
                      Amount mismatch!
                    </div>
                    {transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        NS: {transaction.currency} {Math.abs(transaction.netsuiteAmount).toFixed(2)}
                      </div>
                    )}
                  </div>
                ) : transaction.netsuiteTransactionName ? (
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-green-600">
                      {transaction.netsuiteTransactionName}
                    </div>
                    {transaction.netsuiteTransactionId && (
                      <div className="text-xs text-muted-foreground">
                        ID: {transaction.netsuiteTransactionId}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {safeFormatDate(transaction.processedAt || undefined, 'MMM dd, yyyy HH:mm')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
