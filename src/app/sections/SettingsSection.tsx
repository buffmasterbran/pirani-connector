'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Settings, Eye, EyeOff, Database, HelpCircle, Save, ToggleLeft, ToggleRight } from 'lucide-react'

interface SettingsSectionProps {
  hideSensitiveData: boolean
  onToggleSensitiveData: () => void
}

interface TransactionHint {
  id: number
  code: string
  label: string
  message: string
  icon: string
  bgColor: string
  textColor: string
  sortOrder: number
  isActive: boolean
}

export function SettingsSection({ hideSensitiveData, onToggleSensitiveData }: SettingsSectionProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState('General')

  // Helper Tips state
  const [hints, setHints] = useState<TransactionHint[]>([])
  const [hintsLoading, setHintsLoading] = useState(false)
  const [editingHint, setEditingHint] = useState<number | null>(null)
  const [editValues, setEditValues] = useState<Partial<TransactionHint>>({})
  const [savingHint, setSavingHint] = useState<number | null>(null)

  const fetchHints = useCallback(async () => {
    setHintsLoading(true)
    try {
      const res = await fetch('/api/transaction-hints')
      const data = await res.json()
      if (data.success) setHints(data.data)
    } catch (error) {
      console.error('Error fetching hints:', error)
    } finally {
      setHintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeSettingsTab === 'Helper Tips') {
      fetchHints()
    }
  }, [activeSettingsTab, fetchHints])

  const handleSaveHint = async (hint: TransactionHint) => {
    setSavingHint(hint.id)
    try {
      const res = await fetch('/api/transaction-hints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hint.id, ...editValues }),
      })
      const data = await res.json()
      if (data.success) {
        setHints(prev => prev.map(h => h.id === hint.id ? data.data : h))
        setEditingHint(null)
        setEditValues({})
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      alert(`Error saving hint: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setSavingHint(null)
    }
  }

  const handleToggleHint = async (hint: TransactionHint) => {
    setSavingHint(hint.id)
    try {
      const res = await fetch('/api/transaction-hints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hint.id, isActive: !hint.isActive }),
      })
      const data = await res.json()
      if (data.success) {
        setHints(prev => prev.map(h => h.id === hint.id ? data.data : h))
      }
    } catch (error) {
      console.error('Error toggling hint:', error)
    } finally {
      setSavingHint(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Settings</h2>
        <p className="text-slate-600">Configure your Shopify and NetSuite integration settings.</p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex space-x-1 border-b">
        {['General', 'Helper Tips', 'Field Discovery'].map((tab) => (
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

      {/* Helper Tips Tab */}
      {activeSettingsTab === 'Helper Tips' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Transaction Helper Tips
            </CardTitle>
            <p className="text-sm text-slate-600">
              Configure the contextual help messages shown under each transaction when the Help toggle is enabled.
              Use <code className="bg-slate-100 px-1 rounded">{'{reason}'}</code> in the Adjustment hint to include the adjustment reason dynamically.
            </p>
          </CardHeader>
          <CardContent>
            {hintsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {hints.map((hint) => {
                  const isEditing = editingHint === hint.id
                  return (
                    <div
                      key={hint.id}
                      className={`border rounded-lg p-4 ${hint.isActive ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">{hint.code}</code>
                            <span className="text-sm font-medium text-slate-800">{hint.label}</span>
                          </div>

                          {/* Preview */}
                          <div className={`${hint.bgColor} rounded px-3 py-1.5 mb-2`}>
                            <span className={`text-xs ${hint.textColor}`}>
                              {isEditing ? (editValues.icon ?? hint.icon) : hint.icon}{' '}
                              {isEditing ? (editValues.message ?? hint.message) : hint.message}
                            </span>
                          </div>

                          {/* Edit form */}
                          {isEditing && (
                            <div className="space-y-2 mt-3">
                              <div>
                                <label className="text-xs font-medium text-slate-600">Message</label>
                                <textarea
                                  className="w-full mt-1 p-2 border rounded text-sm resize-none"
                                  rows={2}
                                  value={editValues.message ?? hint.message}
                                  onChange={(e) => setEditValues(prev => ({ ...prev, message: e.target.value }))}
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Icon</label>
                                  <Input
                                    className="mt-1 text-sm"
                                    value={editValues.icon ?? hint.icon}
                                    onChange={(e) => setEditValues(prev => ({ ...prev, icon: e.target.value }))}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Background</label>
                                  <Input
                                    className="mt-1 text-sm font-mono"
                                    value={editValues.bgColor ?? hint.bgColor}
                                    onChange={(e) => setEditValues(prev => ({ ...prev, bgColor: e.target.value }))}
                                    placeholder="bg-blue-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Text Color</label>
                                  <Input
                                    className="mt-1 text-sm font-mono"
                                    value={editValues.textColor ?? hint.textColor}
                                    onChange={(e) => setEditValues(prev => ({ ...prev, textColor: e.target.value }))}
                                    placeholder="text-blue-700"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveHint(hint)}
                                  disabled={savingHint === hint.id}
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  {savingHint === hint.id ? 'Saving...' : 'Save'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setEditingHint(null); setEditValues({}) }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {!isEditing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setEditingHint(hint.id); setEditValues({}) }}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleHint(hint)}
                            disabled={savingHint === hint.id}
                            title={hint.isActive ? 'Disable this hint' : 'Enable this hint'}
                            className={hint.isActive ? 'text-green-600' : 'text-slate-400'}
                          >
                            {hint.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
    </div>
  )
}
