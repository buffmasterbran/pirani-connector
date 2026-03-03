import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStoreContext } from '@/lib/product-sync/store-context'
import {
  type FieldMapping,
  type NsField,
  type NsPriceLevel,
  type NsLocation,
  type ShopifyLocation,
  type LocationMapping,
  type StoreConfig,
  SHOPIFY_FIELDS_REQUIRED,
  SHOPIFY_FIELDS_STANDARD,
  SHOPIFY_FIELDS_UNCOMMON,
} from './types'

export function useFieldMappings() {
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

  // Computed filtered sets
  const visibleMappings = syncType === 'price_qty'
    ? mappings.filter((m) =>
        m.mappingType === 'flag_field' ||
        ['sku', 'price', 'compare_at_price', 'inventory_quantity'].includes(m.shopifyField)
      )
    : mappings

  const visibleFlagFields = visibleMappings.filter((m) => m.mappingType === 'flag_field')
  const visibleRequired = visibleMappings.filter((m) => m.mappingType !== 'flag_field' && (m.isRequired || m.category === 'required'))
  const visibleOptional = visibleMappings.filter((m) => m.mappingType !== 'flag_field' && !m.isRequired && m.category !== 'required')

  return {
    // Data
    stores,
    mappings,
    nsFields,
    filteredNsFields,
    nsPriceLevels,
    nsLocations,
    shopifyLocations,
    locationMappings,
    locationMappingsLoading,

    // UI state
    syncType,
    setSyncType,
    loading,
    saving,
    hasChanges,
    showAddDialog,
    setShowAddDialog,
    addCategory,
    setAddCategory,
    showSpecialDialog,
    setShowSpecialDialog,
    showTestDialog,
    setShowTestDialog,
    testItemId,
    setTestItemId,
    testResults,
    testLoading,
    nsFieldSearch,
    setNsFieldSearch,
    fieldLoadError,

    // Computed
    visibleMappings,
    visibleFlagFields,
    visibleRequired,
    visibleOptional,

    // Actions
    fetchData,
    ensureNsFields,
    ensurePriceLevels,
    ensureInventoryData,
    fetchShopifyLocationsForStores,
    handleSave,
    updateMapping,
    deleteMapping,
    addMapping,
    addLocationMapping,
    deleteLocationMapping,
    getSpecialSummary,
    availableFieldsToAdd,
    handleTestMappings,
  }
}
