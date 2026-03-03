'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'

export function AddressesSection() {
  const [addresses, setAddresses] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [addressTypeFilter, setAddressTypeFilter] = useState('all')
  const [hasNetSuiteIdFilter, setHasNetSuiteIdFilter] = useState('all')

  const fetchAddresses = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (addressTypeFilter !== 'all') params.set('type', addressTypeFilter)
      if (hasNetSuiteIdFilter !== 'all') params.set('hasNetSuiteId', hasNetSuiteIdFilter)
      const res = await fetch(`/api/addresses?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load addresses')
      const data = await res.json()
      setAddresses(data.addresses || [])
    } catch (error) {
      console.error('Error fetching addresses:', error)
    } finally {
      setIsLoading(false)
    }
  }, [addressTypeFilter, hasNetSuiteIdFilter])

  useEffect(() => {
    fetchAddresses()
  }, [fetchAddresses])

  const filteredAddresses = addresses.filter((address) => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      address.address1?.toLowerCase().includes(search) ||
      address.city?.toLowerCase().includes(search) ||
      address.zip?.toLowerCase().includes(search) ||
      address.customer?.email?.toLowerCase().includes(search) ||
      address.netsuiteAddressId?.toLowerCase().includes(search)
    )
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
          <p className="text-sm text-muted-foreground">View customer addresses synced from Shopify and NetSuite.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <Input
              placeholder="Search by address, city, zip, or customer email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[300px]"
            />
            <Select value={addressTypeFilter} onValueChange={setAddressTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Address Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="shipping">Shipping</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="default">Default</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hasNetSuiteIdFilter} onValueChange={setHasNetSuiteIdFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="NetSuite ID" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Has NS ID</SelectItem>
                <SelectItem value="false">Missing NS ID</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={fetchAddresses} disabled={isLoading} variant="outline">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground mb-4">
            {filteredAddresses.length} of {addresses.length} addresses
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredAddresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No addresses found. Addresses will appear here after importing orders.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAddresses.map((address) => (
                <Card key={address.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={address.isDefaultBilling} disabled className="h-4 w-4" />
                            <span className="text-xs font-medium">Default Billing</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox checked={address.isDefaultShipping} disabled className="h-4 w-4" />
                            <span className="text-xs font-medium">Default Shipping</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox checked={address.isSavedAddress} disabled className="h-4 w-4" />
                            <span className="text-xs font-medium">Saved Address</span>
                          </div>
                          {address.netsuiteAddressId && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                              NS: {address.netsuiteAddressId}
                            </span>
                          )}
                          {!address.netsuiteAddressId && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                              No NS ID
                            </span>
                          )}
                        </div>
                        <div className="mb-2">
                          <p className="font-medium">
                            {address.firstName || address.lastName
                              ? `${address.firstName || ''} ${address.lastName || ''}`.trim()
                              : address.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {[address.address1, address.address2, address.city, address.province, address.zip, address.country]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                          {address.phone && <p className="text-xs text-muted-foreground mt-1">{address.phone}</p>}
                        </div>
                        {address.customer && (
                          <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                            Customer: {address.customer.email || `${address.customer.firstName || ''} ${address.customer.lastName || ''}`.trim()}
                            {address.customer.netsuiteCustomerId && (
                              <span className="ml-2">(NS: {address.customer.netsuiteCustomerId})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
