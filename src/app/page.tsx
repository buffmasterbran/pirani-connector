'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { useAccountContext } from '@/lib/account-context'
import { AccountHeader } from '@/components/AccountHeader'
import ProductSyncView from '@/app/product-sync/ProductSyncView'
import ScriptTestingView from '@/app/script-testing/ScriptTestingView'
import { HelpSection } from '@/app/sections/HelpSection'
import { OverviewSection } from '@/app/sections/OverviewSection'
import { CustomersSection } from '@/app/sections/CustomersSection'
import { AddressesSection } from '@/app/sections/AddressesSection'
import { OrdersSection } from '@/app/sections/OrdersSection'
import { PayoutsSection } from '@/app/sections/PayoutsSection'
import { SettingsSection } from '@/app/sections/SettingsSection'
import { MappingsSection } from '@/app/sections/MappingsSection'

export default function Home() {
  const searchParams = useSearchParams()
  const { refreshAccounts } = useAccountContext()
  const [activeSection, setActiveSection] = useState('orders')
  const [showShopifyConnectedBanner, setShowShopifyConnectedBanner] = useState(false)
  const [hideSensitiveData, setHideSensitiveData] = useState(false)

  // After OAuth callback: refresh accounts and show success banner
  useEffect(() => {
    if (searchParams.get('shopify_connected') === '1') {
      refreshAccounts()
      setShowShopifyConnectedBanner(true)
      const t = setTimeout(() => setShowShopifyConnectedBanner(false), 8000)
      return () => clearTimeout(t)
    }
  }, [searchParams, refreshAccounts])

  // Open section from URL params (e.g., ?section=product-sync)
  useEffect(() => {
    const section = searchParams.get('section')
    if (section) {
      setActiveSection(section)
    }
  }, [searchParams])

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection />
      case 'orders':
        return <OrdersSection />
      case 'help':
        return <HelpSection />
      case 'payouts':
        return <PayoutsSection />
      case 'customers':
        return <CustomersSection />
      case 'addresses':
        return <AddressesSection />
      case 'products':
      case 'product-sync':
        return <ProductSyncView />
      case 'script-testing':
        return <ScriptTestingView />
      case 'settings':
        return (
          <SettingsSection
            hideSensitiveData={hideSensitiveData}
            onToggleSensitiveData={() => setHideSensitiveData(!hideSensitiveData)}
          />
        )
      case 'mappings-orders':
      case 'mappings-customers':
      case 'mappings-products':
      case 'mappings-fulfillments':
      case 'mappings-payouts':
      case 'mappings-other':
        return <MappingsSection activeSubSection={activeSection} />
      default:
        return <PayoutsSection />
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="flex-1 flex flex-col min-w-0">
        <AccountHeader />
        {showShopifyConnectedBanner && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-sm text-emerald-800 flex items-center justify-between">
            <span>Store connected. You can switch to it in the account menu (top right).</span>
            <button type="button" onClick={() => setShowShopifyConnectedBanner(false)} className="text-emerald-600 hover:text-emerald-800">Dismiss</button>
          </div>
        )}
        <div className="flex-1 p-8 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
