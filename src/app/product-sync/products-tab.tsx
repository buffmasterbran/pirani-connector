'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useProductSync } from './useProductSync'
import type { FilterMode } from './useProductSync'
import ProductsTable from './ProductsTable'
import ProductActions from './ProductActions'

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

// ---------- Main orchestrator ----------

export default function ProductsTab() {
  const hook = useProductSync()

  const {
    activeStore,
    products,
    summary,
    total,
    totalPages,
    page,
    setPage,
    pageSize,
    search,
    setSearch,
    filterMode,
    setFilterMode,
    sortBy,
    sortOrder,
    loading,
    pullingSuiteQL,
    pullingMR,
    pushingAll,
    pushingDirty,
    pushProgress,
    syncingSku,
    pullingSku,
    suiteQLResult,
    setSuiteQLResult,
    suiteQLHours,
    setSuiteQLHours,
    expandedRow,
    setExpandedRow,
    selectedRows,
    pullLog,
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
  } = hook

  if (!activeStore) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          No store configured. Add a store in the Store Config tab to get started.
        </CardContent>
      </Card>
    )
  }

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

      {/* Actions toolbar, progress banner, SuiteQL results */}
      <ProductActions
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        pullingSuiteQL={pullingSuiteQL}
        suiteQLHours={suiteQLHours}
        onSuiteQLHoursChange={setSuiteQLHours}
        onPullSuiteQL={handlePullSuiteQL}
        suiteQLResult={suiteQLResult}
        onDismissSuiteQL={() => setSuiteQLResult(null)}
        pullingMR={pullingMR}
        onPullMR={handlePullMR}
        pushingAll={pushingAll}
        pushingDirty={pushingDirty}
        pushProgress={pushProgress}
        onPushAll={handlePushAll}
        onPushDirty={handlePushDirty}
        onExportCsv={exportCsv}
      />

      {/* Products Table */}
      <ProductsTable
        products={products}
        loading={loading}
        total={total}
        totalPages={totalPages}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        selectedRows={selectedRows}
        expandedRow={expandedRow}
        syncingSku={syncingSku}
        pullingSku={pullingSku}
        pullLog={pullLog}
        activeStoreShopifyDomain={activeStore.shopifyDomain}
        onSort={handleSort}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelect={toggleSelect}
        onSetExpandedRow={setExpandedRow}
        onSetPage={setPage}
        onSyncSingle={syncSingleItem}
        onPullSingle={pullSingleItem}
      />
    </div>
  )
}
