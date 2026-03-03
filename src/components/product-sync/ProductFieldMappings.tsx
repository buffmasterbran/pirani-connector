'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Save,
  RefreshCw,
  Loader2,
  TestTube,
  Search,
  AlertCircle,
} from 'lucide-react'
import { useFieldMappings } from './useFieldMappings'
import FieldMappingTable from './FieldMappingTable'
import LocationMappingSection from './LocationMappingSection'
import PriceLevelSelector from './PriceLevelSelector'

export default function ProductFieldMappings() {
  const fm = useFieldMappings()

  return (
    <div className="space-y-6">
      {/* Header / Action Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Product Mappings</h2>
          <p className="text-slate-500 text-sm mt-1">
            Configure how NetSuite item fields map to Shopify product fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fm.fetchData()} disabled={fm.loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${fm.loading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button variant="outline" size="sm" onClick={() => fm.setShowTestDialog(true)} disabled={fm.loading}>
            <TestTube className="h-4 w-4 mr-1" />
            Test Mappings
          </Button>
          {fm.hasChanges && (
            <Button variant="outline" size="sm" onClick={() => fm.fetchData()}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={fm.handleSave} disabled={fm.saving || !fm.hasChanges || fm.loading}>
            {fm.saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
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
                onClick={() => fm.setSyncType('price_qty')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  fm.syncType === 'price_qty'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Price and Quantity only
              </button>
              <button
                onClick={() => fm.setSyncType('full')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  fm.syncType === 'full'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Full product
              </button>
            </div>
            {fm.fieldLoadError && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" /> {fm.fieldLoadError}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mapping Table */}
      <Card>
        <CardContent className="p-0">
          <FieldMappingTable
            mappings={fm.mappings}
            visibleFlagFields={fm.visibleFlagFields}
            visibleRequired={fm.visibleRequired}
            visibleOptional={fm.visibleOptional}
            visibleMappings={fm.visibleMappings}
            stores={fm.stores}
            filteredNsFields={fm.filteredNsFields}
            nsFieldSearch={fm.nsFieldSearch}
            setNsFieldSearch={fm.setNsFieldSearch}
            loading={fm.loading}
            syncType={fm.syncType}
            updateMapping={fm.updateMapping}
            deleteMapping={fm.deleteMapping}
            ensureNsFields={fm.ensureNsFields}
            ensurePriceLevels={fm.ensurePriceLevels}
            ensureInventoryData={fm.ensureInventoryData}
            fetchShopifyLocationsForStores={fm.fetchShopifyLocationsForStores}
            getSpecialSummary={fm.getSpecialSummary}
            setShowSpecialDialog={fm.setShowSpecialDialog}
            setShowAddDialog={fm.setShowAddDialog}
          />
        </CardContent>
      </Card>

      {/* Add Mapping Dialog */}
      <Dialog open={fm.showAddDialog} onOpenChange={fm.setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Field Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['required', 'standard', 'uncommon'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => fm.setAddCategory(cat)}
                  className={`flex-1 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    fm.addCategory === cat
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {fm.availableFieldsToAdd()[fm.addCategory]?.map((field) => (
                <button
                  key={field.id}
                  onClick={() => fm.addMapping(field.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <div className="text-sm font-medium text-slate-700">{field.label}</div>
                  <div className="text-xs text-slate-400">{field.description}</div>
                </button>
              )) || (
                <div className="py-4 text-center text-sm text-slate-400">All fields in this category are already mapped</div>
              )}
              {fm.availableFieldsToAdd()[fm.addCategory]?.length === 0 && (
                <div className="py-4 text-center text-sm text-slate-400">All fields in this category are already mapped</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Special Mapping Dialog */}
      <Dialog open={!!fm.showSpecialDialog} onOpenChange={() => fm.setShowSpecialDialog(null)}>
        <DialogContent className={fm.showSpecialDialog?.shopifyField === 'inventory_quantity' ? 'max-w-lg' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>
              Configure: {fm.showSpecialDialog?.shopifyField === 'price' ? 'Price' :
                fm.showSpecialDialog?.shopifyField === 'compare_at_price' ? 'Compare at Price' :
                fm.showSpecialDialog?.shopifyField === 'inventory_quantity' ? 'Inventory Quantity' :
                fm.showSpecialDialog?.shopifyField === 'collections' ? 'Collections / Category' :
                fm.showSpecialDialog?.shopifyField}
            </DialogTitle>
          </DialogHeader>
          {fm.showSpecialDialog && (
            <div className="space-y-4">
              {/* Price / Compare at Price / Collections */}
              {(fm.showSpecialDialog.shopifyField === 'price' ||
                fm.showSpecialDialog.shopifyField === 'compare_at_price' ||
                fm.showSpecialDialog.shopifyField === 'collections') && (
                <PriceLevelSelector
                  mapping={fm.showSpecialDialog}
                  nsPriceLevels={fm.nsPriceLevels}
                  nsFields={fm.nsFields}
                  onUpdate={(updates) => {
                    const idx = fm.mappings.indexOf(fm.showSpecialDialog!)
                    if (idx >= 0) fm.updateMapping(idx, updates)
                  }}
                  onUpdateSpecialDialog={fm.setShowSpecialDialog}
                />
              )}

              {/* Inventory Quantity */}
              {fm.showSpecialDialog.shopifyField === 'inventory_quantity' && (
                <LocationMappingSection
                  stores={fm.stores}
                  nsLocations={fm.nsLocations}
                  shopifyLocations={fm.shopifyLocations}
                  locationMappings={fm.locationMappings}
                  locationMappingsLoading={fm.locationMappingsLoading}
                  addLocationMapping={fm.addLocationMapping}
                  deleteLocationMapping={fm.deleteLocationMapping}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => fm.setShowSpecialDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Mappings Dialog */}
      <Dialog open={fm.showTestDialog} onOpenChange={fm.setShowTestDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Product Mappings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter NetSuite Item Internal ID..."
                value={fm.testItemId}
                onChange={(e) => fm.setTestItemId(e.target.value)}
              />
              <Button onClick={fm.handleTestMappings} disabled={fm.testLoading || !fm.testItemId.trim()}>
                {fm.testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {fm.testResults && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Shopify Field</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Resolved Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(fm.testResults).map(([field, value]) => (
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
