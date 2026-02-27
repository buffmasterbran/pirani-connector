'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useStoreContext } from '@/lib/product-sync/store-context'

export interface AccountInfo {
  id: string
  storeName: string
  storeLabel: string | null
  shopifyDomain: string
  isActive: boolean
}

interface AccountContextType {
  accounts: AccountInfo[]
  activeAccountId: string | null
  setActiveAccountId: (id: string | null) => void
  refreshAccounts: () => Promise<void>
  loading: boolean
}

const AccountContext = createContext<AccountContextType>({
  accounts: [],
  activeAccountId: null,
  setActiveAccountId: () => {},
  refreshAccounts: async () => {},
  loading: true,
})

const STORAGE_KEY = 'pirani-active-account'

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { stores, refreshStores, loading: storesLoading } = useStoreContext()
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null)

  const accounts: AccountInfo[] = useMemo(
    () => stores.map((s) => ({
      id: s.id,
      storeName: s.storeName,
      storeLabel: s.storeLabel ?? null,
      shopifyDomain: s.shopifyDomain,
      isActive: s.isActive !== false,
    })),
    [stores]
  )

  useEffect(() => {
    if (storesLoading || accounts.length === 0) return
    setActiveAccountIdState((current) => {
      if (current && accounts.some((a) => a.id === current)) return current
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      const match = saved ? accounts.find((a) => a.id === saved) : null
      return match ? match.id : accounts[0].id
    })
  }, [accounts, storesLoading])

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0] || null

  return (
    <AccountContext.Provider
      value={{
        accounts,
        activeAccountId: activeAccount?.id ?? null,
        setActiveAccountId: (id) => {
          setActiveAccountIdState(id)
          if (typeof window !== 'undefined') {
            if (id) localStorage.setItem(STORAGE_KEY, id)
            else localStorage.removeItem(STORAGE_KEY)
          }
        },
        refreshAccounts: refreshStores,
        loading: storesLoading,
      }}
    >
      {children}
    </AccountContext.Provider>
  )
}

export function useAccountContext() {
  return useContext(AccountContext)
}
