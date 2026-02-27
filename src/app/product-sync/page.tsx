'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Standalone /product-sync redirects into the main Pirani Connector
 * with the Product Sync section active.
 */
export default function ProductSyncRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/?section=product-sync')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Redirecting to Product Sync...</p>
      </div>
    </div>
  )
}
