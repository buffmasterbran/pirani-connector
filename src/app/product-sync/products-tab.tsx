'use client'

import { useState, useEffect, useCallback } from 'react'
import { useStoreContext } from '@/lib/product-sync/store-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  RefreshCw,
  Upload,
  Download as DownloadIcon,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  ArrowUpDown,
  ArrowUp,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'

interface ProductRow {
  id: string
  netsuiteSku: string
  netsuiteName: string | null
  netsuiteColor: string | null
  netsuiteSize: string | null
  netsuiteItemType: string | null
  netsuiteItemId: number
  shopifyProductId: string | null
  shopifyVariantId: string | null
  shopifyProductTitle: string | null
  matchStatus: string
  lastSyncStatus: string
  lastSyncAt: string | null
  lastSyncError: string | null
  netsuiteFlagValue: string | null
  netsuiteCurrentPrice: number | null
  netsuiteCurrentQty: number | null
  lastSyncedPrice: number | null
  lastSyncedQuantity: number | null
  lastSyncedComparePrice: number | null
}

interface Summary {
  total: number
  matched: number
  unmatched: number
  multipleMatches: number
  errors: number
  lastFullSync: string | null
  nextSync: string | null
}

type FilterMode = 'all' | 'synced' | 'pending' | 'errors' | 'unmatched' | 'flagged'

export default function ProductsTab() {
  const { activeStore } = useStoreContext()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortBy, setSortBy] = useState('netsuiteSku')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullingSuiteQL, setPullingSuiteQL] = useState(false)
  const [suiteQLResult, setSuiteQLResult] = useState<any>(null)
  const [pullingMR, setPullingMR] = useState(false)
  const [pushingAll, setPushingAll] = useState(false)
  const [pushProgress, setPushProgress] = useState<string | null>(null)
  const [syncingSku, setSyncingSku] = useState<string | null>(null)
  const [pullingSku, setPullingSku] = useState<string | null>(null)
  const [pullLog, setPullLog] = useState<Record<string, string[]>>({})
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const storeId = activeStore?.id
  const loadProducts = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        storeConfigId: storeId,
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      })
      if (search) params.set('search', search)

      if (filterMode === 'synced') params.set('syncStatus', 'success')
      else if (filterMode === 'pending') params.set('syncStatus', 'pending')
      else if (filterMode === 'errors') {
        params.set('syncStatus', 'error')
      }
      else if (filterMode === 'unmatched') params.set('matchStatus', 'unmatched')
      else if (filterMode === 'flagged') params.set('flagged', 'true')

      const res = await fetch(`/api/product-sync/products?${params}`)
      const data = await res.json()
      setProducts(data.items || [])
      setTotal(data.total || 0)
      setSummary(data.summary || null)
    } catch (err) {
      console.error('Failed to load products:', err)
    } finally {
      setLoading(false)
    }
  }, [storeId, page, pageSize, search, filterMode, sortBy, sortOrder])

  useEffect(() => { loadProducts() }, [loadProducts])

  const handlePull = async () => {
    if (!activeStore) return
    setPulling(true)
    try {
      const pullRes = await fetch('/api/product-sync/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeConfigId: activeStore.id }),
      })
      const pullData = await pullRes.json()
      console.log('Pull result:', pullData)

      // Auto-match after pull (only if Shopify is connected)
      if (activeStore.shopifyDomain) {
        try {
          await fetch('/api/product-sync/sync/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeConfigId: activeStore.id }),
          })
        } catch {
          // Match is non-fatal if Shopify isn't connected
        }
      }

      await loadProducts()
    } catch (err) {
      console.error('Pull failed:', err)
    } finally {
      setPulling(false)
    }
  }

  const handlePullSuiteQL = async () => {
    setPullingSuiteQL(true)
    setSuiteQLResult(null)
    setPushProgress(null)
    try {
      const res = await fetch('/api/inventory-sync/test?hours=24')
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPushProgress(`SuiteQL Error: ${data.error || `HTTP ${res.status}`}`)
        setSuiteQLResult(null)
      } else {
        setSuiteQLResult(data)
        setPushProgress(`SuiteQL: Found ${data.summary?.itemsWithRecentTransactions || 0} items with changes in last 24h (out of ${data.summary?.totalActiveItems || '?'} total)`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setPushProgress(`SuiteQL Error: ${message}`)
    } finally {
      setPullingSuiteQL(false)
    }
  }

  const handlePullMR = async () => {
    setPullingMR(true)
    setPushProgress(null)
    try {
      const res = await fetch('/api/product-sync/trigger-mr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inventory_sync' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setPushProgress(`Error (${res.status}): ${data.error || 'Failed to trigger M/R'}`)
      } else {
        setPushProgress(`Inventory sync triggered (task: ${data.taskId || 'unknown'}). Data will arrive in 1-2 minutes.`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setPushProgress(`Error: ${message}`)
    } finally {
      setPullingMR(false)
      setTimeout(() => setPushProgress(null), 10000)
    }
  }

  const handlePushAll = async () => {
    if (!activeStore) return
    setPushingAll(true)
    setPushProgress('Starting push...')
    try {
      const res = await fetch('/api/product-sync/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeConfigId: activeStore.id, syncType: 'full' }),
      })
      const data = await res.json()
      setPushProgress(
        `Done: ${data.updated || 0} updated, ${data.errors || 0} errors`
      )
      await loadProducts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setPushProgress(`Error: ${message}`)
    } finally {
      setPushingAll(false)
      setTimeout(() => setPushProgress(null), 5000)
    }
  }

  const syncSingleItem = async (sku: string) => {
    if (!activeStore) return
    setSyncingSku(sku)
    try {
      await fetch('/api/product-sync/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeConfigId: activeStore.id, syncType: 'single', itemSku: sku }),
      })
      await loadProducts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Sync failed for ${sku}:`, message)
    } finally {
      setSyncingSku(null)
    }
  }

  const pullSingleItem = async (id: string, sku: string, netsuiteItemId: number) => {
    if (!activeStore) return
    setPullingSku(sku)
    try {
      const res = await fetch('/api/product-sync/sync/pull-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeConfigId: activeStore.id, netsuiteItemId, netsuiteSku: sku }),
      })
      const data = await res.json()
      if (data.log) {
        setPullLog((prev) => ({ ...prev, [sku]: data.log }))
      }
      await loadProducts()
      setExpandedRow(id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setPullLog((prev) => ({ ...prev, [sku]: [`❌ Pull failed: ${message}`] }))
    } finally {
      setPullingSku(null)
    }
  }

  const exportCsv = () => {
    const headers = ['SKU', 'Name', 'Type', 'NS Price', 'NS Qty', 'Shopify Price', 'Shopify Qty', 'Match', 'Sync', 'Last Synced', 'Error']
    const rows = products.map((p) => [
      p.netsuiteSku,
      p.netsuiteName || '',
      p.netsuiteItemType || '',
      p.netsuiteCurrentPrice != null ? String(p.netsuiteCurrentPrice) : '',
      p.netsuiteCurrentQty != null ? String(Math.max(0, p.netsuiteCurrentQty)) : '',
      p.lastSyncedPrice != null ? String(p.lastSyncedPrice) : '',
      p.lastSyncedQuantity != null ? String(p.lastSyncedQuantity) : '',
      p.matchStatus,
      p.lastSyncStatus,
      p.lastSyncAt || '',
      p.lastSyncError || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${activeStore?.storeName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
  }

  const toggleSelectAll = () => {
    if (selectedRows.size === products.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(products.map((p) => p.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedRows)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRows(next)
  }

  if (!activeStore) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          No store configured. Add a store in the Store Config tab to get started.
        </CardContent>
      </Card>
    )
  }

  const NETSUITE_ACCOUNT_ID = '7913744'
  const nsItemUrl = (id: number) => `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/common/item/item.nl?id=${id}`
  const shopifyProductUrl = (gid: string) => {
    const numId = gid.split('/').pop()
    return `https://${activeStore.shopifyDomain}/admin/products/${numId}`
  }

  const totalPages = Math.ceil(total / pageSize)

  const FILTER_OPTIONS: { id: FilterMode; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: summary?.total },
    { id: 'synced', label: 'Synced' },
    { id: 'pending', label: 'Pending' },
    { id: 'errors', label: 'Errors', count: summary?.errors },
    { id: 'unmatched', label: 'Unmatched', count: summary?.unmatched },
    { id: 'flagged', label: 'Flagged' },
  ]

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Items" value={summary.total} />
          <StatCard label="Matched" value={summary.matched} color="green" />
          <StatCard label="Unmatched" value={summary.unmatched} color={summary.unmatched > 0 ? 'yellow' : undefined} />
          <StatCard label="Errors" value={summary.errors} color={summary.errors > 0 ? 'red' : undefined} />
          <StatCard label="Last Sync" value={summary.lastFullSync ? timeAgo(summary.lastFullSync) : 'Never'} />
        </div>
      )}

      {/* Filter Bar (Radio-style) */}
      <div className="flex items-center gap-1 bg-white border rounded-lg p-1 overflow-x-auto">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { setFilterMode(opt.id); setPage(1) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              filterMode === opt.id
                ? opt.id === 'errors' ? 'bg-red-600 text-white' :
                  opt.id === 'unmatched' ? 'bg-amber-600 text-white' :
                  'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
            {opt.count != null && opt.count > 0 && (
              <span className={`ml-1.5 text-xs ${filterMode === opt.id ? 'opacity-80' : 'text-slate-400'}`}>
                ({opt.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-lg p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search SKU, name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handlePullSuiteQL} disabled={pullingSuiteQL}>
            {pullingSuiteQL ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
            Pull from NetSuite (SuiteQL)
          </Button>
          <Button variant="outline" size="sm" onClick={handlePullMR} disabled={pullingMR}>
            {pullingMR ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Pull from NetSuite (MR)
          </Button>
          <Button size="sm" onClick={handlePushAll} disabled={pushingAll}>
            {pushingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5 mr-1.5" />}
            Push All to Shopify
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <DownloadIcon className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Push Progress Banner */}
      {pushProgress && (
        <div className={`px-4 py-2 rounded-lg text-sm ${
          pushProgress.includes('Error') ? 'bg-red-50 text-red-700' :
          pushProgress.startsWith('Done') ? 'bg-green-50 text-green-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {pushProgress}
        </div>
      )}

      {/* SuiteQL Results Panel */}
      {suiteQLResult && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <span className="font-medium text-sm text-slate-700">SuiteQL Delta Results</span>
              <span className="text-xs text-slate-500">
                {suiteQLResult.summary?.itemsWithRecentTransactions} changed items / {suiteQLResult.summary?.totalActiveItems} total
              </span>
            </div>
            <button
              onClick={() => setSuiteQLResult(null)}
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              Dismiss
            </button>
          </div>

          {/* Summary */}
          <div className="px-4 py-3 border-b bg-blue-50/50">
            <p className="text-sm text-slate-700">{suiteQLResult.summary?.message}</p>
            <p className="text-xs text-slate-500 mt-1">
              {suiteQLResult.summary?.transactionLines} transaction lines across {suiteQLResult.summary?.itemsWithRecentTransactions} unique items
            </p>
          </div>

          {/* Changed Items Table */}
          {suiteQLResult.changedItems?.length > 0 && (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Transaction Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {suiteQLResult.changedItems.map((item: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono">{item.itemname || item.itemid}</td>
                      <td className="px-3 py-1.5">{item.trantypename || item.trantype}</td>
                      <td className="px-3 py-1.5 text-gray-500">{item.trandate}</td>
                      <td className="px-3 py-1.5 text-gray-500">{item.lastmodifieddate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Current Inventory */}
          {suiteQLResult.currentInventory?.length > 0 && (
            <>
              <div className="px-4 py-2 bg-slate-50 border-t border-b">
                <span className="text-xs font-medium text-slate-600">Current Inventory for Changed Items</span>
              </div>
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Qty Available</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Qty On Hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suiteQLResult.currentInventory.map((item: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono">{item.sku || item.id}</td>
                        <td className="px-3 py-1.5">{item.displayname || '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{item.qty_available ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{item.qty_on_hand ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 w-8">
                  <Checkbox
                    checked={selectedRows.size === products.length && products.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 w-8"></th>
                <SortHeader col="netsuiteSku" label="SKU" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortHeader col="netsuiteName" label="Name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                    onToggleSelect={() => toggleSelect(p.id)}
                    onToggleExpand={() => setExpandedRow(expandedRow === p.id ? null : p.id)}
                    onSync={() => syncSingleItem(p.netsuiteSku)}
                    onPull={() => pullSingleItem(p.id, p.netsuiteSku, p.netsuiteItemId)}
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
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="px-3 text-sm text-gray-600">Page {page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Sub-components ----------

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClasses: Record<string, string> = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  }

  return (
    <div className="bg-white border rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${color ? colorClasses[color] || '' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

function SortHeader({
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

function MatchBadge({ status }: { status: string }) {
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

function SyncBadge({ status, error }: { status: string; error?: string | null }) {
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
        <td className="p-3 max-w-[200px] truncate">{product.netsuiteName || '—'}</td>
        <td className="p-3 text-xs text-gray-500">{product.netsuiteItemType || '—'}</td>
        <td className="p-3 text-right font-mono">
          {product.netsuiteCurrentPrice != null ? `$${Number(product.netsuiteCurrentPrice).toFixed(2)}` : '—'}
        </td>
        <td className="p-3 text-right font-mono">
          {nsQty != null ? nsQty : '—'}
        </td>
        <td className="p-3 text-right font-mono text-slate-400">
          {product.lastSyncedPrice != null ? `$${Number(product.lastSyncedPrice).toFixed(2)}` : '—'}
        </td>
        <td className="p-3 text-right font-mono text-slate-400">
          {product.lastSyncedQuantity != null ? product.lastSyncedQuantity : '—'}
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
                  <div className="flex justify-between"><dt className="text-gray-500">Type:</dt><dd>{product.netsuiteItemType || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Color:</dt><dd>{product.netsuiteColor || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Size:</dt><dd>{product.netsuiteSize || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Flag Value:</dt><dd>{product.netsuiteFlagValue || '—'}</dd></div>
                </dl>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-2">Shopify Details</p>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Product:</dt><dd className="truncate max-w-[200px]">{product.shopifyProductTitle || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Variant ID:</dt><dd className="font-mono text-xs">{product.shopifyVariantId ? product.shopifyVariantId.split('/').pop() : '—'}</dd></div>
                </dl>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-2">Last Push to Shopify</p>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-gray-500">Price:</dt><dd>{product.lastSyncedPrice != null ? `$${Number(product.lastSyncedPrice).toFixed(2)}` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Compare Price:</dt><dd>{product.lastSyncedComparePrice != null ? `$${Number(product.lastSyncedComparePrice).toFixed(2)}` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Quantity:</dt><dd>{product.lastSyncedQuantity ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Synced At:</dt><dd className="text-xs">{product.lastSyncAt ? timeAgo(product.lastSyncAt) : '—'}</dd></div>
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
