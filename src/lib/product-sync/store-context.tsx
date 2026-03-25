'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface StoreInfo {
  id: string
  storeName: string
  storeLabel: string | null
  shopifyDomain: string
  shopifyApiVersion?: string
  netsuiteFlagFieldId?: string
  netsuitePriceLevelId?: number
  netsuiteComparePriceLevelId?: number | null
  syncEnabled: boolean
  syncIntervalMinutes?: number
  lowStockThreshold?: number
  lowStockIntervalMinutes?: number
  includeNonInventory?: boolean
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

interface StoreContextType {
  stores: StoreInfo[]
  activeStore: StoreInfo | null
  setActiveStoreId: (id: string) => void
  refreshStores: () => Promise<void>
  loading: boolean
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  activeStore: null,
  setActiveStoreId: () => {},
  refreshStores: async () => {},
  loading: true,
})

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshStores = useCallback(async () => {
    try {
      const res = await fetch('/api/product-sync/config/stores')
      const data = await res.json()
      const list = data.stores || (Array.isArray(data) ? data : [])
      setStores(list)
      setActiveStoreId((current) => {
        if (list.length === 0) return null
        if (current && list.some((s: StoreInfo) => s.id === current)) return current
        const saved = typeof window !== 'undefined' ? localStorage.getItem('ps-active-store') : null
        const match = saved ? list.find((s: StoreInfo) => s.id === saved) : null
        return match ? match.id : list[0].id
      })
    } catch (err) {
      console.error('Failed to load stores:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshStores()
  }, [refreshStores])

  useEffect(() => {
    if (activeStoreId && typeof window !== 'undefined') {
      localStorage.setItem('ps-active-store', activeStoreId)
    }
  }, [activeStoreId])

  const activeStore = stores.find((s) => s.id === activeStoreId) || null

  return (
    <StoreContext.Provider
      value={{ stores, activeStore, setActiveStoreId, refreshStores, loading }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStoreContext() {
  return useContext(StoreContext)
}
