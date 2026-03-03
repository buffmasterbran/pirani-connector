'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Trash2,
  ArrowRight,
  Loader2,
  Info,
  Plus,
} from 'lucide-react'
import {
  type FieldMapping,
  type NsField,
  type StoreConfig,
  SHOPIFY_FIELDS_REQUIRED,
  SHOPIFY_FIELDS_STANDARD,
  SHOPIFY_FIELDS_UNCOMMON,
} from './types'

interface FieldMappingTableProps {
  mappings: FieldMapping[]
  visibleFlagFields: FieldMapping[]
  visibleRequired: FieldMapping[]
  visibleOptional: FieldMapping[]
  visibleMappings: FieldMapping[]
  stores: StoreConfig[]
  filteredNsFields: NsField[]
  nsFieldSearch: string
  setNsFieldSearch: (val: string) => void
  loading: boolean
  syncType: 'price_qty' | 'full'
  updateMapping: (index: number, updates: Partial<FieldMapping>) => void
  deleteMapping: (index: number) => void
  ensureNsFields: () => Promise<void>
  ensurePriceLevels: () => Promise<void>
  ensureInventoryData: () => Promise<void>
  fetchShopifyLocationsForStores: (storeList: StoreConfig[]) => Promise<void>
  getSpecialSummary: (mapping: FieldMapping) => string
  setShowSpecialDialog: (mapping: FieldMapping | null) => void
  setShowAddDialog: (open: boolean) => void
}

const ALL_SHOPIFY_FIELDS = [...SHOPIFY_FIELDS_REQUIRED, ...SHOPIFY_FIELDS_STANDARD, ...SHOPIFY_FIELDS_UNCOMMON]

function MappingRow({
  mapping,
  globalIndex,
  stores,
  filteredNsFields,
  nsFieldSearch,
  setNsFieldSearch,
  updateMapping,
  deleteMapping,
  ensureNsFields,
  ensurePriceLevels,
  ensureInventoryData,
  fetchShopifyLocationsForStores,
  getSpecialSummary,
  setShowSpecialDialog,
}: {
  mapping: FieldMapping
  globalIndex: number
  stores: StoreConfig[]
  filteredNsFields: NsField[]
  nsFieldSearch: string
  setNsFieldSearch: (val: string) => void
  updateMapping: (index: number, updates: Partial<FieldMapping>) => void
  deleteMapping: (index: number) => void
  ensureNsFields: () => Promise<void>
  ensurePriceLevels: () => Promise<void>
  ensureInventoryData: () => Promise<void>
  fetchShopifyLocationsForStores: (storeList: StoreConfig[]) => Promise<void>
  getSpecialSummary: (mapping: FieldMapping) => string
  setShowSpecialDialog: (mapping: FieldMapping | null) => void
}) {
  const isSpecial = mapping.mappingType === 'special'
  const isFlagField = mapping.mappingType === 'flag_field'
  const shopifyDef = ALL_SHOPIFY_FIELDS.find((f) => f.id === mapping.shopifyField)

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

function MappingSection({
  title,
  sectionMappings,
  mappings,
  ...rowProps
}: {
  title: string
  sectionMappings: FieldMapping[]
  mappings: FieldMapping[]
} & Omit<React.ComponentProps<typeof MappingRow>, 'mapping' | 'globalIndex'>) {
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
        return (
          <MappingRow
            key={m.id || `new-${globalIndex}`}
            mapping={m}
            globalIndex={globalIndex}
            {...rowProps}
          />
        )
      })}
    </>
  )
}

export default function FieldMappingTable({
  mappings,
  visibleFlagFields,
  visibleRequired,
  visibleOptional,
  visibleMappings,
  stores,
  filteredNsFields,
  nsFieldSearch,
  setNsFieldSearch,
  loading,
  syncType,
  updateMapping,
  deleteMapping,
  ensureNsFields,
  ensurePriceLevels,
  ensureInventoryData,
  fetchShopifyLocationsForStores,
  getSpecialSummary,
  setShowSpecialDialog,
  setShowAddDialog,
}: FieldMappingTableProps) {
  const sharedRowProps = {
    stores,
    filteredNsFields,
    nsFieldSearch,
    setNsFieldSearch,
    updateMapping,
    deleteMapping,
    ensureNsFields,
    ensurePriceLevels,
    ensureInventoryData,
    fetchShopifyLocationsForStores,
    getSpecialSummary,
    setShowSpecialDialog,
  }

  return (
    <div>
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
                <MappingSection
                  title="Flag Field Settings"
                  sectionMappings={visibleFlagFields}
                  mappings={mappings}
                  {...sharedRowProps}
                />
                <MappingSection
                  title="Required Fields"
                  sectionMappings={visibleRequired}
                  mappings={mappings}
                  {...sharedRowProps}
                />
                <MappingSection
                  title="Optional Fields"
                  sectionMappings={visibleOptional}
                  mappings={mappings}
                  {...sharedRowProps}
                />
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
    </div>
  )
}
