'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FieldMapping, NsPriceLevel, NsField } from './types'

interface PriceLevelSelectorProps {
  mapping: FieldMapping
  nsPriceLevels: NsPriceLevel[]
  nsFields: NsField[]
  onUpdate: (updates: Partial<FieldMapping>) => void
  onUpdateSpecialDialog: (mapping: FieldMapping) => void
}

export default function PriceLevelSelector({
  mapping,
  nsPriceLevels,
  nsFields,
  onUpdate,
  onUpdateSpecialDialog,
}: PriceLevelSelectorProps) {
  const config = mapping.specialConfig as Record<string, unknown> | null

  if (mapping.shopifyField === 'price' || mapping.shopifyField === 'compare_at_price') {
    return (
      <div>
        <label className="text-sm font-medium text-slate-600 block mb-2">
          Map price from the following price level
        </label>
        <Select
          value={String(config?.priceLevelId || '')}
          onValueChange={(val) => {
            const pl = nsPriceLevels.find((p) => p.id === parseInt(val))
            const newConfig = {
              ...(mapping.specialConfig || {}),
              priceLevelId: parseInt(val),
              priceLevelName: pl?.name || null,
            }
            onUpdate({ specialConfig: newConfig })
            onUpdateSpecialDialog({ ...mapping, specialConfig: newConfig })
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
    )
  }

  if (mapping.shopifyField === 'collections') {
    return (
      <div>
        <label className="text-sm font-medium text-slate-600 block mb-2">
          NetSuite field for category/collection
        </label>
        <Select
          value={String(config?.categoryField || '')}
          onValueChange={(val) => {
            const newConfig = {
              ...(mapping.specialConfig || {}),
              categoryField: val,
            }
            onUpdate({ specialConfig: newConfig })
            onUpdateSpecialDialog({ ...mapping, specialConfig: newConfig })
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
    )
  }

  return null
}
