'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Trash2,
  ArrowRight,
  Loader2,
  Plus,
  AlertCircle,
} from 'lucide-react'
import type {
  StoreConfig,
  NsLocation,
  ShopifyLocation,
  LocationMapping,
} from './types'

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

interface LocationMappingSectionProps {
  stores: StoreConfig[]
  nsLocations: NsLocation[]
  shopifyLocations: Record<string, ShopifyLocation[]>
  locationMappings: LocationMapping[]
  locationMappingsLoading: boolean
  addLocationMapping: (storeConfigId: string, nsLocId: number, shopifyLocId: string) => Promise<void>
  deleteLocationMapping: (id: string) => Promise<void>
}

export default function LocationMappingSection({
  stores,
  nsLocations,
  shopifyLocations,
  locationMappings,
  locationMappingsLoading,
  addLocationMapping,
  deleteLocationMapping,
}: LocationMappingSectionProps) {
  return (
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
  )
}
