'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStoreContext } from '@/lib/product-sync/store-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Loader2,
  ArrowRight,
  TestTube,
  Search,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react'

interface FieldMapping {
  id?: string
  storeConfigId: string | null
  mappingType: string
  shopifyField: string
  netsuiteFieldId: string | null
  defaultValue: string | null
  isRequired: boolean
  isEnabled: boolean
  sortOrder: number
  category: string
  specialConfig: Record<string, unknown> | null
  storeConfig?: { storeName: string; storeLabel: string | null } | null
}

interface NsField {
  fieldId: string
  label: string
  type: string
  group: string
}

interface StoreConfig {
  id: string
  storeName: string
  storeLabel: string | null
}

interface NsPriceLevel {
  id: number
  name: string
}

interface NsLocation {
  id: number
  name: string
}

interface ShopifyLocation {
  id: string
  name: string
  isActive: boolean
}

interface LocationMapping {
  id: string
  storeConfigId: string
  netsuiteLocationId: number
  netsuiteLocationName: string | null
  shopifyLocationId: string
  shopifyLocationName: string | null
  isActive: boolean
}

const SHOPIFY_FIELDS_REQUIRED = [
  { id: 'sku', label: 'SKU', description: 'Product variant SKU' },
  { id: 'title', label: 'Title', description: 'Product title' },
  { id: 'price', label: 'Price', description: 'Variant price', special: true },
  { id: 'inventory_quantity', label: 'Inventory Quantity', description: 'Stock level', special: true },
]

const SHOPIFY_FIELDS_STANDARD = [
  { id: 'body_html', label: 'Description (HTML)', description: 'Product description' },
  { id: 'compare_at_price', label: 'Compare at Price', description: 'Original price for sale display', special: true },
  { id: 'collections', label: 'Collections / Category', description: 'Product collection assignment', special: true },
  { id: 'weight', label: 'Weight', description: 'Product weight' },
  { id: 'weight_unit', label: 'Weight Unit', description: 'kg, g, lb, oz' },
  { id: 'barcode', label: 'Barcode', description: 'UPC/EAN barcode' },
  { id: 'vendor', label: 'Vendor', description: 'Product vendor/manufacturer' },
  { id: 'product_type', label: 'Product Type', description: 'Shopify product type' },
  { id: 'tags', label: 'Tags', description: 'Comma-separated tags' },
  { id: 'published', label: 'Published', description: 'Visible on storefront' },
  { id: 'taxable', label: 'Taxable', description: 'Subject to tax' },
]

const SHOPIFY_FIELDS_UNCOMMON = [
  { id: 'handle', label: 'Handle', description: 'URL handle' },
  { id: 'variant_title', label: 'Variant Title', description: 'Variant display name' },
  { id: 'requires_shipping', label: 'Requires Shipping', description: 'Physical product flag' },
  { id: 'inventory_policy', label: 'Inventory Policy', description: 'Allow overselling' },
  { id: 'metafields_global_title_tag', label: 'SEO Title', description: 'Meta title tag' },
  { id: 'metafields_global_description_tag', label: 'SEO Description', description: 'Meta description tag' },
  { id: 'published_at', label: 'Published At', description: 'Publish date' },
  { id: 'published_scope', label: 'Published Scope', description: 'web, global' },
  { id: 'inventory_management', label: 'Inventory Management', description: 'Tracked by Shopify' },
]

function LocationMappingAdder({
  storeId,
  nsLocations,
  shopifyLocations,
  existingMappings,
  onAdd,
  disabled,
}: {
  storeId: string
  nsLocations: NsLocation[]
  shopifyLocations: ShopifyLocation[]
  existingMappings: LocationMapping[]
  onAdd: (storeId: string, nsLocId: number, shopifyLocId: string) => Promise<void>
  disabled: boolean
}) {
  const [nsLocId, setNsLocId] = useState('')
  const [shopifyLocId, setShopifyLocId] = useState('')
  const [adding, setAdding] = useState(false)

  const usedNsIds = new Set(existingMappings.map((m) => m.netsuiteLocationId))
  const availableNsLocs = nsLocations.filter((l) => !usedNsIds.has(l.id))
  const activeShopifyLocs = shopifyLocations.filter((l) => l.isActive)

  const handleAdd = async () => {
    if (!nsLocId || !shopifyLocId) return
    setAdding(true)
    try {
      await onAdd(storeId, parseInt(nsLocId), shopifyLocId)
      setNsLocId('')
      setShopifyLocId('')
    } finally {
      setAdding(false)
    }
  }

  if (availableNsLocs.length === 0 && existingMappings.length > 0) {
    return (
      <p className="text-xs text-slate-400">All NetSuite locations are mapped for this store.</p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={nsLocId} onValueChange={setNsLocId}>
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder="NetSuite location..." />
          </SelectTrigger>
          <SelectContent>
            {availableNsLocs.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
        <Select value={shopifyLocId} onValueChange={setShopifyLocId}>
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder="Shopify location..." />
          </SelectTrigger>
          <SelectContent>
            {activeShopifyLocs.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleAdd}
        disabled={disabled || adding || !nsLocId || !shopifyLocId}
      >
        {adding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
        Add Location Mapping
      </Button>
    </div>
  )
}

export default function ProductFieldMappings() {
  const { stores: rawStores } = useStoreContext()
  const stores: StoreConfig[] = useMemo(
    () => rawStores.map((s) => ({ id: s.id, storeName: s.storeName, storeLabel: s.storeLabel })),
    [rawStores]
  )

  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [nsFields, setNsFields] = useState<NsField[]>([])
  const [nsPriceLevels, setNsPriceLevels] = useState<NsPriceLevel[]>([])
  const [nsLocations, setNsLocations] = useState<NsLocation[]>([])
  const [shopifyLocations, setShopifyLocations] = useState<Record<string, ShopifyLocation[]>>({})
  const [locationMappings, setLocationMappings] = useState<LocationMapping[]>([])
  const [locationMappingsLoading, setLocationMappingsLoading] = useState(false)
  const [syncType, setSyncType] = useState<'price_qty' | 'full'>('price_qty')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addCategory, setAddCategory] = useState<'required' | 'standard' | 'uncommon'>('standard')
  const [showSpecialDialog, setShowSpecialDialog] = useState<FieldMapping | null>(null)
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [testItemId, setTestItemId] = useState('')
  const [testResults, setTestResults] = useState<Record<string, string> | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [nsFieldSearch, setNsFieldSearch] = useState('')
  const [fieldLoadError, setFieldLoadError] = useState<string | null>(null)

  // --- Initial load: only field-mappings (1 DB call, fast) ---
  // Stores come from StoreContext which is already loaded by the app shell.
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/product-sync/config/field-mappings')
      if (res.ok) {
        const data = await res.json()
        const fetched: FieldMapping[] = data.mappings || []

        if (fetched.length === 0) {
          const seedRes = await fetch('/api/product-sync/config/field-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'seed' }),
          })
          if (seedRes.ok) {
            const refreshRes = await fetch('/api/product-sync/config/field-mappings')
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json()
              setMappings(refreshData.mappings || [])
            }
          }
        } else {
          setMappings(fetched)
        }
      }
    } catch (err) {
      console.error('Error loading field mapping data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Lazy loaders: fetch on-demand, cache after first successful load ---
  const ensureNsFields = useCallback(async () => {
    if (nsFields.length > 0) return
    try {
      const res = await fetch('/api/product-sync/netsuite/fields')
      if (res.ok) {
        const data = await res.json()
        setNsFields(data.fields || [])
      } else {
        setFieldLoadError('Could not load NetSuite fields')
      }
    } catch {
      setFieldLoadError('Could not load NetSuite fields')
    }
  }, [nsFields.length])

  const ensurePriceLevels = useCallback(async () => {
    if (nsPriceLevels.length > 0) return
    try {
      const res = await fetch('/api/product-sync/netsuite/price-levels')
      if (res.ok) {
        const data = await res.json()
        setNsPriceLevels(data.priceLevels || [])
      }
    } catch { /* silent */ }
  }, [nsPriceLevels.length])

  const ensureInventoryData = useCallback(async () => {
    const fetches: Promise<void>[] = []

    if (nsLocations.length === 0) {
      fetches.push(
        fetch('/api/product-sync/netsuite/locations')
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              setNsLocations(data.locations || [])
            }
          })
          .catch(() => {})
      )
    }

    if (locationMappings.length === 0) {
      fetches.push(
        fetch('/api/product-sync/config/locations')
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              setLocationMappings(Array.isArray(data) ? data : [])
            }
          })
          .catch(() => {})
      )
    }

    await Promise.all(fetches)
  }, [nsLocations.length, locationMappings.length])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/product-sync/config/field-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_save', mappings }),
      })
      if (res.ok) {
        setHasChanges(false)
        await fetchData()
      }
    } catch (err) {
      console.error('Error saving mappings:', err)
    } finally {
      setSaving(false)
    }
  }

  const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
    setMappings((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
    setHasChanges(true)
  }

  const deleteMapping = async (index: number) => {
    const mapping = mappings[index]
    if (mapping.isRequired) return
    if (mapping.id) {
      await fetch('/api/product-sync/config/field-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: mapping.id }),
      })
    }
    setMappings((prev) => prev.filter((_, i) => i !== index))
    setHasChanges(true)
  }

  const addMapping = (shopifyFieldId: string) => {
    const allShopifyFields = [...SHOPIFY_FIELDS_REQUIRED, ...SHOPIFY_FIELDS_STANDARD, ...SHOPIFY_FIELDS_UNCOMMON]
    const field = allShopifyFields.find((f) => f.id === shopifyFieldId)
    if (!field) return

    const exists = mappings.some((m) => m.shopifyField === shopifyFieldId)
    if (exists) return

    const isSpecial = 'special' in field && field.special
    const newMapping: FieldMapping = {
      storeConfigId: null,
      mappingType: isSpecial ? 'special' : 'item_field',
      shopifyField: shopifyFieldId,
      netsuiteFieldId: null,
      defaultValue: null,
      isRequired: false,
      isEnabled: true,
      sortOrder: mappings.length,
      category: addCategory,
      specialConfig: isSpecial ? {} : null,
    }

    setMappings((prev) => [...prev, newMapping])
    setHasChanges(true)
    setShowAddDialog(false)
  }

  const getSpecialSummary = (mapping: FieldMapping): string => {
    const config = mapping.specialConfig as Record<string, unknown> | null
    if (!config) return 'Not configured'

    if (mapping.shopifyField === 'price' || mapping.shopifyField === 'compare_at_price') {
      const plId = config.priceLevelId as number | undefined
      const plName = config.priceLevelName as string | undefined
      if (plId) {
        const pl = nsPriceLevels.find((p) => p.id === plId)
        return `Price Level: ${pl?.name || plName || `ID ${plId}`}`
      }
      return 'No price level selected'
    }

    if (mapping.shopifyField === 'inventory_quantity') {
      const count = locationMappings.filter((lm) => lm.isActive).length
      if (count > 0) return `${count} location mapping${count !== 1 ? 's' : ''} configured`
      return 'Click to configure locations'
    }

    if (mapping.shopifyField === 'collections') {
      return config.categoryField ? `Field: ${config.categoryField}` : 'Not configured'
    }

    return 'Click to configure'
  }

  const fetchShopifyLocationsForStores = useCallback(async (storeList: StoreConfig[]) => {
    const locs: Record<string, ShopifyLocation[]> = { ...shopifyLocations }
    const missing = storeList.filter((s) => !locs[s.id])
    if (missing.length === 0) return

    await Promise.all(
      missing.map(async (store) => {
        try {
          const res = await fetch(`/api/product-sync/shopify/locations?storeConfigId=${store.id}`)
          if (res.ok) {
            locs[store.id] = await res.json()
          }
        } catch {
          // Will show empty
        }
      })
    )
    setShopifyLocations(locs)
  }, [shopifyLocations])

  const addLocationMapping = async (
    storeConfigId: string,
    nsLocId: number,
    shopifyLocId: string,
  ) => {
    const nsLoc = nsLocations.find((l) => l.id === nsLocId)
    const shopifyLoc = shopifyLocations[storeConfigId]?.find((l) => l.id === shopifyLocId)
    setLocationMappingsLoading(true)
    try {
      const res = await fetch('/api/product-sync/config/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeConfigId,
          netsuiteLocationId: nsLocId,
          netsuiteLocationName: nsLoc?.name || null,
          shopifyLocationId: shopifyLocId,
          shopifyLocationName: shopifyLoc?.name || null,
        }),
      })
      if (res.ok) {
        const newMapping = await res.json()
        setLocationMappings((prev) => [...prev, newMapping])
      }
    } catch (err) {
      console.error('Error adding location mapping:', err)
    } finally {
      setLocationMappingsLoading(false)
    }
  }

  const deleteLocationMapping = async (id: string) => {
    setLocationMappingsLoading(true)
    try {
      await fetch(`/api/product-sync/config/locations?id=${id}`, { method: 'DELETE' })
      setLocationMappings((prev) => prev.filter((lm) => lm.id !== id))
    } catch (err) {
      console.error('Error deleting location mapping:', err)
    } finally {
      setLocationMappingsLoading(false)
    }
  }

  const filteredNsFields = nsFields.filter((f) => {
    if (!nsFieldSearch) return true
    return (
      f.fieldId.toLowerCase().includes(nsFieldSearch.toLowerCase()) ||
      f.label.toLowerCase().includes(nsFieldSearch.toLowerCase())
    )
  })

  const availableFieldsToAdd = () => {
    const existingIds = new Set(mappings.map((m) => m.shopifyField))
    const lists: Record<string, Array<{ id: string; label: string; description: string }>> = {
      required: SHOPIFY_FIELDS_REQUIRED.filter((f) => !existingIds.has(f.id)),
      standard: SHOPIFY_FIELDS_STANDARD.filter((f) => !existingIds.has(f.id)),
      uncommon: SHOPIFY_FIELDS_UNCOMMON.filter((f) => !existingIds.has(f.id)),
    }
    return lists
  }

  const handleTestMappings = async () => {
    if (!testItemId.trim()) return
    setTestLoading(true)
    setTestResults(null)
    try {
      const res = await fetch(
        `/api/product-sync/netsuite/debug?itemId=${encodeURIComponent(testItemId.trim())}`
      )
      if (res.ok) {
        const data = await res.json()
        const item = data.item || data.items?.[0] || {}
        const resolved: Record<string, string> = {}
        for (const mapping of mappings) {
          if (!mapping.isEnabled) continue
          if (mapping.mappingType === 'special') {
            resolved[mapping.shopifyField] = getSpecialSummary(mapping)
          } else if (mapping.netsuiteFieldId) {
            const val = item[mapping.netsuiteFieldId]
            resolved[mapping.shopifyField] = val != null ? String(val) : mapping.defaultValue || '(empty)'
          } else {
            resolved[mapping.shopifyField] = mapping.defaultValue || '(not mapped)'
          }
        }
        setTestResults(resolved)
      } else {
        setTestResults({ error: 'Failed to fetch item from NetSuite' })
      }
    } catch {
      setTestResults({ error: 'Network error' })
    } finally {
      setTestLoading(false)
    }
  }

  const flagFieldMappings = mappings.filter((m) => m.mappingType === 'flag_field')
  const requiredMappings = mappings.filter((m) => m.mappingType !== 'flag_field' && (m.isRequired || m.category === 'required'))
  const optionalMappings = mappings.filter((m) => m.mappingType !== 'flag_field' && !m.isRequired && m.category !== 'required')

  const visibleMappings = syncType === 'price_qty'
    ? mappings.filter((m) =>
        m.mappingType === 'flag_field' ||
        ['sku', 'price', 'compare_at_price', 'inventory_quantity'].includes(m.shopifyField)
      )
    : mappings

  const visibleFlagFields = visibleMappings.filter((m) => m.mappingType === 'flag_field')
  const visibleRequired = visibleMappings.filter((m) => m.mappingType !== 'flag_field' && (m.isRequired || m.category === 'required'))
  const visibleOptional = visibleMappings.filter((m) => m.mappingType !== 'flag_field' && !m.isRequired && m.category !== 'required')

  const renderMappingRow = (mapping: FieldMapping, globalIndex: number) => {
    const isSpecial = mapping.mappingType === 'special'
    const isFlagField = mapping.mappingType === 'flag_field'
    const allShopifyFields = [...SHOPIFY_FIELDS_REQUIRED, ...SHOPIFY_FIELDS_STANDARD, ...SHOPIFY_FIELDS_UNCOMMON]
    const shopifyDef = allShopifyFields.find((f) => f.id === mapping.shopifyField)

    return (
      <tr key={mapping.id || `new-${globalIndex}`} className="border-b border-slate-100 hover:bg-slate-50/50">
        {/* Toggle */}
        <td className="px-3 py-3 w-12">
          {!isFlagField && (
            <Checkbox
              checked={mapping.isEnabled}
              onCheckedChange={(checked: boolean | 'indeterminate') => updateMapping(globalIndex, { isEnabled: !!checked })}
            />
          )}
        </td>

        {/* Mapping Type */}
        <td className="px-3 py-3 w-36">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            isFlagField ? 'bg-amber-100 text-amber-700' :
            isSpecial ? 'bg-blue-100 text-blue-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {isFlagField ? 'Flag field' : isSpecial ? 'Special' : 'Item field'}
          </span>
        </td>

        {/* NetSuite Field ID */}
        <td className="px-3 py-3">
          {isSpecial ? (
            <button
              onClick={() => {
                setShowSpecialDialog(mapping)
                if (mapping.shopifyField === 'price' || mapping.shopifyField === 'compare_at_price') {
                  ensurePriceLevels()
                } else if (mapping.shopifyField === 'inventory_quantity') {
                  ensureInventoryData()
                  fetchShopifyLocationsForStores(stores)
                } else if (mapping.shopifyField === 'collections') {
                  ensureNsFields()
                }
              }}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              {getSpecialSummary(mapping)}
            </button>
          ) : isFlagField ? (
            <span className="text-sm text-slate-600 font-mono">{mapping.netsuiteFieldId}</span>
          ) : (
            <Select
              value={mapping.netsuiteFieldId || ''}
              onValueChange={(val) => updateMapping(globalIndex, { netsuiteFieldId: val || null })}
              onOpenChange={(open) => { if (open) ensureNsFields() }}
            >
              <SelectTrigger className="h-8 text-sm font-mono">
                <SelectValue placeholder="Select NS field..." />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1.5">
                  <Input
                    placeholder="Search fields..."
                    value={nsFieldSearch}
                    onChange={(e) => setNsFieldSearch(e.target.value)}
                    className="h-7 text-sm"
                  />
                </div>
                {filteredNsFields.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">No fields found</div>
                ) : (
                  <>
                    {filteredNsFields.filter((f) => f.group === 'standard').length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase">Standard</div>
                    )}
                    {filteredNsFields.filter((f) => f.group === 'standard').map((f) => (
                      <SelectItem key={f.fieldId} value={f.fieldId}>
                        <span className="font-mono text-xs">{f.fieldId}</span>
                        <span className="ml-2 text-slate-400 text-xs">({f.label})</span>
                      </SelectItem>
                    ))}
                    {filteredNsFields.filter((f) => f.group === 'custom').length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase mt-1">Custom</div>
                    )}
                    {filteredNsFields.filter((f) => f.group === 'custom').map((f) => (
                      <SelectItem key={f.fieldId} value={f.fieldId}>
                        <span className="font-mono text-xs">{f.fieldId}</span>
                        <span className="ml-2 text-slate-400 text-xs">({f.label})</span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          )}
        </td>

        {/* Default Value */}
        <td className="px-3 py-3 w-28">
          {!isFlagField && !isSpecial && (
            <Input
              className="h-8 text-sm"
              placeholder="N/A"
              value={mapping.defaultValue || ''}
              onChange={(e) => updateMapping(globalIndex, { defaultValue: e.target.value || null })}
            />
          )}
        </td>

        {/* Arrow */}
        <td className="px-2 py-3 w-8 text-center">
          <ArrowRight className="h-4 w-4 text-slate-300 inline" />
        </td>

        {/* Shopify Field */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">
              {shopifyDef?.label || mapping.shopifyField}
            </span>
            {mapping.isRequired && <span className="text-red-500 text-xs">*</span>}
            {shopifyDef && (
              <span className="text-xs text-slate-400" title={shopifyDef.description}>
                <Info className="h-3 w-3 inline" />
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono">{mapping.shopifyField}</div>
        </td>

        {/* Account */}
        <td className="px-3 py-3 w-48">
          <Select
            value={mapping.storeConfigId || 'all'}
            onValueChange={(val) => updateMapping(globalIndex, { storeConfigId: val === 'all' ? null : val })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.storeLabel || s.storeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Delete */}
        <td className="px-3 py-3 w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-red-500"
            onClick={() => deleteMapping(globalIndex)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    )
  }

  const renderMappingSection = (title: string, sectionMappings: FieldMapping[]) => {
    if (sectionMappings.length === 0) return null
    return (
      <>
        <tr>
          <td colSpan={8} className="px-3 py-2 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
          </td>
        </tr>
        {sectionMappings.map((m) => {
          const globalIndex = mappings.indexOf(m)
          return renderMappingRow(m, globalIndex)
        })}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Product Mappings</h2>
          <p className="text-slate-500 text-sm mt-1">
            Configure how NetSuite item fields map to Shopify product fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTestDialog(true)} disabled={loading}>
            <TestTube className="h-4 w-4 mr-1" />
            Test Mappings
          </Button>
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={() => fetchData()}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Sync Type Toggle */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-600">Select sync type</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setSyncType('price_qty')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  syncType === 'price_qty'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Price and Quantity only
              </button>
              <button
                onClick={() => setSyncType('full')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  syncType === 'full'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Full product
              </button>
            </div>
            {fieldLoadError && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" /> {fieldLoadError}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mapping Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 w-12"></th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 w-36">Mapping type</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">NetSuite field Id</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 w-28">Default value</th>
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500">Shopify field</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 w-48">Account</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400 inline-block" />
                      <span className="ml-2 text-slate-400">Loading mappings...</span>
                    </td>
                  </tr>
                ) : (
                  <>
                    {renderMappingSection('Flag Field Settings', visibleFlagFields)}
                    {renderMappingSection('Required Fields', visibleRequired)}
                    {renderMappingSection('Optional Fields', visibleOptional)}
                    {visibleMappings.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-12 text-center text-slate-400">
                          No mappings configured. Click &quot;+ Add mapping&quot; to get started.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Required indicator + Add mapping */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              <span className="text-red-500">*</span> Required field
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              disabled={syncType === 'price_qty'}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add mapping
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Mapping Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Field Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['required', 'standard', 'uncommon'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setAddCategory(cat)}
                  className={`flex-1 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    addCategory === cat
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {availableFieldsToAdd()[addCategory]?.map((field) => (
                <button
                  key={field.id}
                  onClick={() => addMapping(field.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-700">{field.label}</div>
                  <div className="text-xs text-slate-400">{field.description}</div>
                </button>
              )) || (
                <div className="py-4 text-center text-sm text-slate-400">All fields in this category are already mapped</div>
              )}
              {availableFieldsToAdd()[addCategory]?.length === 0 && (
                <div className="py-4 text-center text-sm text-slate-400">All fields in this category are already mapped</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Special Mapping Dialog */}
      <Dialog open={!!showSpecialDialog} onOpenChange={() => setShowSpecialDialog(null)}>
        <DialogContent className={showSpecialDialog?.shopifyField === 'inventory_quantity' ? 'max-w-lg' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>
              Configure: {showSpecialDialog?.shopifyField === 'price' ? 'Price' :
                showSpecialDialog?.shopifyField === 'compare_at_price' ? 'Compare at Price' :
                showSpecialDialog?.shopifyField === 'inventory_quantity' ? 'Inventory Quantity' :
                showSpecialDialog?.shopifyField === 'collections' ? 'Collections / Category' :
                showSpecialDialog?.shopifyField}
            </DialogTitle>
          </DialogHeader>
          {showSpecialDialog && (
            <div className="space-y-4">
              {(showSpecialDialog.shopifyField === 'price' || showSpecialDialog.shopifyField === 'compare_at_price') && (
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-2">
                    Map price from the following price level
                  </label>
                  <Select
                    value={String((showSpecialDialog.specialConfig as Record<string, unknown>)?.priceLevelId || '')}
                    onValueChange={(val) => {
                      const idx = mappings.indexOf(showSpecialDialog)
                      if (idx >= 0) {
                        const pl = nsPriceLevels.find((p) => p.id === parseInt(val))
                        const newConfig = {
                          ...(showSpecialDialog.specialConfig || {}),
                          priceLevelId: parseInt(val),
                          priceLevelName: pl?.name || null,
                        }
                        updateMapping(idx, { specialConfig: newConfig })
                        setShowSpecialDialog({ ...showSpecialDialog, specialConfig: newConfig })
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select price level..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nsPriceLevels.map((pl) => (
                        <SelectItem key={pl.id} value={String(pl.id)}>
                          {pl.name} (ID: {pl.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showSpecialDialog.shopifyField === 'inventory_quantity' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Map each NetSuite warehouse to a Shopify location. Inventory will be pushed to
                    the matched Shopify location for each store.
                  </p>

                  {stores.length === 0 ? (
                    <div className="text-sm text-amber-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      No stores configured yet. Connect a Shopify store first.
                    </div>
                  ) : (
                    stores.map((store) => {
                      const storeLocs = shopifyLocations[store.id] || []
                      const storeMappings = locationMappings.filter((lm) => lm.storeConfigId === store.id)

                      return (
                        <div key={store.id} className="border border-slate-200 rounded-lg p-3 space-y-3">
                          <h4 className="text-sm font-semibold text-slate-700">
                            {store.storeLabel || store.storeName}
                          </h4>

                          {storeMappings.length > 0 && (
                            <div className="space-y-2">
                              {storeMappings.map((lm) => (
                                <div key={lm.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded px-3 py-2">
                                  <span className="font-medium text-slate-700 flex-1">
                                    {lm.netsuiteLocationName || `NS #${lm.netsuiteLocationId}`}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                  <span className="text-slate-600 flex-1">
                                    {lm.shopifyLocationName || lm.shopifyLocationId}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400 hover:text-red-500 flex-shrink-0"
                                    onClick={() => deleteLocationMapping(lm.id)}
                                    disabled={locationMappingsLoading}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add new mapping row */}
                          <LocationMappingAdder
                            storeId={store.id}
                            nsLocations={nsLocations}
                            shopifyLocations={storeLocs}
                            existingMappings={storeMappings}
                            onAdd={addLocationMapping}
                            disabled={locationMappingsLoading}
                          />

                          {storeLocs.length === 0 && (
                            <p className="text-xs text-amber-500">
                              Could not load Shopify locations for this store.
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {showSpecialDialog.shopifyField === 'collections' && (
                <div>
                  <label className="text-sm font-medium text-slate-600 block mb-2">
                    NetSuite field for category/collection
                  </label>
                  <Select
                    value={String((showSpecialDialog.specialConfig as Record<string, unknown>)?.categoryField || '')}
                    onValueChange={(val) => {
                      const idx = mappings.indexOf(showSpecialDialog)
                      if (idx >= 0) {
                        updateMapping(idx, {
                          specialConfig: {
                            ...(showSpecialDialog.specialConfig || {}),
                            categoryField: val,
                          },
                        })
                        setShowSpecialDialog({
                          ...showSpecialDialog,
                          specialConfig: {
                            ...(showSpecialDialog.specialConfig || {}),
                            categoryField: val,
                          },
                        })
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select NS field..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class">Class</SelectItem>
                      <SelectItem value="department">Department</SelectItem>
                      {nsFields.filter((f) => f.group === 'custom').map((f) => (
                        <SelectItem key={f.fieldId} value={f.fieldId}>
                          {f.label} ({f.fieldId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowSpecialDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Mappings Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Product Mappings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter NetSuite Item Internal ID..."
                value={testItemId}
                onChange={(e) => setTestItemId(e.target.value)}
              />
              <Button onClick={handleTestMappings} disabled={testLoading || !testItemId.trim()}>
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {testResults && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Shopify Field</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Resolved Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(testResults).map(([field, value]) => (
                      <tr key={field} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-sm font-mono text-slate-600">{field}</td>
                        <td className="px-3 py-2 text-sm text-slate-800">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
