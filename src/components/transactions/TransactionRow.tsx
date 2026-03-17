import {
  TableCell,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Split, ChevronDown, ChevronRight, Store } from "lucide-react"
import React from "react"
import type { Transaction, DisplayTransaction, OrderSourceMapping, FeesDescriptionOption } from "./types"
import { DroppableRow, DraggableNetSuiteId, getNetSuiteUrl } from "./useDragDropTransactions"
import { AmountDescriptionSelect } from "./TransactionCellEditors"

interface TransactionHint {
  message: string
  icon: string
  bg: string
  text: string
}

function getTransactionHint(
  t: DisplayTransaction,
  ctx: {
    isMarketplaceOrder: boolean
    isCashSaleRefund: boolean
    hasAmountDescription: boolean
    isExcluded: boolean
    hasNsId: boolean
    hasMismatch: boolean
    isGrouped: boolean
    hasSplits: boolean
  }
): TransactionHint | null {
  // Excluded from deposit
  if (ctx.isExcluded) {
    return { message: 'Excluded from NetSuite deposit. Change the dropdown to re-include.', icon: '\u26AA', bg: 'bg-gray-50', text: 'text-gray-500' }
  }

  // Has a dropdown assigned (mapped to "other" section)
  if (ctx.hasAmountDescription) {
    return { message: 'Mapped to a deposit dropdown — will go in the "Other" section of the deposit.', icon: '\u2705', bg: 'bg-green-50/50', text: 'text-green-700' }
  }

  // Edited order with amount mismatch — specific guidance
  if ((t as any).order_edited && ctx.hasNsId && ctx.hasMismatch) {
    return { message: 'Edited order with amount mismatch. Try merging with the other charge for this order. If it spans multiple payouts, you may need to delete the cash sale and invoice in NS, then re-process using Process Marketplace Order.', icon: '\u270F\uFE0F', bg: 'bg-red-50', text: 'text-red-700' }
  }

  // Has NS ID with amount mismatch (non-edited)
  if (ctx.hasNsId && ctx.hasMismatch) {
    return { message: 'Amount mismatch! NetSuite amount differs from Shopify. Check if the order was edited or split across payouts.', icon: '\u26A0\uFE0F', bg: 'bg-red-50', text: 'text-red-700' }
  }

  // Has NS ID — good to go
  if (ctx.hasNsId) return null

  // Split transactions — parent has no NS ID but children might
  if (ctx.hasSplits) {
    return { message: 'This transaction is split. Expand to see individual NS IDs. Each split needs its own NS transaction.', icon: '\u2702\uFE0F', bg: 'bg-purple-50', text: 'text-purple-700' }
  }

  // Edited order missing NS ID — specific guidance
  if ((t as any).order_edited && !ctx.hasNsId) {
    return { message: 'Edited order — customer changed their order after purchase, creating extra charges. Try merging with the other line for this order. If it spans multiple payouts, you may need to delete the cash sale/invoice in NS and re-process.', icon: '\u270F\uFE0F', bg: 'bg-amber-50', text: 'text-amber-800' }
  }

  // Missing NS ID — marketplace order (charge or credit)
  if (ctx.isMarketplaceOrder) {
    const tip = t.type === 'credit'
      ? 'Marketplace credit missing NS ID. Click the store icon to process — if the invoice exists, it will create a payment for this amount.'
      : 'Marketplace order missing NS ID. Click the store icon to run Process Marketplace Order (deletes cash sale, edits SO, creates invoice + payment).'
    return { message: tip, icon: '\uD83C\uDFEA', bg: 'bg-orange-50', text: 'text-orange-700' }
  }

  // Missing NS ID — adjustment type (tax, etc.)
  if (t.adjustmentReason) {
    const reason = t.adjustmentReason.replace(/_/g, ' ')
    return { message: `This is a "${reason}" adjustment. Use the dropdown to map it to the correct GL account, or click + to manually add a NS transaction.`, icon: '\uD83D\uDCCB', bg: 'bg-amber-50', text: 'text-amber-700' }
  }

  // Missing NS ID — charge or refund with no NS
  if (t.type === 'charge' || t.type === 'refund') {
    return { message: `Missing NetSuite ID. Try "Get Missing NS Transactions" first. If not found, use + to manually add or the store icon for marketplace orders.`, icon: '\u2753', bg: 'bg-blue-50', text: 'text-blue-700' }
  }

  // Missing NS ID — other types (payout, etc.)
  if (t.type === 'payout') return null

  return { message: 'No NetSuite ID. Use the dropdown to map to a GL account, or + to add manually.', icon: '\u2753', bg: 'bg-blue-50', text: 'text-blue-700' }
}

interface TransactionRowProps {
  transaction: DisplayTransaction
  idx: number
  groupedTransactions: Map<string, Transaction[]>
  draggedTransactionId: string | null
  hideSensitiveData: boolean
  orderSourceMappings: OrderSourceMapping[]
  feesDescriptionOptions: FeesDescriptionOption[]
  loadingFeesOptions: boolean
  selectedTransactionIds: Set<string>
  expandedSplits: Set<string>
  getOrderSourceDisplayName: (transaction: Transaction) => string
  isCashSaleOrRefund: (transaction: Transaction) => boolean
  onSelectTransaction: (transactionId: string, checked: boolean) => void
  onToggleExpandSplit: (transactionId: string) => void
  onDeleteNetSuiteId?: (transactionId: string) => void
  onAddNetSuite?: (transactionId: string) => void
  onUpdateAmountDescription?: (transactionId: string, description: string | null) => Promise<void>
  onToggleInclude?: (transactionId: string, include: boolean) => Promise<void>
  onSplitTransaction?: (transaction: Transaction) => void
  onProcessMarketplaceOrder?: (transaction: Transaction) => void
  showHelpers?: boolean
}

export function TransactionRow({
  transaction,
  idx,
  groupedTransactions,
  draggedTransactionId,
  hideSensitiveData,
  orderSourceMappings,
  feesDescriptionOptions,
  loadingFeesOptions,
  selectedTransactionIds,
  expandedSplits,
  getOrderSourceDisplayName,
  isCashSaleOrRefund,
  onSelectTransaction,
  onToggleExpandSplit,
  onDeleteNetSuiteId,
  onAddNetSuite,
  onUpdateAmountDescription,
  onToggleInclude,
  onSplitTransaction,
  onProcessMarketplaceOrder,
  showHelpers,
}: TransactionRowProps) {
  const isFirstInGroup = transaction.isGrouped && transaction.groupIndex === 0
  const showGroupIndicator = transaction.isGrouped && isFirstInGroup
  const groupTotal = transaction.isGrouped
    ? groupedTransactions.get(transaction.source_order_id)!.reduce((sum, t) => sum + (t.net || 0), 0)
    : null
  const groupIncludedCount = transaction.isGrouped
    ? groupedTransactions.get(transaction.source_order_id)!.filter(t => t.includeInNetSuite !== false).length
    : null

  const isCashSaleRefund = isCashSaleOrRefund(transaction)

  // Check if this is a marketplace (non-taxable) order that can be processed
  // Show for charge and credit types (credits may also need invoice+payment flow)
  const isMarketplaceOrder = onProcessMarketplaceOrder &&
    (transaction.type === 'charge' || transaction.type === 'credit') &&
    orderSourceMappings.some(m =>
      m.isActive && m.isTaxable === false && (
        (transaction.app_id && m.appId === transaction.app_id) ||
        (transaction.source_name && m.sourceName === transaction.source_name)
      )
    )

  return (
    <React.Fragment>
      <DroppableRow
        transaction={transaction}
        isDraggingOver={draggedTransactionId === transaction.id}
        rowIndex={idx}
      >
        <TableCell>
          <Checkbox
            checked={selectedTransactionIds.has(transaction.id)}
            onCheckedChange={(checked) => {
              onSelectTransaction(transaction.id, !!checked)
            }}
          />
        </TableCell>
        <TableCell className="font-medium">
          {transaction.id ? `#${String(transaction.id).slice(-8)}` : 'N/A'}
        </TableCell>
        <TableCell className="font-medium">
          {transaction.source_order_id ? `#${transaction.source_order_id}` : 'N/A'}
        </TableCell>
        <TableCell>
          {showGroupIndicator && (
            <div className="mb-1 text-xs text-yellow-600 font-medium">
              {transaction.groupSize} transaction{transaction.groupSize !== 1 ? 's' : ''} •
              Total: {transaction.currency} {groupTotal?.toFixed(2)} •
              Included: {groupIncludedCount}/{transaction.groupSize}
            </div>
          )}
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : transaction.source_order_id && transaction.source_order_id !== 'N/A' ? (
            <a
              href={`https://admin.shopify.com/store/pirani-life/orders/${transaction.source_order_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
              title={`View order ${transaction.source_order_id} in Shopify`}
            >
              {transaction.order_name || `#${transaction.source_order_id}`}
            </a>
          ) : (
            transaction.order_name || '\u2014'
          )}
          {(transaction as any).order_edited && (
            <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold" title="Order was edited (products added/removed) — may split across payouts">
              EDITED
            </span>
          )}
        </TableCell>
        <TableCell>
          {(() => {
            const displayName = getOrderSourceDisplayName(transaction)
            const hasMapping = orderSourceMappings.some(m =>
              m.isActive && (
                (transaction.app_id && m.appId === transaction.app_id) ||
                (transaction.source_name && m.sourceName === transaction.source_name)
              )
            )

            if (displayName === '\u2014') {
              return <span className="text-muted-foreground text-xs">{'\u2014'}</span>
            }

            const isWeb = transaction.is_web_order === true
            const bgColor = isWeb ? 'bg-green-100 text-green-800' : (hasMapping ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')

            return (
              <span className={`px-2 py-1 ${bgColor} rounded-full text-xs font-medium`}
                    title={transaction.app_id ? `App ID: ${transaction.app_id}` : `Source: ${transaction.source_name || 'Unknown'}`}>
                {displayName}
              </span>
            )
          })()}
        </TableCell>
        <TableCell>
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
            {transaction.type}
          </span>
        </TableCell>
        <TableCell>
          {transaction.adjustmentReason ? (
            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium" title={transaction.adjustmentReason}>
              {transaction.adjustmentReason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">{'\u2014'}</span>
          )}
        </TableCell>
        <TableCell>
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : (() => {
            return (
              <div className="flex flex-col gap-1">
                <span>{transaction.currency || 'USD'} {Number(transaction.amount).toFixed(2)}</span>
                {!isCashSaleRefund && onUpdateAmountDescription && (
                  <AmountDescriptionSelect
                    transaction={transaction}
                    feesDescriptionOptions={feesDescriptionOptions}
                    loadingFeesOptions={loadingFeesOptions}
                    onUpdateAmountDescription={onUpdateAmountDescription}
                    onToggleInclude={onToggleInclude}
                  />
                )}
              </div>
            )
          })()}
        </TableCell>
        <TableCell className="text-red-600">
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : (
            <span>-{transaction.currency || 'USD'} {Number(transaction.fee).toFixed(2)}</span>
          )}
        </TableCell>
        <TableCell className="font-medium">
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : (
            `${transaction.currency} ${Number(transaction.net).toFixed(2)}`
          )}
        </TableCell>
        <TableCell className="font-medium">
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : transaction.netsuiteAmount !== null && transaction.netsuiteAmount !== undefined ? (
            <span className={transaction.amountMismatch ? 'text-red-600' : 'text-green-600'}>
              {transaction.currency} {transaction.netsuiteAmount.toFixed(2)}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">{'\u2014'}</span>
          )}
        </TableCell>
        <TableCell>
          {hideSensitiveData ? (
            <span className="text-gray-500">{'??????'}</span>
          ) : transaction.children && transaction.children.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 text-xs font-medium"
                onClick={() => onToggleExpandSplit(transaction.id)}
              >
                {expandedSplits.has(transaction.id) ? <ChevronDown className="h-3 w-3 mr-0.5" /> : <ChevronRight className="h-3 w-3 mr-0.5" />}
                {transaction.children.length} split{transaction.children.length !== 1 ? 's' : ''}
              </Button>
              {onSplitTransaction && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                  onClick={() => onSplitTransaction(transaction)}
                  title="Edit split transactions"
                >
                  <Split className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : transaction.netsuiteTransactionId ? (
            <DraggableNetSuiteId
              transaction={transaction}
              onDeleteNetSuiteId={onDeleteNetSuiteId}
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">{'\u2014'}</span>
              {!transaction.amountDescription && transaction.includeInNetSuite !== false && (
                <>
                  {onAddNetSuite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      onClick={() => onAddNetSuite(transaction.id)}
                      title="Add single NetSuite transaction"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                  {onSplitTransaction && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                      onClick={() => onSplitTransaction(transaction)}
                      title="Split into multiple NS transactions"
                    >
                      <Split className="h-3 w-3" />
                    </Button>
                  )}
                  {isMarketplaceOrder && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                      onClick={() => onProcessMarketplaceOrder!(transaction)}
                      title="Process marketplace order (delete CS, create invoice + payment)"
                    >
                      <Store className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </TableCell>
      </DroppableRow>
      {/* Contextual helper row */}
      {showHelpers && (() => {
        const hint = getTransactionHint(transaction, {
          isMarketplaceOrder: !!isMarketplaceOrder,
          isCashSaleRefund,
          hasAmountDescription: !!transaction.amountDescription,
          isExcluded: transaction.includeInNetSuite === false,
          hasNsId: !!transaction.netsuiteTransactionId,
          hasMismatch: !!transaction.amountMismatch,
          isGrouped: !!transaction.isGrouped,
          hasSplits: !!(transaction.children && transaction.children.length > 0),
        })
        if (!hint) return null
        return (
          <TableRow className={`border-0 ${hint.bg}`}>
            <TableCell colSpan={12} className="py-1 pl-12">
              <span className={`text-xs ${hint.text}`}>
                {hint.icon} {hint.message}
              </span>
            </TableCell>
          </TableRow>
        )
      })()}
      {/* Expandable child rows for split transactions */}
      {transaction.children && transaction.children.length > 0 && expandedSplits.has(transaction.id) && (
        transaction.children.map((child, childIdx) => (
          <TableRow key={child.id} className="bg-purple-50/50 border-l-2 border-l-purple-300">
            <TableCell colSpan={5} className="pl-8 text-xs text-muted-foreground italic">
              Split {childIdx + 1}/{transaction.children!.length}
            </TableCell>
            <TableCell className="text-xs font-mono">
              {child.amount != null ? `${transaction.currency} ${Number(child.amount).toFixed(2)}` : '\u2014'}
            </TableCell>
            <TableCell className="text-xs">{'\u2014'}</TableCell>
            <TableCell className="text-xs font-mono">
              {child.amount != null ? `${transaction.currency} ${Number(child.amount).toFixed(2)}` : '\u2014'}
            </TableCell>
            <TableCell className="text-xs font-mono">
              {child.netsuiteAmount != null ? (
                <span className="text-green-600">{transaction.currency} {Number(child.netsuiteAmount).toFixed(2)}</span>
              ) : '\u2014'}
            </TableCell>
            <TableCell className="text-xs">
              {child.netsuiteTransactionId && (
                <div className="flex items-center gap-1">
                  <a
                    href={getNetSuiteUrl(child.netsuiteTransactionId, transaction.type, child.netsuiteTransactionName, null)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:text-green-900 hover:underline font-mono"
                  >
                    {child.netsuiteTransactionName || child.netsuiteTransactionId}
                  </a>
                  <span className="text-muted-foreground">ID: {child.netsuiteTransactionId}</span>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))
      )}
    </React.Fragment>
  )
}
