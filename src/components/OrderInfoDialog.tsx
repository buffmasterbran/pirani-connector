'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader } from '@/components/Loader'
import { Package, User, MapPin, CreditCard, Calendar } from 'lucide-react'
import { safeToLocaleDateString } from '@/lib/dateUtils'

interface OrderInfoDialogProps {
  isOpen: boolean
  onClose: () => void
  orderId: string | null
  order: any | null
  isLoading: boolean
  hideSensitiveData: boolean
}

export function OrderInfoDialog({ 
  isOpen, 
  onClose, 
  orderId, 
  order, 
  isLoading, 
  hideSensitiveData 
}: OrderInfoDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order #{orderId}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader />
          </div>
        ) : order ? (
          <div className="space-y-6">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p className={`font-semibold ${
                      order.financial_status === 'paid' ? 'text-green-600' : 
                      order.financial_status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {order.financial_status}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total</label>
                    <p className="font-semibold">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.currency} ${Number(order.total_price).toFixed(2)}`
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Date</label>
                    <p className="font-semibold">
                      {safeToLocaleDateString(order.created_at)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Items</label>
                    <p className="font-semibold">{order.line_items?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Information */}
            {order.customer && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Name</label>
                      <p className="font-semibold">
                        {hideSensitiveData ? (
                          <span className="text-gray-500">••••••</span>
                        ) : (
                          `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Guest'
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email</label>
                      <p className="font-semibold">
                        {hideSensitiveData ? (
                          <span className="text-gray-500">••••••</span>
                        ) : (
                          order.customer.email || 'N/A'
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Shipping Address */}
            {order.shipping_address && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5" />
                    Shipping Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim()
                      )}
                    </p>
                    <p>
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        order.shipping_address.address1
                      )}
                    </p>
                    {order.shipping_address.address2 && (
                      <p>
                        {hideSensitiveData ? (
                          <span className="text-gray-500">••••••</span>
                        ) : (
                          order.shipping_address.address2
                        )}
                      </p>
                    )}
                    <p>
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}`
                      )}
                    </p>
                    <p>
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        order.shipping_address.country
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Order Items */}
            {order.line_items && order.line_items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {order.line_items.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-sm text-muted-foreground">
                            SKU: {item.sku || 'N/A'} • Qty: {item.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {hideSensitiveData ? (
                              <span className="text-gray-500">••••••</span>
                            ) : (
                              `${order.currency} ${Number(item.price).toFixed(2)}`
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5" />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Subtotal</label>
                    <p className="font-semibold">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.currency} ${Number(order.subtotal_price).toFixed(2)}`
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tax</label>
                    <p className="font-semibold">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.currency} ${Number(order.total_tax).toFixed(2)}`
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Shipping</label>
                    <p className="font-semibold">
                      {hideSensitiveData ? (
                        <span className="text-gray-500">••••••</span>
                      ) : (
                        `${order.currency} ${Number(order.shipping_lines?.[0]?.price || 0).toFixed(2)}`
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No order information available
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
