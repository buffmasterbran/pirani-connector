import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { safeFormatDate } from "@/lib/dateUtils"
import { useState } from "react"

interface Transaction {
  id: string
  source_order_id: string
  amount: number
  fee: number
  net: number
  type: string
  currency: string
  processedAt: string
}

interface TransactionsTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  onFetchOrderNumber?: (orderId: string) => Promise<string | null>
  hideSensitiveData?: boolean
}

export function TransactionsTable({ transactions, isLoading, onFetchOrderNumber, hideSensitiveData = false }: TransactionsTableProps) {
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({})
  const [loadingOrders, setLoadingOrders] = useState<Record<string, boolean>>({})

  const fetchOrderNumber = async (orderId: string) => {
    if (!orderId || orderId === 'N/A' || loadingOrders[orderId] || orderNumbers[orderId]) return

    setLoadingOrders(prev => ({ ...prev, [orderId]: true }))
    try {
      const response = await fetch(`/api/shopify/orders/${orderId}`)
      const data = await response.json()
      if (response.ok && data.order) {
        setOrderNumbers(prev => ({ ...prev, [orderId]: data.order.order_number || data.order.name || orderId }))
      } else {
        setOrderNumbers(prev => ({ ...prev, [orderId]: 'Not Found' }))
      }
    } catch (error) {
      console.error('Error fetching order number:', error)
      setOrderNumbers(prev => ({ ...prev, [orderId]: 'Error' }))
    } finally {
      setLoadingOrders(prev => ({ ...prev, [orderId]: false }))
    }
  }
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
                <TableHead>Order ID</TableHead>
                <TableHead>Order Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Processed At</TableHead>
                <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">
                {transaction.source_order_id ? `#${transaction.source_order_id}` : 'N/A'}
              </TableCell>
               <TableCell>
                 {hideSensitiveData ? (
                   <span className="text-gray-500">••••••</span>
                 ) : (
                   orderNumbers[transaction.source_order_id] ? (
                     <span className="font-medium text-green-600">
                       #{orderNumbers[transaction.source_order_id]}
                     </span>
                   ) : (
                     <span className="text-muted-foreground">-</span>
                   )
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
                  <TableCell className="text-sm text-muted-foreground">
                    {safeFormatDate(transaction.processedAt, 'MMM dd, yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    {transaction.source_order_id && transaction.source_order_id !== 'N/A' && transaction.type === 'charge' && !hideSensitiveData ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchOrderNumber(transaction.source_order_id)}
                        disabled={loadingOrders[transaction.source_order_id]}
                        className="h-7 text-xs px-2"
                      >
                        {loadingOrders[transaction.source_order_id] ? '...' : 'Get #'}
                      </Button>
                    ) : null}
                  </TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
     </div>
   )
 }
