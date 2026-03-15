'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Settings, Eye, EyeOff, Database, MapPin, Trash2 } from 'lucide-react'

interface SettingsSectionProps {
  hideSensitiveData: boolean
  onToggleSensitiveData: () => void
}

export function SettingsSection({ hideSensitiveData, onToggleSensitiveData }: SettingsSectionProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState('General')

  // Order source mappings state
  const [orderSourceMappings, setOrderSourceMappings] = useState<Array<{
    id: number
    appId: number | null
    sourceName: string | null
    isTaxable: boolean
    friendlyName: string
    isActive: boolean
  }>>([])

  // Order source mapping edit dialog state
  const [orderSourceMappingEditDialog, setOrderSourceMappingEditDialog] = useState<{
    isOpen: boolean
    mapping: {
      id: number
      appId: number | null
      sourceName: string | null
      friendlyName: string
      isTaxable: boolean
      isActive: boolean
    } | null
  }>({
    isOpen: false,
    mapping: null
  })

  // Local delete confirm dialog state
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    isOpen: boolean
    mappingId: number
    mappingName: string
  }>({
    isOpen: false,
    mappingId: 0,
    mappingName: ''
  })

  const fetchOrderSourceMappings = async () => {
    try {
      const response = await fetch('/api/mappings/order-source-mappings')
      const result = await response.json()
      if (result.success && result.data) {
        setOrderSourceMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching order source mappings:', error)
    }
  }

  const handleAddOrderSourceMapping = () => {
    setOrderSourceMappingEditDialog({
      isOpen: true,
      mapping: {
        id: 0,
        isTaxable: true,
        appId: null,
        sourceName: null,
        friendlyName: '',
        isActive: true
      }
    })
  }

  const handleEditOrderSourceMapping = (mapping: {
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isTaxable: boolean
    isActive: boolean
  }) => {
    setOrderSourceMappingEditDialog({
      isOpen: true,
      mapping: { ...mapping }
    })
  }

  const handleSaveOrderSourceMapping = async (mapping: {
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isTaxable: boolean
    isActive: boolean
  }) => {
    try {
      if (mapping.id === 0) {
        // Create new mapping
        const response = await fetch('/api/mappings/order-source-mappings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isTaxable: mapping.isTaxable,
            isActive: mapping.isActive,
          }),
        })

        const result = await response.json()

        if (result.success) {
          await fetchOrderSourceMappings()
          setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
        } else {
          alert(`Error creating order source mapping: ${result.error || 'Unknown error'}`)
        }
      } else {
        // Update existing mapping
        const response = await fetch(`/api/mappings/order-source-mappings/${mapping.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isTaxable: mapping.isTaxable,
            isActive: mapping.isActive,
          }),
        })

        const result = await response.json()

        if (result.success) {
          await fetchOrderSourceMappings()
          setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
        } else {
          alert(`Error updating order source mapping: ${result.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error saving order source mapping:', error)
      alert(`Error saving order source mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDeleteOrderSourceMapping = async (mappingId: number) => {
    try {
      const response = await fetch(`/api/mappings/order-source-mappings/${mappingId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        await fetchOrderSourceMappings()
        setDeleteConfirmDialog({ isOpen: false, mappingId: 0, mappingName: '' })
      } else {
        alert(`Error deleting order source mapping: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting order source mapping:', error)
      alert(`Error deleting order source mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openDeleteConfirmDialog = (mappingName: string, mappingId: number) => {
    setDeleteConfirmDialog({
      isOpen: true,
      mappingId,
      mappingName
    })
  }

  const confirmDelete = async () => {
    await handleDeleteOrderSourceMapping(deleteConfirmDialog.mappingId)
  }

  useEffect(() => {
    fetchOrderSourceMappings()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Settings</h2>
        <p className="text-slate-600">Configure your Shopify and NetSuite integration settings.</p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex space-x-1 border-b">
        {['General', 'Order Source Mappings', 'Field Discovery'].map((tab) => (
          <Button
            key={tab}
            variant="ghost"
            onClick={() => setActiveSettingsTab(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === activeSettingsTab
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* General Settings Tab */}
      {activeSettingsTab === 'General' && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Shopify Store URL</label>
              <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                https://pirani-life.myshopify.com
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Shopify Access Token</label>
              <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                ***configured***
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Shopify API Version</label>
              <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                2025-10
              </div>
            </div>

            {/* Privacy Settings */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Privacy Settings</label>
                  <p className="text-xs text-muted-foreground">Hide sensitive data in payout displays</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleSensitiveData}
                  className="flex items-center gap-2"
                >
                  {hideSensitiveData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {hideSensitiveData ? 'Show' : 'Hide'} Data
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Order Source Mappings Tab */}
      {activeSettingsTab === 'Order Source Mappings' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Order Source Mappings
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Map Shopify order sources to display names and tax settings. Orders from unmapped sources cannot be pushed to NetSuite.
              </p>
            </div>
            <Button onClick={handleAddOrderSourceMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
              Add Mapping
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Tax info banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-amber-900 mb-1">How &quot;Taxable in NS&quot; affects payouts</h4>
                <ul className="text-sm text-amber-800 space-y-1 list-disc pl-4">
                  <li><strong>Taxable = Yes</strong> (e.g., your Shopify store): NetSuite calculates tax on the cash sale. No tax adjustments appear in the payout. Use this for direct sales where you collect and remit tax.</li>
                  <li><strong>Taxable = No</strong> (e.g., Shop App, Facebook): Shopify/marketplace collects and remits tax. The cash sale in NS should have no tax. Tax deductions appear as &quot;tax_adjustment&quot; debits in the payout and should be mapped to a marketplace tax GL account in your payout deposit settings.</li>
                </ul>
              </div>

              {/* Order Source Mappings Table */}
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">App ID</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Source Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Friendly Name</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Taxable in NS</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Active</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {orderSourceMappings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          No order source mappings found. Click &quot;Add Mapping&quot; to create one.
                        </td>
                      </tr>
                    ) : (
                      orderSourceMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td className="px-4 py-3 text-sm text-slate-900 font-mono">
                            {mapping.appId ?? '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {mapping.sourceName ?? '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {mapping.friendlyName}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              mapping.isTaxable
                                ? 'bg-green-100 text-green-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {mapping.isTaxable ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              mapping.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {mapping.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditOrderSourceMapping(mapping)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteConfirmDialog(mapping.friendlyName, mapping.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Discovery Tab */}
      {activeSettingsTab === 'Field Discovery' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                NetSuite Field Discovery
              </CardTitle>
              <p className="text-sm text-slate-600">
                Discover and map NetSuite field IDs to human-readable names. This helps complete your mapping configuration.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">

                {/* Payment Methods Discovery */}
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Payment Methods</h4>
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Unknown Payment Method IDs</label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 177</span>
                            <span className="text-green-600 text-sm">Shopify Payments (mapped)</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 228</span>
                            <span className="text-green-600 text-sm">Visa/Mastercard/Amex (mapped)</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">NetSuite API Endpoint</label>
                        <div className="mt-2 p-3 bg-white rounded border font-mono text-sm">
                          GET /record/v1/paymentmethod
                        </div>
                        <Button className="mt-2 w-full" size="sm">
                          <Database className="h-4 w-4 mr-2" />
                          Fetch Payment Methods
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Methods Discovery */}
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Shipping Methods</h4>
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Unknown Shipping Method IDs</label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 293</span>
                            <span className="text-green-600 text-sm">Free Shipping (mapped)</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 288</span>
                            <span className="text-green-600 text-sm">Standard Shipping (mapped)</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 1035</span>
                            <span className="text-green-600 text-sm">Local Pickup (mapped)</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">NetSuite API Endpoint</label>
                        <div className="mt-2 p-3 bg-white rounded border font-mono text-sm">
                          GET /record/v1/shippingitem
                        </div>
                        <Button className="mt-2 w-full" size="sm">
                          <Database className="h-4 w-4 mr-2" />
                          Fetch Shipping Methods
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Other Fields Discovery */}
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Other NetSuite Fields</h4>
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Location Fields</label>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between p-3 bg-white rounded border">
                            <span className="font-mono text-sm">ID: 1</span>
                            <span className="text-green-600 text-sm">Default Location (mapped)</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Location ID 1 is correctly mapped to &quot;Default Location&quot;
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">NetSuite API Endpoints</label>
                        <div className="mt-2 space-y-2">
                          <div className="p-2 bg-white rounded border font-mono text-xs">
                            GET /record/v1/location
                          </div>
                          <div className="p-2 bg-white rounded border font-mono text-xs">
                            GET /record/v1/classification
                          </div>
                          <div className="p-2 bg-white rounded border font-mono text-xs">
                            GET /record/v1/partner
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Field Mapping Tool */}
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">Manual Field Mapping</h4>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-800 mb-3">
                      Use this tool to manually map unknown field IDs to human-readable names:
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium">Field Type</label>
                        <div className="mt-1 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                          Select component temporarily disabled
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">NetSuite ID</label>
                        <Input placeholder="e.g., 177" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Human Name</label>
                        <Input placeholder="e.g., Visa" className="mt-1" />
                      </div>
                    </div>
                    <Button className="mt-3 w-full" size="sm">
                      <Database className="h-4 w-4 mr-2" />
                      Add Mapping
                    </Button>
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit/Create Order Source Mapping Dialog */}
      <Dialog open={orderSourceMappingEditDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {orderSourceMappingEditDialog.mapping?.id === 0 ? 'Create' : 'Edit'} Order Source Mapping
            </DialogTitle>
          </DialogHeader>
          {orderSourceMappingEditDialog.mapping && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  App ID (optional)
                </label>
                <Input
                  type="number"
                  value={orderSourceMappingEditDialog.mapping.appId || ''}
                  onChange={(e) => setOrderSourceMappingEditDialog({
                    ...orderSourceMappingEditDialog,
                    mapping: {
                      ...orderSourceMappingEditDialog.mapping!,
                      appId: e.target.value ? Number(e.target.value) : null,
                      sourceName: e.target.value ? null : orderSourceMappingEditDialog.mapping!.sourceName
                    }
                  })}
                  placeholder="e.g., 2329312, 3890849"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Shopify app_id (e.g., 2329312 for Facebook, 3890849 for Shop App)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Source Name (optional)
                </label>
                <Input
                  value={orderSourceMappingEditDialog.mapping.sourceName || ''}
                  onChange={(e) => setOrderSourceMappingEditDialog({
                    ...orderSourceMappingEditDialog,
                    mapping: {
                      ...orderSourceMappingEditDialog.mapping!,
                      sourceName: e.target.value || null,
                      appId: e.target.value ? null : orderSourceMappingEditDialog.mapping!.appId
                    }
                  })}
                  placeholder="e.g., web, checkout"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Shopify source_name (e.g., &apos;web&apos;, &apos;checkout&apos;). Either App ID or Source Name must be provided.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Friendly Name *
                </label>
                <Input
                  value={orderSourceMappingEditDialog.mapping.friendlyName}
                  onChange={(e) => setOrderSourceMappingEditDialog({
                    ...orderSourceMappingEditDialog,
                    mapping: {
                      ...orderSourceMappingEditDialog.mapping!,
                      friendlyName: e.target.value
                    }
                  })}
                  placeholder="e.g., Facebook, Shop App, Web"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Display name shown in the transactions table
                </p>
              </div>
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={orderSourceMappingEditDialog.mapping.isTaxable}
                    onChange={(e) => setOrderSourceMappingEditDialog({
                      ...orderSourceMappingEditDialog,
                      mapping: {
                        ...orderSourceMappingEditDialog.mapping!,
                        isTaxable: e.target.checked
                      }
                    })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm font-medium text-slate-700">
                    Taxable in NetSuite
                  </label>
                </div>
                <p className="text-xs text-slate-500 pl-6">
                  {orderSourceMappingEditDialog.mapping.isTaxable
                    ? 'NetSuite will calculate tax on the cash sale. Use for direct sales (your Shopify store).'
                    : 'NetSuite will NOT calculate tax. Use for marketplace orders where Shopify collects and remits tax (Shop App, Facebook, TikTok). Tax adjustments will appear in the payout.'}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={orderSourceMappingEditDialog.mapping.isActive}
                  onChange={(e) => setOrderSourceMappingEditDialog({
                    ...orderSourceMappingEditDialog,
                    mapping: {
                      ...orderSourceMappingEditDialog.mapping!,
                      isActive: e.target.checked
                    }
                  })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium text-slate-700">
                  Active
                </label>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleSaveOrderSourceMapping(orderSourceMappingEditDialog.mapping!)}
                >
                  {orderSourceMappingEditDialog.mapping.id === 0 ? 'Create' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteConfirmDialog({ isOpen: false, mappingId: 0, mappingName: '' })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to delete the order source mapping &quot;{deleteConfirmDialog.mappingName}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmDialog({ isOpen: false, mappingId: 0, mappingName: '' })}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
