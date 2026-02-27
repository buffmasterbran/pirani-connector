'use client'

import { useState, useEffect } from 'react'
import { useAccountContext } from '@/lib/account-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Settings, Store, Loader2, ChevronDown } from 'lucide-react'

export function AccountHeader() {
  const { accounts, activeAccountId, setActiveAccountId, refreshAccounts, loading } = useAccountContext()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formStoreName, setFormStoreName] = useState('')
  const [formStoreLabel, setFormStoreLabel] = useState('')
  const [formDomain, setFormDomain] = useState('')
  const [formToken, setFormToken] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [oauthConfigured, setOauthConfigured] = useState(false)
  const [connectShop, setConnectShop] = useState('')

  useEffect(() => {
    fetch('/api/shopify/oauth/status')
      .then((r) => r.json())
      .then((d) => setOauthConfigured(d.configured === true))
      .catch(() => setOauthConfigured(false))
  }, [])

  const activeAccount = accounts.find((a) => a.id === activeAccountId)
  const displayName = activeAccount?.storeLabel || activeAccount?.storeName || activeAccount?.shopifyDomain || 'No account'

  const openAdd = () => {
    setEditingId(null)
    setFormStoreName('')
    setFormStoreLabel('')
    setFormDomain('')
    setFormToken('')
    setConnectShop('')
    setShowAddDialog(true)
  }

  const startOAuth = () => {
    const shop = connectShop.trim().replace(/^https?:\/\//, '').split('/')[0].split('.')[0] || connectShop.trim()
    if (!shop) {
      alert('Enter your store name (e.g. pirani-life)')
      return
    }
    window.location.href = `/api/shopify/oauth?shop=${encodeURIComponent(shop)}`
  }

  const openSettings = () => {
    setShowSettingsDialog(true)
  }

  const openEdit = (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return
    setEditingId(id)
    setFormStoreName((acc as any).storeName || '')
    setFormStoreLabel((acc as any).storeLabel || '')
    setFormDomain((acc as any).shopifyDomain || '')
    setFormToken('') // Don't prefill token
    setShowAddDialog(true)
  }

  const saveAccount = async () => {
    if (!formStoreName.trim() || !formDomain.trim() || !formToken.trim()) {
      alert('Store name, domain, and access token are required.')
      return
    }
    setSaving(true)
    try {
      const url = editingId
        ? `/api/product-sync/config/stores/${editingId}`
        : '/api/product-sync/config/stores'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { storeName: formStoreName.trim(), storeLabel: formStoreLabel.trim() || null, shopifyDomain: formDomain.trim(), ...(formToken.trim() ? { shopifyAccessToken: formToken.trim() } : {}) }
        : { storeName: formStoreName.trim(), storeLabel: formStoreLabel.trim() || null, shopifyDomain: formDomain.trim(), shopifyAccessToken: formToken.trim(), netsuiteFlagFieldId: 'custitem_fa_shopify_flag01', netsuitePriceLevelId: 1 }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || res.statusText)
      }
      await refreshAccounts()
      setShowAddDialog(false)
    } catch (e: any) {
      alert(e.message || 'Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="h-14 flex items-center justify-end px-4 border-b border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <>
      <header className="h-14 flex items-center justify-end gap-2 px-6 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-slate-500" />
          {accounts.length > 1 ? (
            <Select value={activeAccountId || ''} onValueChange={(v) => setActiveAccountId(v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.storeLabel || acc.storeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : accounts.length === 1 ? (
            <span className="text-sm font-medium text-slate-700">{displayName}</span>
          ) : (
            <span className="text-sm text-slate-500">No account</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={openSettings} title="Account settings">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add account
        </Button>
      </header>

      {/* Add / Edit Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit account' : 'Add account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingId && oauthConfigured && (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <Label className="text-sm font-medium">Connect with Shopify (recommended)</Label>
                  <p className="text-xs text-slate-500">Use your developer app. You’ll be sent to Shopify to approve access.</p>
                  <div className="flex gap-2">
                    <Input
                      value={connectShop}
                      onChange={(e) => setConnectShop(e.target.value)}
                      placeholder="e.g. pirani-life"
                      className="flex-1"
                    />
                    <Button type="button" variant="default" onClick={startOAuth}>
                      Connect store
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-slate-500">Or add manually</span>
                  </div>
                </div>
              </>
            )}
            <div>
              <Label>Store name</Label>
              <Input
                value={formStoreName}
                onChange={(e) => setFormStoreName(e.target.value)}
                placeholder="e.g. Pirani DTC"
              />
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input
                value={formStoreLabel}
                onChange={(e) => setFormStoreLabel(e.target.value)}
                placeholder="e.g. Shopify DTC"
              />
            </div>
            <div>
              <Label>Shopify domain</Label>
              <Input
                value={formDomain}
                onChange={(e) => setFormDomain(e.target.value)}
                placeholder="mystore.myshopify.com"
                disabled={!!editingId}
              />
              {editingId && <p className="text-xs text-slate-500 mt-1">Domain cannot be changed.</p>}
            </div>
            <div>
              <Label>Shopify Admin API access token {editingId && '(leave blank to keep current)'}</Label>
              <Input
                type="password"
                value={formToken}
                onChange={(e) => setFormToken(e.target.value)}
                placeholder="shpat_..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={saveAccount} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? 'Save changes' : 'Add account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings: list accounts, edit/delete */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accounts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {accounts.length === 0 ? (
              <p className="text-sm text-slate-500">No accounts yet. Add one to get started.</p>
            ) : (
              accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-800">{acc.storeLabel || acc.storeName}</p>
                    <p className="text-xs text-slate-500">{acc.shopifyDomain}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setShowSettingsDialog(false); openEdit(acc.id); }}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!confirm(`Remove "${acc.storeLabel || acc.storeName}"? This will remove Product Sync data for this store.`)) return
                        await fetch(`/api/product-sync/config/stores/${acc.id}`, { method: 'DELETE' })
                        await refreshAccounts()
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Close</Button>
            <Button onClick={() => { setShowSettingsDialog(false); openAdd(); }}>Add account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
