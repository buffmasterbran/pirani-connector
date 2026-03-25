'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Truck,
  Server,
  ScrollText,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react'

interface TestResult {
  status: number
  body: any
  duration: number
  timestamp: string
}

function StatusBadge({ status }: { status: number }) {
  if (status >= 200 && status < 300) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle2 className="h-3 w-3" /> {status} OK
      </span>
    )
  }
  if (status >= 400) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircle className="h-3 w-3" /> {status} Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      <AlertTriangle className="h-3 w-3" /> {status}
    </span>
  )
}

function JsonEditor({
  value,
  onChange,
  readonly = false,
}: {
  value: string
  onChange?: (val: string) => void
  readonly?: boolean
}) {
  return (
    <textarea
      className="w-full h-64 font-mono text-xs p-3 border rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      value={value}
      onChange={e => onChange?.(e.target.value)}
      readOnly={readonly}
      spellCheck={false}
    />
  )
}

function ResponseViewer({ result }: { result: TestResult | null }) {
  if (!result) {
    return (
      <div className="text-sm text-slate-400 italic p-4 border rounded-lg bg-slate-50">
        No response yet. Click &quot;Send Test&quot; to fire the webhook.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <StatusBadge status={result.status} />
        <span className="text-slate-500">{result.duration}ms</span>
        <span className="text-slate-400">{result.timestamp}</span>
      </div>
      <pre className="w-full max-h-96 overflow-auto font-mono text-xs p-3 border rounded-lg bg-slate-900 text-green-400">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  )
}

function InventoryTestTab() {
  const [payload, setPayload] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const loadSample = useCallback(async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/product-sync/test-data?type=inventory')
      const data = await res.json()
      setPayload(JSON.stringify(data.payload, null, 2))
    } catch (err: any) {
      setPayload(JSON.stringify({ error: err.message }, null, 2))
    }
    setLoadingSample(false)
  }, [])

  const sendTest = useCallback(async () => {
    setLoading(true)
    setResult(null)
    const start = Date.now()
    try {
      const parsed = JSON.parse(payload)
      const res = await fetch('/api/webhooks/inventory-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json()
      setResult({
        status: res.status,
        body,
        duration: Date.now() - start,
        timestamp: new Date().toLocaleTimeString(),
      })
    } catch (err: any) {
      setResult({
        status: 0,
        body: { error: err.message },
        duration: Date.now() - start,
        timestamp: new Date().toLocaleTimeString(),
      })
    }
    setLoading(false)
  }, [payload])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Inventory Update Webhook</h3>
          <p className="text-xs text-slate-500 mt-1">
            Simulates what the Map/Reduce script sends every 15 min.
            Updates prices and inventory in Shopify for items that changed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSample} disabled={loadingSample}>
          {loadingSample ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Load Sample Data
        </Button>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Request Payload (editable)</label>
        <JsonEditor value={payload} onChange={setPayload} />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={sendTest} disabled={loading || !payload.trim()} className="bg-blue-600 hover:bg-blue-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Send Test
        </Button>
        <span className="text-xs text-slate-400">POST /api/webhooks/inventory-update</span>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Response</label>
        <ResponseViewer result={result} />
      </div>
    </div>
  )
}

function FulfillmentTestTab() {
  const [payload, setPayload] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [dryRun, setDryRun] = useState(true)

  const loadSample = useCallback(async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/product-sync/test-data?type=fulfillment')
      const data = await res.json()
      setPayload(JSON.stringify(data.payload, null, 2))
    } catch (err: any) {
      setPayload(JSON.stringify({ error: err.message }, null, 2))
    }
    setLoadingSample(false)
  }, [])

  const sendTest = useCallback(async () => {
    setLoading(true)
    setResult(null)
    const start = Date.now()
    try {
      const parsed = JSON.parse(payload)
      if (dryRun) parsed.dry_run = true
      const res = await fetch('/api/webhooks/fulfillment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = await res.json()
      setResult({
        status: res.status,
        body,
        duration: Date.now() - start,
        timestamp: new Date().toLocaleTimeString(),
      })
    } catch (err: any) {
      setResult({
        status: 0,
        body: { error: err.message },
        duration: Date.now() - start,
        timestamp: new Date().toLocaleTimeString(),
      })
    }
    setLoading(false)
  }, [payload, dryRun])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Fulfillment Push Webhook</h3>
          <p className="text-xs text-slate-500 mt-1">
            Simulates what the Scheduled Script sends every 15 min.
            Creates fulfillments in Shopify with tracking info.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSample} disabled={loadingSample}>
          {loadingSample ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Load Sample Data
        </Button>
      </div>

      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <Checkbox
          id="dry-run"
          checked={dryRun}
          onCheckedChange={(checked) => setDryRun(checked === true)}
        />
        <label htmlFor="dry-run" className="text-xs font-medium text-amber-800 cursor-pointer">
          Dry Run Mode — validates the payload and queries Shopify but does NOT create a real fulfillment
        </label>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Request Payload (editable)</label>
        <JsonEditor value={payload} onChange={setPayload} />
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={sendTest}
          disabled={loading || !payload.trim()}
          className={dryRun ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {dryRun ? 'Send Test (Dry Run)' : 'Send Test (LIVE!)'}
        </Button>
        <span className="text-xs text-slate-400">POST /api/webhooks/fulfillment</span>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Response</label>
        <ResponseViewer result={result} />
      </div>
    </div>
  )
}

function RestletTestTab() {
  const [restletUrl, setRestletUrl] = useState('')
  const [params, setParams] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const loadSample = useCallback(async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/product-sync/test-data?type=restlet')
      const data = await res.json()
      setParams(JSON.stringify(data.params, null, 2))
      setRestletUrl(data.sampleUrl)
    } catch (err: any) {
      setParams(JSON.stringify({ error: err.message }, null, 2))
    }
    setLoadingSample(false)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">RESTlet Connection Test</h3>
          <p className="text-xs text-slate-500 mt-1">
            Tests calling the NetSuite RESTlet for on-demand product pulls.
            The RESTlet must be deployed in NetSuite first.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSample} disabled={loadingSample}>
          {loadingSample ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Load Config
        </Button>
      </div>

      <div className="p-4 bg-slate-50 border rounded-lg space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">RESTlet External URL</label>
          <input
            type="text"
            className="w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={restletUrl}
            onChange={e => setRestletUrl(e.target.value)}
            placeholder="https://<ACCOUNT_ID>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=..."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Parameters</label>
          <JsonEditor value={params} onChange={setParams} />
        </div>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> The RESTlet requires OAuth 1.0 authentication from the server side.
          Direct browser testing is not supported. Once deployed, the webapp will call the RESTlet from its API routes.
          Use this panel to configure and save the RESTlet URL for integration.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Response</label>
        <ResponseViewer result={result} />
      </div>
    </div>
  )
}

interface WebhookLogEntry {
  id: number
  endpoint: string
  method: string
  requestPayload: any
  responsePayload: any
  responseStatus: number | null
  durationMs: number | null
  source: string | null
  itemCount: number | null
  summary: string | null
  createdAt: string
}

function WebhookActivityLog() {
  const [logs, setLogs] = useState<WebhookLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [clearing, setClearing] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const endpoint = filter !== 'all' ? `&endpoint=${encodeURIComponent(filter)}` : ''
      const res = await fetch(`/api/webhooks/logs?limit=50${endpoint}`)
      const data = await res.json()
      setLogs(data.logs || [])
    } catch {
      setLogs([])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const clearLogs = useCallback(async () => {
    setClearing(true)
    try {
      await fetch('/api/webhooks/logs', { method: 'DELETE' })
      setLogs([])
    } catch { /* ignore */ }
    setClearing(false)
  }, [])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString()
  }

  const endpointLabel = (ep: string) => {
    if (ep.includes('inventory')) return 'Inventory'
    if (ep.includes('fulfillment')) return 'Fulfillment'
    return ep
  }

  const filteredLogs = logs

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Webhook Activity Log</h3>
          <span className="text-xs text-slate-400">Last {filteredLogs.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-xs border rounded px-2 py-1 bg-white"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Endpoints</option>
            <option value="/api/webhooks/inventory-update">Inventory Only</option>
            <option value="/api/webhooks/fulfillment">Fulfillment Only</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs} disabled={clearing} className="text-red-600 hover:text-red-700">
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 border rounded-lg bg-slate-50">
          <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No webhook activity yet. Send a test or wait for the NetSuite scripts to call in.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map(log => {
            const isExpanded = expandedId === log.id
            const isSuccess = log.responseStatus && log.responseStatus >= 200 && log.responseStatus < 300

            return (
              <div key={log.id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}

                  {isSuccess ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}

                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    log.endpoint.includes('inventory')
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {endpointLabel(log.endpoint)}
                  </span>

                  <span className="text-xs text-slate-600 font-medium">
                    {log.itemCount != null ? `${log.itemCount} item${log.itemCount !== 1 ? 's' : ''}` : ''}
                  </span>

                  <span className="text-xs text-slate-500 flex-1 truncate">
                    {log.summary || ''}
                  </span>

                  <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    {log.durationMs != null ? `${log.durationMs}ms` : '—'}
                  </span>

                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {formatTime(log.createdAt)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t bg-slate-50 p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Request Payload</label>
                        <pre className="text-xs font-mono bg-slate-900 text-green-400 p-3 rounded-lg overflow-auto max-h-64">
                          {JSON.stringify(log.requestPayload, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1">Response ({log.responseStatus})</label>
                        <pre className="text-xs font-mono bg-slate-900 text-green-400 p-3 rounded-lg overflow-auto max-h-64">
                          {JSON.stringify(log.responsePayload, null, 2)}
                        </pre>
                      </div>
                    </div>
                    {log.source && (
                      <div className="text-xs text-slate-400">
                        Source: <code className="bg-slate-200 px-1 rounded">{log.source}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ScriptTestingView() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Script Testing</h2>
        <p className="text-slate-500 mt-1">
          Test the webhook endpoints that the NetSuite SuiteScripts will call.
          Load sample data from your database, edit payloads, and verify responses.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="inventory">
            <TabsList className="mb-4">
              <TabsTrigger value="inventory" className="gap-2">
                <Database className="h-4 w-4" />
                Inventory Update
              </TabsTrigger>
              <TabsTrigger value="fulfillment" className="gap-2">
                <Truck className="h-4 w-4" />
                Fulfillment Push
              </TabsTrigger>
              <TabsTrigger value="restlet" className="gap-2">
                <Server className="h-4 w-4" />
                RESTlet
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inventory">
              <InventoryTestTab />
            </TabsContent>
            <TabsContent value="fulfillment">
              <FulfillmentTestTab />
            </TabsContent>
            <TabsContent value="restlet">
              <RestletTestTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Received from NetSuite
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WebhookActivityLog />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Endpoint Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <code className="font-mono text-blue-700 whitespace-nowrap">POST /api/webhooks/inventory-update</code>
              <span className="text-slate-600">
                Receives inventory/price data from the Map/Reduce script. Updates ProductSyncMapping and pushes changes to Shopify.
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <code className="font-mono text-blue-700 whitespace-nowrap">POST /api/webhooks/fulfillment</code>
              <span className="text-slate-600">
                Receives Item Fulfillment data from the Scheduled Script. Creates Shopify fulfillments with tracking.
                Add <code className="bg-slate-200 px-1 rounded">dry_run: true</code> to test without creating real fulfillments.
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <code className="font-mono text-blue-700 whitespace-nowrap">GET /api/product-sync/test-data</code>
              <span className="text-slate-600">
                Returns sample payloads from real DB data. Params: <code className="bg-slate-200 px-1 rounded">type=inventory|fulfillment|restlet</code>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
