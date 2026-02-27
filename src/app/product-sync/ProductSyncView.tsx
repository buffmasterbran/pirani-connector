'use client'

import { useStoreContext } from '@/lib/product-sync/store-context'
import { Package, Loader2 } from 'lucide-react'
import ProductsTab from './products-tab'

export default function ProductSyncView() {
  const { stores, activeStore, setActiveStoreId, loading } = useStoreContext()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-600 flex items-center justify-center">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Products</h2>
            <p className="text-sm text-slate-500">NetSuite → Shopify product sync</p>
          </div>
        </div>
      </div>

      {/* Store Tabs */}
      {stores.length > 1 && (
        <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => setActiveStoreId(store.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeStore?.id === store.id
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {store.storeLabel || store.storeName}
            </button>
          ))}
        </div>
      )}

      <ProductsTab />
    </div>
  )
}
