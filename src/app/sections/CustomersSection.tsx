'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'

export function CustomersSection() {
  const [customers, setCustomers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null)

  const fetchCustomers = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/customers')
      if (!res.ok) throw new Error('Failed to load customers')
      const data = await res.json()
      setCustomers(data.customers || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const filteredCustomers = customers.filter((customer) => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      customer.email?.toLowerCase().includes(search) ||
      customer.firstName?.toLowerCase().includes(search) ||
      customer.lastName?.toLowerCase().includes(search) ||
      customer.shopifyCustomerId?.toLowerCase().includes(search) ||
      customer.netsuiteCustomerId?.toLowerCase().includes(search)
    )
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <p className="text-sm text-muted-foreground">View customer data synced from Shopify and NetSuite.</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <Input
              placeholder="Search by email, name, Shopify ID, or NetSuite ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button onClick={fetchCustomers} disabled={isLoading} variant="outline">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground mb-4">
            {filteredCustomers.length} of {customers.length} customers
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No customers found. Customers will appear here after importing orders.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">
                            {customer.firstName || customer.lastName
                              ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                              : 'Unknown Customer'}
                          </h4>
                          {customer.netsuiteCustomerId && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                              NS: {customer.netsuiteCustomerId}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{customer.email}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{customer.addressCount || 0} Address{customer.addressCount !== 1 ? 'es' : ''}</span>
                          <span>{customer.orderCount || 0} Order{customer.orderCount !== 1 ? 's' : ''}</span>
                          {customer.phone && <span>{customer.phone}</span>}
                        </div>
                        {expandedCustomerId === customer.id && customer.addresses && customer.addresses.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-xs font-medium mb-2">Addresses:</p>
                            <div className="space-y-2">
                              {customer.addresses.map((addr: any) => (
                                <div key={addr.id} className="text-xs bg-slate-50 p-2 rounded">
                                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <Checkbox checked={addr.isDefaultBilling} disabled className="h-3 w-3" />
                                      <span className="text-xs">Billing</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Checkbox checked={addr.isDefaultShipping} disabled className="h-3 w-3" />
                                      <span className="text-xs">Shipping</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Checkbox checked={addr.isSavedAddress} disabled className="h-3 w-3" />
                                      <span className="text-xs">Saved</span>
                                    </div>
                                    {addr.netsuiteAddressId && (
                                      <span className="text-indigo-600">NS: {addr.netsuiteAddressId}</span>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {[addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedCustomerId(expandedCustomerId === customer.id ? null : customer.id)
                        }
                      >
                        {expandedCustomerId === customer.id ? <ChevronUp /> : <ChevronDown />}
                      </Button>
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
