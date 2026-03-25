'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2,
  RefreshCw,
  Download as DownloadIcon,
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUp,
} from 'lucide-react'
import { SUITEQL_WINDOW_OPTIONS } from './useProductSync'

// ---------- SuiteQL sub-components ----------

function SuiteQLStepCard({ step, index, expanded, onToggle }: {
  step: any
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const [showQuery, setShowQuery] = useState(false)

  const hasError = !!step.error
  const statusColor = hasError ? 'text-red-600' : 'text-green-600'
  const bgColor = hasError ? 'bg-red-50' : ''

  // Auto-detect column headers from data
  const columns = step.data?.length > 0 ? Object.keys(step.data[0]).filter((k: string) => k !== 'links') : []

  return (
    <div className={bgColor}>
      {/* Step header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-xs font-bold text-slate-600 flex-shrink-0">
          {index + 1}
        </span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
        <span className="font-medium text-sm text-slate-800">{step.name}</span>
        <span className="text-xs text-slate-500 flex-1">{step.description}</span>
        <span className={`text-xs font-mono ${statusColor}`}>
          {hasError ? 'ERROR' : `${step.rowCount} rows`}
        </span>
        <span className="text-xs font-mono text-slate-400">
          {step.elapsed_ms}ms
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3">
          {/* Query toggle */}
          <div className="mb-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowQuery(!showQuery) }}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              {showQuery ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {showQuery ? 'Hide query' : 'Show query'}
            </button>
            {showQuery && (
              <pre className="mt-1 bg-gray-900 text-green-400 rounded p-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {step.query}
              </pre>
            )}
          </div>

          {/* Error message */}
          {hasError && (
            <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
              {step.error}
            </div>
          )}

          {/* Data table */}
          {step.data?.length > 0 && columns.length > 0 && (
            <div className="overflow-x-auto max-h-72 overflow-y-auto border rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-gray-100 border-b">
                    {columns.map((col: string) => (
                      <th key={col} className="px-2.5 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {step.data.slice(0, 100).map((row: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      {columns.map((col: string) => (
                        <td key={col} className="px-2.5 py-1 font-mono whitespace-nowrap">
                          {formatCellValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {step.data.length > 100 && (
                <div className="px-2.5 py-1.5 bg-gray-50 text-xs text-slate-500 border-t">
                  Showing 100 of {step.data.length} rows
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SuiteQLResultsPanel({ result, onDismiss }: { result: any; onDismiss: () => void }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const expandAll = () => {
    setExpandedSteps(new Set((result.steps || []).map((_: any, i: number) => i)))
  }
  const collapseAll = () => setExpandedSteps(new Set())

  const steps = result.steps || []

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-500" />
          <span className="font-medium text-sm text-slate-700">SuiteQL Delta Sync</span>
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
            {result.elapsed_ms}ms total
          </span>
          <span className="text-xs text-slate-500">
            {steps.length} steps
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="text-xs text-blue-600 hover:text-blue-800">Expand all</button>
          <span className="text-slate-300">|</span>
          <button onClick={collapseAll} className="text-xs text-blue-600 hover:text-blue-800">Collapse all</button>
          <span className="text-slate-300">|</span>
          <button onClick={onDismiss} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2.5 border-b bg-blue-50/50 text-sm text-slate-700">
        {result.summary?.message}
      </div>

      {/* Steps */}
      <div className="divide-y">
        {steps.map((step: any, idx: number) => (
          <SuiteQLStepCard
            key={idx}
            step={step}
            index={idx}
            expanded={expandedSteps.has(idx)}
            onToggle={() => toggleStep(idx)}
          />
        ))}
      </div>
    </div>
  )
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '\u2014'
  if (typeof value === 'object' && Array.isArray(value)) {
    // Kit components array
    return value.map((c: any) => `${c.component}: ${c.available}/${c.required}`).join(', ')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ---------- Main actions component ----------

export interface ProductActionsProps {
  // Search
  search: string
  onSearchChange: (value: string) => void

  // SuiteQL
  pullingSuiteQL: boolean
  suiteQLHours: string
  onSuiteQLHoursChange: (value: string) => void
  onPullSuiteQL: () => void
  suiteQLResult: any
  onDismissSuiteQL: () => void

  // MR Pull
  pullingMR: boolean
  onPullMR: () => void

  // Push
  pushingAll: boolean
  pushingDirty: boolean
  pushProgress: string | null
  onPushAll: () => void
  onPushDirty: () => void

  // CSV
  onExportCsv: () => void
}

export default function ProductActions({
  search,
  onSearchChange,
  pullingSuiteQL,
  suiteQLHours,
  onSuiteQLHoursChange,
  onPullSuiteQL,
  suiteQLResult,
  onDismissSuiteQL,
  pullingMR,
  onPullMR,
  pushingAll,
  pushingDirty,
  pushProgress,
  onPushAll,
  onPushDirty,
  onExportCsv,
}: ProductActionsProps) {
  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-lg p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search SKU, name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center">
            <Button variant="outline" size="sm" onClick={onPullSuiteQL} disabled={pullingSuiteQL} className="rounded-r-none border-r-0">
              {pullingSuiteQL ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
              SuiteQL
            </Button>
            <select
              value={suiteQLHours}
              onChange={(e) => onSuiteQLHoursChange(e.target.value)}
              disabled={pullingSuiteQL}
              className="h-8 border border-gray-200 rounded-r-md bg-white text-xs px-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {SUITEQL_WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={onPullMR} disabled={pullingMR}>
            {pullingMR ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Pull from NetSuite (MR)
          </Button>
          <Button size="sm" onClick={onPushDirty} disabled={pushingDirty}>
            {pushingDirty ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5 mr-1.5" />}
            Push to Shopify
          </Button>
          <Button variant="outline" size="sm" onClick={onPushAll} disabled={pushingAll}>
            {pushingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5 mr-1.5" />}
            Push All to Shopify
          </Button>
          <Button variant="outline" size="sm" onClick={onExportCsv}>
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
        <SuiteQLResultsPanel result={suiteQLResult} onDismiss={onDismissSuiteQL} />
      )}
    </>
  )
}
