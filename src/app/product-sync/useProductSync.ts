'use client'

import { useState, useEffect, useCallback } from 'react'
import { useStoreContext } from '@/lib/product-sync/store-context'

export interface ProductRow {
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

export interface Summary {
  total: number
  matched: number
  unmatched: number
  multipleMatches: number
  errors: number
  lastFullSync: string | null
  nextSync: string | null
}

export type FilterMode = 'all' | 'synced' | 'pending' | 'errors' | 'unmatched' | 'flagged'

export const SUITEQL_WINDOW_OPTIONS = [
  { value: '720', label: '30 days' },
  { value: '168', label: '7 days' },
  { value: '24', label: '24 hours' },
  { value: '12', label: '12 hours' },
  { value: '1', label: '1 hour' },
  { value: '0.25', label: '15 min' },
  { value: '0.05', label: '3 min' },
]

export function useProductSync() {
  const { activeStore } = useStoreContext()

  // Data state
  const [products, setProducts] = useState<ProductRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)

  // Filtering & sorting
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortBy, setSortBy] = useState('netsuiteSku')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Loading / action states
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullingSuiteQL, setPullingSuiteQL] = useState(false)
  const [suiteQLResult, setSuiteQLResult] = useState<any>(null)
  const [suiteQLHours, setSuiteQLHours] = useState('24')
  const [pullingMR, setPullingMR] = useState(false)
  const [pushingAll, setPushingAll] = useState(false)
  const [pushingDirty, setPushingDirty] = useState(false)
  const [pushProgress, setPushProgress] = useState<string | null>(null)
  const [syncingSku, setSyncingSku] = useState<string | null>(null)
  const [pullingSku, setPullingSku] = useState<string | null>(null)
  const [pullLog, setPullLog] = useState<Record<string, string[]>>({})

  // Selection & expansion
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
    const windowLabel = SUITEQL_WINDOW_OPTIONS.find((o) => o.value === suiteQLHours)?.label || `${suiteQLHours}h`
    try {
      const res = await fetch(`/api/inventory-sync/test?hours=${suiteQLHours}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPushProgress(`SuiteQL Error: ${data.error || `HTTP ${res.status}`}`)
        setSuiteQLResult(null)
      } else {
        setSuiteQLResult(data)
        setPushProgress(`SuiteQL (${windowLabel}): Found ${data.summary?.itemsWithRecentTransactions || 0} items with changes (out of ${data.summary?.totalActiveItems || '?'} total)`)
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

  const handlePushDirty = async () => {
    setPushingDirty(true)
    setPushProgress('Pushing dirty items to Shopify...')
    try {
      const res = await fetch('/api/inventory-sync/push-shopify', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPushProgress(`Push Error: ${data.error || `HTTP ${res.status}`}`)
      } else {
        setPushProgress(
          `Pushed ${data.dirty} items: ${data.priceUpdates} prices, ${data.qtyUpdates} qty, ${data.unmatched} unmatched, ${data.errors} errors — ${data.elapsed_ms}ms`
        )
        await loadProducts()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setPushProgress(`Error: ${message}`)
    } finally {
      setPushingDirty(false)
      setTimeout(() => setPushProgress(null), 10000)
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
      setPullLog((prev) => ({ ...prev, [sku]: [`Pull failed: ${message}`] }))
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

  const totalPages = Math.ceil(total / pageSize)

  return {
    // Store
    activeStore,

    // Data
    products,
    summary,
    total,
    totalPages,

    // Pagination
    page,
    setPage,
    pageSize,

    // Filtering & sorting
    search,
    setSearch,
    filterMode,
    setFilterMode,
    sortBy,
    sortOrder,

    // Loading states
    loading,
    pulling,
    pullingSuiteQL,
    pullingMR,
    pushingAll,
    pushingDirty,
    pushProgress,
    syncingSku,
    pullingSku,

    // SuiteQL
    suiteQLResult,
    setSuiteQLResult,
    suiteQLHours,
    setSuiteQLHours,

    // Selection & expansion
    expandedRow,
    setExpandedRow,
    selectedRows,
    pullLog,

    // Handlers
    loadProducts,
    handlePull,
    handlePullSuiteQL,
    handlePullMR,
    handlePushAll,
    handlePushDirty,
    syncSingleItem,
    pullSingleItem,
    exportCsv,
    handleSort,
    toggleSelectAll,
    toggleSelect,
  }
}
