'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  RefreshCw,
  Upload,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpDown,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import type { ProductRow } from './useProductSync'

// ---------- Utility ----------

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  if (diff < 0) {
    const absDiff = Math.abs(diff)
    if (absDiff < 60_000) return `in ${Math.round(absDiff / 1000)}s`
    if (absDiff < 3_600_000) return `in ${Math.round(absDiff / 60_000)}m`
    return `in ${Math.round(absDiff / 3_600_000)}h`
  }

  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

// ---------- Sub-components ----------

export function SortHeader({
  col,
  label,
  sortBy,
  sortOrder,
  onSort,
}: {
  col: string
  label: string
  sortBy: string
  sortOrder: string
  onSort: (col: string) => void
}) {
  return (
    <th
      className="p-3 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortBy === col && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  )
}

export function MatchBadge({ status }: { status: string }) {
  switch (status) {
    case 'matched':
      return <span title="Matched"><CheckCircle2 className="h-4 w-4 text-green-500" /></span>
    case 'unmatched':
      return <span title="SKU not found in Shopify"><AlertTriangle className="h-4 w-4 text-amber-500" /></span>
    case 'multiple_matches':
      return <span title="Multiple SKU matches found"><HelpCircle className="h-4 w-4 text-orange-500" /></span>
    case 'error':
      return <span title="Match error"><XCircle className="h-4 w-4 text-red-500" /></span>
    default:
      return <span className="text-xs text-gray-400">{status}</span>
  }
}

export function SyncBadge({ status, error }: { status: string; error?: string | null }) {
  switch (status) {
    case 'success':
      return <span title="Synced"><CheckCircle2 className="h-4 w-4 text-green-500" /></span>
    case 'error':
      return <span title={error || 'Sync error'}><AlertCircle className="h-4 w-4 text-red-500" /></span>
    case 'pending':
      return <span title="Pending"><Clock className="h-4 w-4 text-gray-400" /></span>
    case 'skipped':
      return <span title="Skipped" className="text-xs text-gray-400">Skip</span>
    default:
      return <span className="text-xs text-gray-400">{status}</span>
  }
}

function ProductRowComponent({
  product,
  selected,
  expanded,
  syncingSku,
  pullingSku,
  pullLog,
  onToggleSelect,
  onToggleExpand,
  onSync,
  onPull,
  nsItemUrl,
  shopifyProductUrl,
}: {
  product: ProductRow
  selected: boolean
  expanded: boolean
  syncingSku: string | null
  pullingSku: string | null
  pullLog: string[] | null
  onToggleSelect: () => void
  onToggleExpand: () => void
  onSync: () => void
  onPull: () => void
  nsItemUrl: (id: number) => string
  shopifyProductUrl: (gid: string) => string
}) {
  const nsQty = product.netsuiteCurrentQty != null ? Math.max(0, product.netsuiteCurrentQty) : null

  return (
    <>
      <tr className={`border-b hover:bg-gray-50 ${selected ? 'bg-blue-50/50' : ''}`}>
        <td className="p-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        </td>
        <td className="p-3">
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="p-3 font-mono text-xs">{product.netsuiteSku}</td>
        <td className="p-3 max-w-[200px] truncate">{product.netsuiteName || '\u2014'}</td>
        <td className="p-3 text-xs text-gray-500">{product.netsuiteItemType || '\u2014'}</td>
        <td className="p-3 text-right font-mono">
          {product.netsuiteCurrentPrice != null ? `$${Number(product.netsuiteCurrentPrice).toFixed(2)}` : '\u2014'}
        </td>
        <td className="p-3 text-right font-mono">
          {nsQty != null ? nsQty : '\u2014'}
        </td>
        <td className="p-3 text-right font-mono text-slate-400">
          {product.lastSyncedPrice != null ? `$${Number(product.lastSyncedPrice).toFixed(2)}` : '\u2014'}
        </td>
        <td className="p-3 text-right font-mono text-slate-400">
          {product.lastSyncedQuantity != null ? product.lastSyncedQuantity : '\u2014'}
        </td>
        <td className="p-3 text-center"><MatchBadge status={product.matchStatus} /></td>
        <td className="p-3 text-center"><SyncBadge status={product.lastSyncStatus} error={product.lastSyncError} /></td>
        <td className="p-3">
          <div className="flex items-center justify-center gap-1">
            <a
              href={nsItemUrl(product.netsuiteItemId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-600"
              title="Open in NetSuite"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {product.shopifyProductId && (
              <a
                href={shopifyProductUrl(product.shopifyProductId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-green-600"
                title="Open in Shopify"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </td>
        <td className="p-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPull}
            disabled={pullingSku === product.netsuiteSku}
            className="h-7 px-2 text-xs"
            title="Pull this item from NetSuite (with diagnostic log)"
          >
            {pullingSku === product.netsuiteSku ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </td>
        <td className="p-3 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={syncingSku === product.netsuiteSku}
            className="h-7 px-3 text-xs"
          >
            {syncingSku === product.netsuiteSku ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Upload className="h-3 w-3 mr-1" />
                Push
              </>
            )}
          </Button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b bg-gray-50/50">
          <td colSpan={14} className="p-4">
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="font-medium text-gray-700 mb-2">NetSuite Details</p>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Item ID:</dt><dd>{product.netsuiteItemId}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd>{product.netsuiteItemType || '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Color:</dt><dd>{product.netsuiteColor || '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Size:</dt><dd>{product.netsuiteSize || '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Flag Value:</dt><dd>{product.netsuiteFlagValue || '\u2014'}</dd></div>
                </dl>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-2">Shopify Details</p>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Product:</dt><dd className="truncate max-w-[200px]">{product.shopifyProductTitle || '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Variant ID:</dt><dd className="font-mono text-xs">{product.shopifyVariantId ? product.shopifyVariantId.split('/').pop() : '\u2014'}</dd></div>
                </dl>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-2">Last Push to Shopify</p>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Price:</dt><dd>{product.lastSyncedPrice != null ? `$${Number(product.lastSyncedPrice).toFixed(2)}` : '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Compare Price:</dt><dd>{product.lastSyncedComparePrice != null ? `$${Number(product.lastSyncedComparePrice).toFixed(2)}` : '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Quantity:</dt><dd>{product.lastSyncedQuantity ?? '\u2014'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Synced At:</dt><dd className="text-xs">{product.lastSyncAt ? timeAgo(product.lastSyncAt) : '\u2014'}</dd></div>
                  {product.lastSyncError && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">{product.lastSyncError}</div>
                  )}
                </dl>
              </div>
            </div>

            {pullLog && pullLog.length > 0 && (
              <div className="mt-4">
                <p className="font-medium text-gray-700 mb-2">Pull Diagnostic Log</p>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono max-h-96 overflow-auto whitespace-pre-wrap">
                  {pullLog.join('\n')}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ---------- Main table component ----------

export interface ProductsTableProps {
  products: ProductRow[]
  loading: boolean
  total: number
  totalPages: number
  page: number
  pageSize: number
  sortBy: string
  sortOrder: string
  selectedRows: Set<string>
  expandedRow: string | null
  syncingSku: string | null
  pullingSku: string | null
  pullLog: Record<string, string[]>
  activeStoreShopifyDomain: string
  onSort: (col: string) => void
  onToggleSelectAll: () => void
  onToggleSelect: (id: string) => void
  onSetExpandedRow: (id: string | null) => void
  onSetPage: (page: number) => void
  onSyncSingle: (sku: string) => void
  onPullSingle: (id: string, sku: string, netsuiteItemId: number) => void
}

export default function ProductsTable({
  products,
  loading,
  total,
  totalPages,
  page,
  pageSize,
  sortBy,
  sortOrder,
  selectedRows,
  expandedRow,
  syncingSku,
  pullingSku,
  pullLog,
  activeStoreShopifyDomain,
  onSort,
  onToggleSelectAll,
  onToggleSelect,
  onSetExpandedRow,
  onSetPage,
  onSyncSingle,
  onPullSingle,
}: ProductsTableProps) {
  const nsItemUrl = (id: number) =>
    `https://${process.env.NEXT_PUBLIC_NETSUITE_ACCOUNT_ID || '7913744'}.app.netsuite.com/app/common/item/item.nl?id=${id}`

  const shopifyProductUrl = (gid: string) => {
    const numId = gid.split('/').pop()
    return `https://${activeStoreShopifyDomain}/admin/products/${numId}`
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 w-8">
                <Checkbox
                  checked={selectedRows.size === products.length && products.length > 0}
                  onCheckedChange={onToggleSelectAll}
                />
              </th>
              <th className="p-3 w-8"></th>
              <SortHeader col="netsuiteSku" label="SKU" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <SortHeader col="netsuiteName" label="Name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <th className="p-3 text-left font-medium text-gray-600">Type</th>
              <th className="p-3 text-right font-medium text-gray-600">NS Price</th>
              <th className="p-3 text-right font-medium text-gray-600">NS Qty</th>
              <th className="p-3 text-right font-medium text-gray-600">Shopify Price</th>
              <th className="p-3 text-right font-medium text-gray-600">Shopify Qty</th>
              <th className="p-3 text-center font-medium text-gray-600">Match</th>
              <th className="p-3 text-center font-medium text-gray-600">Sync</th>
              <th className="p-3 text-center font-medium text-gray-600">Links</th>
              <th className="p-3 text-center font-medium text-gray-600" colSpan={2}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading products...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-12 text-center text-gray-400">
                  No products found. Click &quot;Pull from NetSuite&quot; to load items.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <ProductRowComponent
                  key={p.id}
                  product={p}
                  selected={selectedRows.has(p.id)}
                  expanded={expandedRow === p.id}
                  syncingSku={syncingSku}
                  pullingSku={pullingSku}
                  pullLog={pullLog[p.netsuiteSku] || null}
                  onToggleSelect={() => onToggleSelect(p.id)}
                  onToggleExpand={() => onSetExpandedRow(expandedRow === p.id ? null : p.id)}
                  onSync={() => onSyncSingle(p.netsuiteSku)}
                  onPull={() => onPullSingle(p.id, p.netsuiteSku, p.netsuiteItemId)}
                  nsItemUrl={nsItemUrl}
                  shopifyProductUrl={shopifyProductUrl}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onSetPage(page - 1)}>
              Previous
            </Button>
            <span className="px-3 text-sm text-gray-600">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onSetPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
