'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OrderInfoDialog } from '@/components/OrderInfoDialog'
import { Loader, LoaderWithText } from '@/components/Loader'
import { Download, ArrowUpRight, Filter, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Play } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import {
  validateOrderMappings,
  getUnmappedPaymentMethods,
  getUnmappedShipmentMethods,
  type MappingError,
  type PaymentMethodMapping,
  type ShipmentMethodMapping
} from '@/lib/mappingUtils'
import { safeToLocaleDateString } from '@/lib/dateUtils'

interface Order {
  id: string | number
  name: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string | number
  currency: string
  created_at: string
  netsuiteDepositNumber?: string | null
  inDatabase?: boolean
  addedToDatabaseAt?: string
  customer?: {
    first_name?: string
    last_name?: string
    email?: string
  }
  shipping_address?: {
    first_name?: string
    last_name?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    zip?: string
    country?: string
  }
  line_items?: Array<{
    title: string
    sku?: string
    quantity: number
    price: string | number
  }>
}

export function OrdersSection() {
  // Orders state
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [importLimit, setImportLimit] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false)

  // Search state
  const [orderSearchTerm, setOrderSearchTerm] = useState('')
  const [isSearchingOrders, setIsSearchingOrders] = useState(false)
  const [searchedOrders, setSearchedOrders] = useState<Order[]>([])

  // Filter state
  const [isOrderFiltersOpen, setIsOrderFiltersOpen] = useState(false)
  const [orderFilters, setOrderFilters] = useState({
    financialStatus: {
      all: true,
      paid: false,
      pending: false,
      refunded: false
    },
    fulfillmentStatus: {
      all: true,
      fulfilled: false,
      unfulfilled: false
    },
    netsuiteStatus: {
      all: true,
      not_pushed: false,
      pushed: false
    },
    dateRange: {
      all: true,
      recent: false
    }
  })

  // Import controls
  const [orderNameInput, setOrderNameInput] = useState('')
  const [orderRangeStart, setOrderRangeStart] = useState('')
  const [orderRangeEnd, setOrderRangeEnd] = useState('')

  // NetSuite ID dialog state
  const [isNetSuiteIdDialogOpen, setIsNetSuiteIdDialogOpen] = useState(false)
  const [selectedOrderForNetSuite, setSelectedOrderForNetSuite] = useState<Order | null>(null)
  const [netSuiteIdInput, setNetSuiteIdInput] = useState('')

  // Edit NetSuite ID state
  const [isEditNetSuiteIdDialogOpen, setIsEditNetSuiteIdDialogOpen] = useState(false)
  const [editingNetSuiteId, setEditingNetSuiteId] = useState('')
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null)

  // Push Workflow dialog state (3-step: Resolve Customer -> Build Payload -> Push to NetSuite)
  const [pushWorkflow, setPushWorkflow] = useState<{
    isOpen: boolean
    orderId: string | null
    orderName: string | null
    step1: { status: 'idle' | 'loading' | 'success' | 'error'; data?: any; error?: string }
    step2: { status: 'idle' | 'loading' | 'success' | 'error'; data?: any; error?: string }
    step3: { status: 'idle' | 'loading' | 'success' | 'error'; data?: any; error?: string }
  }>({
    isOpen: false,
    orderId: null,
    orderName: null,
    step1: { status: 'idle' },
    step2: { status: 'idle' },
    step3: { status: 'idle' },
  })

  // Mapping error state
  const [mappingErrors, setMappingErrors] = useState<any[]>([])
  const [unmappedPaymentMethods, setUnmappedPaymentMethods] = useState<string[]>([])
  const [unmappedShipmentMethods, setUnmappedShipmentMethods] = useState<string[]>([])

  // Mapping error dialog state
  const [mappingErrorDialog, setMappingErrorDialog] = useState<{
    isOpen: boolean
    orderId: string
    orderName: string
    errors: MappingError[]
  }>({
    isOpen: false,
    orderId: '',
    orderName: '',
    errors: []
  })

  // Mapping data (fetched for validation)
  const [paymentMappings, setPaymentMappings] = useState<PaymentMethodMapping[]>([])
  const [shipmentMappings, setShipmentMappings] = useState<ShipmentMethodMapping[]>([])

  // Sensitive data toggle (local to section)
  const [hideSensitiveData, setHideSensitiveData] = useState(false)

  // --- Data fetching ---

  const fetchSavedOrders = async () => {
    setIsLoadingOrders(true)
    try {
      const response = await fetch('/api/orders')
      const data = await response.json()
      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`Loaded ${fetchedOrders.length} saved orders from database`)

        setOrders(fetchedOrders.slice(0, 100))
      } else {
        console.error('Error fetching saved orders:', data.error)
        setOrders([])
      }
    } catch (error) {
      console.error('Error fetching saved orders:', error)
      setOrders([])
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const fetchPaymentMappings = async () => {
    try {
      const response = await fetch('/api/mappings/payment-methods')
      const result = await response.json()
      if (result.success) {
        setPaymentMappings(result.data.map((m: any) => ({
          id: String(m.id),
          shopifyCode: m.shopifyCode,
          netsuiteId: m.netsuiteId,
          isActive: m.isActive,
        })))
      }
    } catch (error) {
      console.error('Error fetching payment mappings:', error)
    }
  }

  const fetchShipmentMappings = async () => {
    try {
      const response = await fetch('/api/mappings/shipment-methods')
      const result = await response.json()
      if (result.success) {
        setShipmentMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching shipment mappings:', error)
    }
  }

  const fetchOrders = async (fetchAll: boolean = false, maxOrders?: number) => {
    setIsLoadingOrders(true)
    try {
      const importLimit = 4000
      let url = `/api/shopify/orders?limit=${importLimit}`
      if (fetchAll) {
        url = '/api/shopify/orders?all=true'
        if (maxOrders) {
          url += `&limit=${maxOrders}`
        }
      }

      console.log(`${fetchAll ? 'Fetching ALL orders' : 'Fetching recent orders'}...`)
      const response = await fetch(url)
      const data = await response.json()

      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`Fetched ${fetchedOrders.length} orders from Shopify`)

        // Automatically save new orders to database
        await saveNewOrdersOnly(fetchedOrders)

        setOrders(fetchedOrders.slice(0, 100))
      } else {
        console.error('Error fetching orders:', data.error)
        alert(`Error fetching orders: ${data.error}`)
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
      alert('Error fetching orders from Shopify')
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const saveNewOrdersOnly = async (fetchedOrders: Order[]) => {
    try {
      console.log(`Saving new orders to database...`)

      const response = await fetch('/api/orders/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orders: fetchedOrders }),
      })

      const data = await response.json()

      if (response.ok) {
        console.log(`Successfully saved orders to database: imported=${data.imported ?? 0}, updated=${data.updated ?? 0}`)

        // Update orders with database status - only update existing orders, don't replace the entire list
        setOrders(prevOrders => {
          return prevOrders.map(existingOrder => {
            const savedOrder = data.orders.find((saved: any) => saved.id === existingOrder.id)
            return savedOrder || existingOrder
          })
        })

        await fetchSavedOrders()

        // Return the result so callers can check if orders were imported or updated
        return { success: true, imported: data.imported ?? 0, updated: data.updated ?? 0 }
      } else {
        console.error('Failed to save orders to database:', data.error)
        alert(`Failed to save orders to database: ${data.error}`)
        return { success: false, error: data.error }
      }
    } catch (error) {
      console.error('Error saving orders to database:', error)
      alert('Error saving orders to database')
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  const importOrderByName = async () => {
    if (!orderNameInput.trim()) return

    setIsLoadingOrders(true)
    try {
      // Clean the input and try to determine if it's an ID or name
      const input = orderNameInput.trim()

      // If it starts with #, treat it as a name, otherwise treat as ID
      let response
      if (input.startsWith('#')) {
        // Search by name (existing functionality)
        const fullOrderName = input
        response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(fullOrderName)}`)
      } else {
        // Treat as order ID and fetch directly
        response = await fetch(`/api/shopify/orders/${input}`)
      }

      const data = await response.json()

      if (response.ok && data.order) {
        const order = data.order
        console.log(`Fetched order ${order.name} from Shopify`)

        // Save to database
        const saveResult = await saveNewOrdersOnly([order])

        // Show appropriate message based on whether order was imported or updated
        if (saveResult?.success) {
          if (saveResult.updated > 0 && saveResult.imported === 0) {
            // Order already existed in database
            alert(`Order ${order.name} already exists in the database. It has been updated with the latest information.`)
          } else if (saveResult.imported > 0) {
            // New order imported
            alert(`Successfully imported order ${order.name} to the database.`)
          }
        }

        // Add to orders list if not already present
        setOrders(prevOrders => {
          const existingOrder = prevOrders.find(o => o.id === order.id)
          if (existingOrder) {
            // Update existing order
            console.log(`Updating existing order ${order.name} in list`)
            return prevOrders.map(o => o.id === order.id ? order : o)
          } else {
            // Add new order
            console.log(`Adding new order ${order.name} to list (total: ${prevOrders.length + 1})`)
            return [...prevOrders, order]
          }
        })

        setOrderNameInput('')
      } else {
        console.error('Error fetching order:', data.error)
        alert(`Error fetching order: ${data.error || 'Order not found'}`)
      }
    } catch (error) {
      console.error('Error fetching order:', error)
      alert('Error fetching order from Shopify')
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const importOrdersByRange = async () => {
    const start = parseInt(orderRangeStart.trim())
    const end = parseInt(orderRangeEnd.trim())

    if (!orderRangeStart.trim() || !orderRangeEnd.trim()) {
      alert('Please enter both start and end values')
      return
    }

    if (isNaN(start) || isNaN(end)) {
      alert('Please enter valid numbers')
      return
    }

    if (start > end) {
      alert('Start number must be less than or equal to end number')
      return
    }

    // Calculate the limit: if start is 1 and end is 10, we want 10 orders
    const limit = end

    setIsLoadingOrders(true)
    try {
      console.log(`Importing the most recent ${limit} orders (positions ${start}-${end})...`)

      // Fetch the specified number of orders (most recent first)
      const response = await fetch(`/api/shopify/orders?limit=${limit}`)

      // Check if response is JSON before parsing, handle errors gracefully
      const contentType = response.headers.get('content-type')
      let data: any
      try {
        if (contentType && contentType.includes('application/json')) {
          data = await response.json()
        } else {
          const text = await response.text()
          throw new Error(text || 'Server returned non-JSON response')
        }
      } catch (parseError) {
        // If JSON parsing fails, try to get the error message from the response
        if (parseError instanceof SyntaxError) {
          const text = await response.clone().text()
          throw new Error(text || 'Failed to parse server response as JSON')
        }
        throw parseError
      }

      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`Fetched ${fetchedOrders.length} orders from Shopify`)

        if (fetchedOrders.length === 0) {
          alert(`No orders found`)
        } else {
          // Slice to get only the range requested (e.g., if start=1, end=10, get orders 0-9)
          const rangeOrders = fetchedOrders.slice(start - 1, end)

          // Automatically save new orders to database
          await saveNewOrdersOnly(rangeOrders)

          setOrders(rangeOrders.slice(0, 100))
          alert(`Successfully imported ${rangeOrders.length} orders (positions ${start}-${end} of ${fetchedOrders.length} total)`)
        }
      } else {
        console.error('Error fetching orders:', data.error)
        alert(`Error fetching orders: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error importing orders by range:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert('Error importing orders by range: ' + errorMessage)
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const fetchOrderInfo = async (orderId: string) => {
    setSelectedOrderId(orderId)
    setIsOrderDialogOpen(true)
    try {
      const response = await fetch(`/api/shopify/orders/${orderId}`)
      const data = await response.json()
      if (response.ok) {
        setSelectedOrder(data.order)
      } else {
        console.error('Error fetching order info:', data.error)
        setSelectedOrder(null)
      }
    } catch (error) {
      console.error('Error fetching order info:', error)
      setSelectedOrder(null)
    }
  }

  // Open the push workflow dialog
  const openPushWorkflow = (orderId: string, orderName: string) => {
    setPushWorkflow({
      isOpen: true,
      orderId,
      orderName,
      step1: { status: 'idle' },
      step2: { status: 'idle' },
      step3: { status: 'idle' },
    })
  }

  const closePushWorkflow = () => {
    setPushWorkflow({
      isOpen: false,
      orderId: null,
      orderName: null,
      step1: { status: 'idle' },
      step2: { status: 'idle' },
      step3: { status: 'idle' },
    })
  }

  // Step 1: Resolve Customer
  const runStep1ResolveCustomer = async () => {
    if (!pushWorkflow.orderId) return

    setPushWorkflow((prev) => ({
      ...prev,
      step1: { status: 'loading' },
      step2: { status: 'idle' },
      step3: { status: 'idle' },
    }))

    try {
      const response = await fetch('/api/netsuite/resolve-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyOrderId: pushWorkflow.orderId }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setPushWorkflow((prev) => ({
          ...prev,
          step1: { status: 'success', data },
        }))
      } else {
        setPushWorkflow((prev) => ({
          ...prev,
          step1: { status: 'error', error: data.error || 'Unknown error', data },
        }))
      }
    } catch (error) {
      setPushWorkflow((prev) => ({
        ...prev,
        step1: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Network error',
        },
      }))
    }
  }

  // Step 2: Build Payload
  const runStep2BuildPayload = async () => {
    if (!pushWorkflow.orderId) return

    setPushWorkflow((prev) => ({
      ...prev,
      step2: { status: 'loading' },
      step3: { status: 'idle' },
    }))

    try {
      const response = await fetch(
        `/api/netsuite/push-order?shopifyOrderId=${pushWorkflow.orderId}`
      )
      const data = await response.json()

      if (response.ok && data.success) {
        setPushWorkflow((prev) => ({
          ...prev,
          step2: { status: 'success', data },
        }))
      } else {
        setPushWorkflow((prev) => ({
          ...prev,
          step2: { status: 'error', error: data.error || 'Unknown error', data },
        }))
      }
    } catch (error) {
      setPushWorkflow((prev) => ({
        ...prev,
        step2: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Network error',
        },
      }))
    }
  }

  // Step 3: Push to NetSuite
  const runStep3PushToNetSuite = async () => {
    if (!pushWorkflow.orderId) return

    setPushWorkflow((prev) => ({
      ...prev,
      step3: { status: 'loading' },
    }))

    try {
      const response = await fetch('/api/netsuite/push-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyOrderId: pushWorkflow.orderId }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setPushWorkflow((prev) => ({
          ...prev,
          step3: { status: 'success', data },
        }))
        // Refresh orders to show updated NetSuite IDs
        await fetchOrders()
      } else {
        setPushWorkflow((prev) => ({
          ...prev,
          step3: { status: 'error', error: data.error || 'Unknown error', data },
        }))
      }
    } catch (error) {
      setPushWorkflow((prev) => ({
        ...prev,
        step3: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Network error',
        },
      }))
    }
  }

  const deleteOrder = async (orderId: string) => {
    if (!confirm(`Are you sure you want to delete order ${orderId}? This action cannot be undone!`)) {
      return
    }

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (response.ok) {
        console.log(`Successfully deleted order:`, data.message)
        alert(`Successfully deleted order ${orderId}`)

        // Remove the order from state
        setOrders(prev => prev.filter(o => String(o.id) !== orderId))
      } else {
        console.error('Failed to delete order:', data.error)
        alert(`Failed to delete order: ${data.error}`)
      }
    } catch (error) {
      console.error('Error deleting order:', error)
      alert('Error deleting order from database')
    }
  }

  // Manual NetSuite ID functions
  const openNetSuiteIdDialog = (order: Order) => {
    setSelectedOrderForNetSuite(order)
    setNetSuiteIdInput('')
    setIsNetSuiteIdDialogOpen(true)
  }

  const openEditNetSuiteIdDialog = (order: Order) => {
    setSelectedOrderForEdit(order)
    setEditingNetSuiteId(order.netsuiteDepositNumber || '')
    setIsEditNetSuiteIdDialogOpen(true)
  }

  const saveNetSuiteId = async () => {
    if (!selectedOrderForNetSuite || !netSuiteIdInput.trim()) return

    try {
      // Update NetSuite ID in database
      const response = await fetch(`/api/orders/${selectedOrderForNetSuite.id}/netsuite`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ netsuiteDepositNumber: netSuiteIdInput.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        // Update the order in the local state
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.id === selectedOrderForNetSuite.id
              ? { ...order, netsuiteDepositNumber: netSuiteIdInput.trim() }
              : order
          )
        )

        // Close dialog and reset state
        setIsNetSuiteIdDialogOpen(false)
        setSelectedOrderForNetSuite(null)
        setNetSuiteIdInput('')

        console.log(`Added NetSuite ID "${netSuiteIdInput.trim()}" to order ${selectedOrderForNetSuite.name}`)
        alert(`NetSuite ID "${netSuiteIdInput.trim()}" added to order ${selectedOrderForNetSuite.name}`)
      } else {
        console.error('Failed to save NetSuite ID:', data.error)
        alert(`Failed to save NetSuite ID: ${data.error}`)
      }

    } catch (error) {
      console.error('Error saving NetSuite ID:', error)
      alert('Error saving NetSuite ID')
    }
  }

  const saveEditedNetSuiteId = async () => {
    if (!selectedOrderForEdit || !editingNetSuiteId.trim()) return

    try {
      const endpoint = `/api/orders/${(selectedOrderForEdit as any).id}/netsuite`

      // Update NetSuite ID in database
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ netsuiteDepositNumber: editingNetSuiteId.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setOrders(prev => prev.map(order =>
          order.id === selectedOrderForEdit.id
            ? { ...order, netsuiteDepositNumber: editingNetSuiteId.trim() }
            : order
        ))

        console.log('NetSuite ID updated successfully:', data)
        alert('NetSuite ID updated successfully!')
        setIsEditNetSuiteIdDialogOpen(false)
        setEditingNetSuiteId('')
        setSelectedOrderForEdit(null)
      } else {
        console.error('Error updating NetSuite ID:', data)
        alert('Error updating NetSuite ID: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error updating NetSuite ID:', error)
      alert('Error updating NetSuite ID')
    }
  }

  // Mapping error dialog functions
  const openMappingErrorDialog = (orderId: string, orderName: string) => {
    const orderErrors = mappingErrors.filter(error => error.orderId === orderId)
    setMappingErrorDialog({
      isOpen: true,
      orderId,
      orderName,
      errors: orderErrors
    })
  }

  const closeMappingErrorDialog = () => {
    setMappingErrorDialog({
      isOpen: false,
      orderId: '',
      orderName: '',
      errors: []
    })
  }

  // Validate orders for mapping errors
  const validateOrdersForMappings = (ordersToValidate: any[]) => {
    const newErrors: MappingError[] = []

    ordersToValidate.forEach(order => {
      const errors = validateOrderMappings(order, paymentMappings, shipmentMappings)
      newErrors.push(...errors)
    })

    // Return the errors instead of updating state here
    return newErrors
  }

  // Detect missing mappings from all loaded orders
  const detectMissingMappings = () => {
    if (orders.length === 0) return

    console.log('Detecting missing mappings from orders...')

    // Validate all orders
    const errors = validateOrdersForMappings(orders)

    // Update error state
    setMappingErrors(errors)

    if (errors.length > 0) {
      console.log(`Found ${errors.length} mapping errors:`, errors)

      // Extract unique missing mappings
      const missingPaymentMethods = getUnmappedPaymentMethods(errors)
      const missingShipmentMethods = getUnmappedShipmentMethods(errors)

      console.log('Missing payment methods:', missingPaymentMethods)
      console.log('Missing shipment methods:', missingShipmentMethods)

      // Update unmapped methods lists
      setUnmappedPaymentMethods(missingPaymentMethods)
      setUnmappedShipmentMethods(missingShipmentMethods)
    } else {
      console.log('All orders have valid mappings')
      setUnmappedPaymentMethods([])
      setUnmappedShipmentMethods([])
    }
  }

  // --- Effects ---

  // Load saved orders and mappings on mount
  useEffect(() => {
    fetchSavedOrders()
    fetchPaymentMappings()
    fetchShipmentMappings()
  }, [])

  // Search orders in database when search term is entered
  useEffect(() => {
    const searchTerm = orderSearchTerm.trim()

    if (!searchTerm) {
      // Clear search results when search is empty
      setSearchedOrders([])
      setIsSearchingOrders(false)
      return
    }

    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(async () => {
      setIsSearchingOrders(true)
      try {
        const response = await fetch(`/api/orders?search=${encodeURIComponent(searchTerm)}`)
        const data = await response.json()

        if (response.ok && data.orders) {
          setSearchedOrders(data.orders)
        } else {
          console.error('Error searching orders:', data.error)
          setSearchedOrders([])
        }
      } catch (error) {
        console.error('Error searching orders:', error)
        setSearchedOrders([])
      } finally {
        setIsSearchingOrders(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [orderSearchTerm])

  // Detect missing mappings when orders are loaded
  useEffect(() => {
    if (orders.length > 0 && paymentMappings.length > 0 && shipmentMappings.length > 0) {
      detectMissingMappings()
    }
  }, [orders, paymentMappings, shipmentMappings])

  // Re-detect missing mappings when mappings are updated
  useEffect(() => {
    if (orders.length > 0) {
      detectMissingMappings()
    }
  }, [paymentMappings, shipmentMappings])

  // --- Derived state ---

  // Determine which orders to use: searched orders if searching, otherwise regular orders
  const ordersToFilter = orderSearchTerm.trim() ? searchedOrders : orders

  // Filter orders based on current filter state and search term
  const filteredOrders = ordersToFilter.filter(order => {
    // Financial status filter
    if (!orderFilters.financialStatus.all) {
      const matchesFinancial = (orderFilters.financialStatus.paid && order.financial_status === 'paid') ||
                              (orderFilters.financialStatus.pending && order.financial_status === 'pending') ||
                              (orderFilters.financialStatus.refunded && order.financial_status === 'refunded')
      if (!matchesFinancial) return false
    }

    // Fulfillment status filter
    if (!orderFilters.fulfillmentStatus.all) {
      const matchesFulfillment = (orderFilters.fulfillmentStatus.fulfilled && order.fulfillment_status === 'fulfilled') ||
                                (orderFilters.fulfillmentStatus.unfulfilled && order.fulfillment_status !== 'fulfilled')
      if (!matchesFulfillment) return false
    }

    // NetSuite status filter
    if (!orderFilters.netsuiteStatus.all) {
      const hasNetSuiteId = !!order.netsuiteDepositNumber
      const matchesNetSuite = (orderFilters.netsuiteStatus.pushed && hasNetSuiteId) ||
                             (orderFilters.netsuiteStatus.not_pushed && !hasNetSuiteId)
      if (!matchesNetSuite) return false
    }

    // Date range filter
    if (!orderFilters.dateRange.all) {
      if (orderFilters.dateRange.recent) {
        const orderDate = new Date(order.created_at)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        if (orderDate < thirtyDaysAgo) {
          return false
        }
      }
    }

    return true
  })

  // --- Render ---

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          {/* Compact Controls */}
          <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b">
            {/* Search Bar */}
            <div className="flex items-center gap-3 flex-1 min-w-[300px]">
              <Input
                placeholder="Search orders by name, ID, amount, or currency..."
                value={orderSearchTerm}
                onChange={(e) => setOrderSearchTerm(e.target.value)}
                className="h-9 flex-1"
              />
            </div>

            {/* Filter and Import Controls */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOrderFiltersOpen(true)}
                className="h-9 flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
              </Button>

              <Button
                onClick={() => fetchOrders(false)}
                disabled={true}
                className="flex items-center gap-2 h-9 opacity-50 cursor-not-allowed"
                size="sm"
                title="Import Orders is currently disabled"
              >
                {isLoadingOrders ? <LoaderWithText text="Loading..." /> : (
                  <>
                    <Download className="h-4 w-4" />
                    Import Orders
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Order Name (#38266) or ID"
                  value={orderNameInput}
                  onChange={(e) => setOrderNameInput(e.target.value)}
                  className="w-[140px] h-9"
                />
                <Button
                  onClick={importOrderByName}
                  disabled={isLoadingOrders || !orderNameInput.trim()}
                  className="h-9"
                  size="sm"
                >
                  Import
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Import:</span>
                <Input
                  type="number"
                  placeholder="Start"
                  value={orderRangeStart}
                  onChange={(e) => setOrderRangeStart(e.target.value)}
                  className="w-[70px] h-9"
                  title="Starting position (e.g., 1 for first order)"
                />
                <span className="text-sm text-muted-foreground">-</span>
                <Input
                  type="number"
                  placeholder="End"
                  value={orderRangeEnd}
                  onChange={(e) => setOrderRangeEnd(e.target.value)}
                  className="w-[70px] h-9"
                  title="Ending position (e.g., 10 for 10th order)"
                />
                <Button
                  onClick={importOrdersByRange}
                  disabled={isLoadingOrders || !orderRangeStart.trim() || !orderRangeEnd.trim()}
                  className="h-9"
                  size="sm"
                  variant="outline"
                >
                  Import Range
                </Button>
              </div>
            </div>

            {/* Results Count */}
            <div className="text-sm text-muted-foreground">
              {orderSearchTerm.trim() ? (
                <>
                  {isSearchingOrders ? 'Searching...' : `${filteredOrders.length} result${filteredOrders.length !== 1 ? 's' : ''} found`}
                  {!isSearchingOrders && filteredOrders.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (searching all orders in database)
                    </span>
                  )}
                </>
              ) : (
                `${filteredOrders.length} of ${orders.length}`
              )}
            </div>
          </div>

          {/* Orders Display */}
          {(isLoadingOrders || isSearchingOrders) ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found. Click &quot;Import All Orders&quot; or &quot;Import by Name&quot; to get started.
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders match the current filters. Try adjusting your filter criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Left side - Order info */}
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-semibold text-sm">
                          {order.name}
                        </h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.financial_status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : order.financial_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {order.financial_status}
                        </span>
                        {order.fulfillment_status && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.fulfillment_status === 'fulfilled'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {order.fulfillment_status}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {safeToLocaleDateString(order.created_at)}
                      </div>

                      <div className="font-bold">
                        {hideSensitiveData ? (
                          <span className="text-gray-500">{'??????'}</span>
                        ) : (
                          `${order.currency} ${Number(order.total_price).toFixed(2)}`
                        )}
                      </div>
                    </div>

                    {/* Right side - Status badges and actions */}
                    <div className="flex items-center space-x-4">
                      {/* Status Badges */}
                      <div className="flex items-center space-x-2">
                        {order.inDatabase && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {'✓'} In DB
                          </span>
                        )}
                        {order.netsuiteDepositNumber && (
                          <button
                            onClick={() => openEditNetSuiteIdDialog(order)}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer transition-colors"
                            title="Click to edit NetSuite ID"
                          >
                            {'✓'} NS: {order.netsuiteDepositNumber}
                          </button>
                        )}
                        {/* Mapping Error Indicators */}
                        {mappingErrors.filter(error => error.orderId === order.id).length > 0 && (
                          <button
                            onClick={() => openMappingErrorDialog(String(order.id), order.name)}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer transition-colors"
                          >
                            {'⚠'} Mapping Error
                          </button>
                        )}
                        {order.inDatabase && !order.netsuiteDepositNumber && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Ready for NS
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://admin.shopify.com/store/pirani-life/orders/${order.id}`, '_blank', 'noopener,noreferrer')}
                          className="text-xs flex items-center gap-1"
                          title="View order in Shopify"
                        >
                          <ArrowUpRight className="h-3 w-3" />
                          View in Shopify
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchOrderInfo(String(order.id))}
                          className="text-xs"
                        >
                          Order Info
                        </Button>
                        {order.inDatabase && !order.netsuiteDepositNumber && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openPushWorkflow(String(order.id), order.name)}
                              className="bg-blue-600 hover:bg-blue-700 text-xs px-3"
                            >
                              Push to NS
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openNetSuiteIdDialog(order)}
                              className="text-xs border-orange-300 text-orange-600 hover:bg-orange-50"
                            >
                              Add NS ID
                            </Button>
                          </>
                        )}
                        {order.inDatabase && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteOrder(String(order.id))}
                            className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Order Info Dialog */}
          <OrderInfoDialog
            isOpen={isOrderDialogOpen}
            onClose={() => setIsOrderDialogOpen(false)}
            orderId={selectedOrderId}
            order={selectedOrder}
            isLoading={false}
            hideSensitiveData={hideSensitiveData}
          />

          {/* NetSuite ID Dialog */}
          <Dialog open={isNetSuiteIdDialogOpen} onOpenChange={setIsNetSuiteIdDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add NetSuite ID</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Order</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrderForNetSuite?.name}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">NetSuite Deposit ID</label>
                  <Input
                    placeholder="Enter NetSuite ID..."
                    value={netSuiteIdInput}
                    onChange={(e) => setNetSuiteIdInput(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsNetSuiteIdDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveNetSuiteId}
                  disabled={!netSuiteIdInput.trim()}
                >
                  Save NetSuite ID
                </Button>
              </div>
            </DialogContent>
          </Dialog>


          {/* Order Filters Dialog */}
          <Dialog open={isOrderFiltersOpen} onOpenChange={setIsOrderFiltersOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Filter content just for you</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">FINANCIAL STATUS</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.financialStatus.all}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            financialStatus: {
                              all: checked,
                              paid: checked ? false : prev.financialStatus.paid,
                              pending: checked ? false : prev.financialStatus.pending,
                              refunded: checked ? false : prev.financialStatus.refunded
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">All Status</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.financialStatus.paid}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            financialStatus: {
                              all: false,
                              paid: checked,
                              pending: prev.financialStatus.pending,
                              refunded: prev.financialStatus.refunded
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Paid</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.financialStatus.pending}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            financialStatus: {
                              all: false,
                              paid: prev.financialStatus.paid,
                              pending: checked,
                              refunded: prev.financialStatus.refunded
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Pending</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.financialStatus.refunded}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            financialStatus: {
                              all: false,
                              paid: prev.financialStatus.paid,
                              pending: prev.financialStatus.pending,
                              refunded: checked
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Refunded</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">FULFILLMENT STATUS</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.fulfillmentStatus.all}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            fulfillmentStatus: {
                              all: checked,
                              fulfilled: checked ? false : prev.fulfillmentStatus.fulfilled,
                              unfulfilled: checked ? false : prev.fulfillmentStatus.unfulfilled
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">All Fulfillment</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.fulfillmentStatus.fulfilled}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            fulfillmentStatus: {
                              all: false,
                              fulfilled: checked,
                              unfulfilled: prev.fulfillmentStatus.unfulfilled
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Fulfilled</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.fulfillmentStatus.unfulfilled}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            fulfillmentStatus: {
                              all: false,
                              fulfilled: prev.fulfillmentStatus.fulfilled,
                              unfulfilled: checked
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Unfulfilled</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">NETSUITE STATUS</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.netsuiteStatus.all}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            netsuiteStatus: {
                              all: checked,
                              not_pushed: checked ? false : prev.netsuiteStatus.not_pushed,
                              pushed: checked ? false : prev.netsuiteStatus.pushed
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">All NetSuite</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.netsuiteStatus.not_pushed}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            netsuiteStatus: {
                              all: false,
                              not_pushed: checked,
                              pushed: prev.netsuiteStatus.pushed
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Not Pushed</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.netsuiteStatus.pushed}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            netsuiteStatus: {
                              all: false,
                              not_pushed: prev.netsuiteStatus.not_pushed,
                              pushed: checked
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Pushed</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">DATE RANGE</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.dateRange.all}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            dateRange: {
                              all: checked,
                              recent: checked ? false : prev.dateRange.recent
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">All Time</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={orderFilters.dateRange.recent}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setOrderFilters(prev => ({
                            ...prev,
                            dateRange: {
                              all: false,
                              recent: checked
                            }
                          }))
                        }}
                        className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Last 30 Days</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t">
                <Button
                  variant="ghost"
                  onClick={() => setOrderFilters({
                    financialStatus: { all: true, paid: false, pending: false, refunded: false },
                    fulfillmentStatus: { all: true, fulfilled: false, unfulfilled: false },
                    netsuiteStatus: { all: true, not_pushed: false, pushed: false },
                    dateRange: { all: true, recent: false }
                  })}
                  className="text-slate-600"
                >
                  Clear
                </Button>
                <Button
                  onClick={() => setIsOrderFiltersOpen(false)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Apply Filters
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit NetSuite ID Dialog */}
          <Dialog open={isEditNetSuiteIdDialogOpen} onOpenChange={setIsEditNetSuiteIdDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit NetSuite ID</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Order</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrderForEdit?.name}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">NetSuite Deposit ID</label>
                  <Input
                    placeholder="Enter NetSuite ID..."
                    value={editingNetSuiteId}
                    onChange={(e) => setEditingNetSuiteId(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsEditNetSuiteIdDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveEditedNetSuiteId}
                  disabled={!editingNetSuiteId.trim()}
                >
                  Update NetSuite ID
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Mapping Error Dialog */}
      <Dialog open={mappingErrorDialog.isOpen} onOpenChange={closeMappingErrorDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-red-600">{'⚠'}</span>
              Mapping Error Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold text-lg">{mappingErrorDialog.orderName}</h3>
              <p className="text-sm text-slate-600">This order has mapping errors that need to be resolved before it can be processed.</p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-slate-800">Issues Found:</h4>
              {mappingErrorDialog.errors.map((error, index) => (
                <div key={index} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <div className="flex items-start gap-2">
                    <span className="text-red-600 mt-0.5">{'⚠'}</span>
                    <div className="flex-1">
                      <p className="font-medium text-red-800">{error.errorMessage}</p>
                      <div className="mt-2 text-xs text-red-600">
                        <strong>Type:</strong> {error.missingMapping.type} | <strong>Shopify Value:</strong> {error.missingMapping.shopifyValue}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2">How to Fix:</h4>
              <ol className="text-sm text-blue-700 space-y-1">
                <li>1. Go to the <strong>Mappings</strong> section in the left sidebar</li>
                <li>2. Look for the <strong>&quot;Unmapped Payment Methods&quot;</strong> or <strong>&quot;Unmapped Shipment Methods&quot;</strong> section</li>
                <li>3. Select the appropriate NetSuite ID for each unmapped item</li>
                <li>4. The mapping will be automatically saved to the database</li>
                <li>5. Return to this order - the error should be resolved</li>
              </ol>
            </div>

            <div className="flex justify-end">
              <Button onClick={closeMappingErrorDialog}>
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Push to NetSuite Workflow Dialog (3-step) */}
      <Dialog open={pushWorkflow.isOpen} onOpenChange={(open) => { if (!open) closePushWorkflow() }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Push Order to NetSuite</DialogTitle>
          </DialogHeader>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Order:</strong> {pushWorkflow.orderName || pushWorkflow.orderId}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Run each step in order. Click the play button to execute each step and inspect the results before proceeding.
            </p>
          </div>

          <div className="space-y-3">
            {/* ──── Step 1: Resolve Customer ──── */}
            <WorkflowStep
              stepNumber={1}
              title="Resolve Customer"
              description="3-tier lookup: Local DB, SuiteQL email search, or create new customer in NetSuite"
              status={pushWorkflow.step1.status}
              onRun={runStep1ResolveCustomer}
              canRun={pushWorkflow.step1.status !== 'loading'}
            >
              {pushWorkflow.step1.status === 'success' && pushWorkflow.step1.data && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      pushWorkflow.step1.data.tier === 1 ? 'bg-green-100 text-green-800' :
                      pushWorkflow.step1.data.tier === 2 ? 'bg-blue-100 text-blue-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      Tier {pushWorkflow.step1.data.tier}
                    </span>
                    <span className="text-xs text-muted-foreground">{pushWorkflow.step1.data.tierDescription}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">NetSuite ID:</span> <strong className="text-green-700">{pushWorkflow.step1.data.netsuiteCustomerId}</strong></div>
                    <div><span className="text-muted-foreground">Name:</span> <strong>{pushWorkflow.step1.data.customerName || 'N/A'}</strong></div>
                    <div><span className="text-muted-foreground">Email:</span> <strong>{pushWorkflow.step1.data.email || 'N/A'}</strong></div>
                    <div><span className="text-muted-foreground">Shopify ID:</span> <strong>{pushWorkflow.step1.data.shopifyCustomerId}</strong></div>
                  </div>
                  {pushWorkflow.step1.data.wasCreated && pushWorkflow.step1.data.createDetails && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-orange-700 mb-1">Customer was CREATED in NetSuite (Tier 3)</p>
                      {pushWorkflow.step1.data.createDetails.mappingsApplied?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium mb-1">Mappings Applied:</p>
                          <div className="bg-white border rounded p-2 text-xs space-y-1">
                            {pushWorkflow.step1.data.createDetails.mappingsApplied.map((m: any, i: number) => (
                              <div key={i} className="flex gap-2">
                                <span className="text-muted-foreground">{m.field}:</span>
                                <span className="font-mono">{m.finalValue}</span>
                                <span className="text-muted-foreground">({m.mappingType}: {m.rawValue})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View payload sent to NetSuite</summary>
                        <div className="mt-1 bg-white border rounded p-2 overflow-x-auto">
                          <JsonView
                            value={pushWorkflow.step1.data.createDetails.payloadSent}
                            style={{ backgroundColor: 'transparent', fontSize: '11px' }}
                            collapsed={1}
                            displayDataTypes={false}
                            displayObjectSize={false}
                            enableClipboard={true}
                          />
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
              {pushWorkflow.step1.status === 'error' && (
                <div className="text-xs">
                  <p className="text-red-700 font-medium">{pushWorkflow.step1.error}</p>
                  {pushWorkflow.step1.data && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View response details</summary>
                      <pre className="mt-1 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto text-[10px]">
                        {JSON.stringify(pushWorkflow.step1.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </WorkflowStep>

            {/* ──── Step 2: Build Payload ──── */}
            <WorkflowStep
              stepNumber={2}
              title="Build Payload"
              description="Generate the full NetSuite Sales Order JSON with addresses, line items, and mappings"
              status={pushWorkflow.step2.status}
              onRun={runStep2BuildPayload}
              canRun={pushWorkflow.step1.status === 'success' && pushWorkflow.step2.status !== 'loading'}
            >
              {pushWorkflow.step2.status === 'success' && pushWorkflow.step2.data && (
                <div className="space-y-3">
                  {/* Validation summary */}
                  {pushWorkflow.step2.data.validation && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className={`p-2 rounded ${pushWorkflow.step2.data.validation.hasCustomerId ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        Customer ID: {pushWorkflow.step2.data.validation.hasCustomerId ? 'Yes' : 'Missing'}
                      </div>
                      <div className={`p-2 rounded ${pushWorkflow.step2.data.validation.hasBillingAddress ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        Billing Addr: {pushWorkflow.step2.data.validation.hasBillingAddress ? 'Yes' : 'No'}
                      </div>
                      <div className={`p-2 rounded ${pushWorkflow.step2.data.validation.hasShippingAddress ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        Shipping Addr: {pushWorkflow.step2.data.validation.hasShippingAddress ? 'Yes' : 'No'}
                      </div>
                      <div className="p-2 rounded bg-blue-50 text-blue-700">
                        Items: {pushWorkflow.step2.data.validation.itemCount}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {pushWorkflow.step2.data.warnings && pushWorkflow.step2.data.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                      <p className="text-xs font-medium text-yellow-800 mb-1">Warnings:</p>
                      <ul className="text-xs text-yellow-700 space-y-0.5">
                        {pushWorkflow.step2.data.warnings.map((w: string, i: number) => (
                          <li key={i}>- {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Full JSON Payload */}
                  <details open>
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                      Full JSON Payload
                    </summary>
                    <div className="mt-1 bg-white border rounded p-3 overflow-x-auto">
                      <JsonView
                        value={pushWorkflow.step2.data.payload}
                        style={{ backgroundColor: 'transparent', fontSize: '11px' }}
                        collapsed={1}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        enableClipboard={true}
                      />
                    </div>
                  </details>
                </div>
              )}
              {pushWorkflow.step2.status === 'error' && (
                <div className="text-xs">
                  <p className="text-red-700 font-medium">{pushWorkflow.step2.error}</p>
                  {pushWorkflow.step2.data && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View response details</summary>
                      <pre className="mt-1 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto text-[10px]">
                        {JSON.stringify(pushWorkflow.step2.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </WorkflowStep>

            {/* ──── Step 3: Push to NetSuite ──── */}
            <WorkflowStep
              stepNumber={3}
              title="Push to NetSuite"
              description="Send the sales order payload to NetSuite REST API"
              status={pushWorkflow.step3.status}
              onRun={runStep3PushToNetSuite}
              canRun={pushWorkflow.step2.status === 'success' && pushWorkflow.step3.status !== 'loading'}
            >
              {pushWorkflow.step3.status === 'success' && pushWorkflow.step3.data && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-700">Sales Order Created Successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Sales Order ID:</span> <strong>{pushWorkflow.step3.data.salesOrderId || 'N/A'}</strong></div>
                    <div><span className="text-muted-foreground">Sales Order Name:</span> <strong>{pushWorkflow.step3.data.salesOrderName || 'N/A'}</strong></div>
                  </div>
                  {pushWorkflow.step3.data.warnings && pushWorkflow.step3.data.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1">
                      <p className="text-xs font-medium text-yellow-800 mb-1">Warnings:</p>
                      <ul className="text-xs text-yellow-700 space-y-0.5">
                        {pushWorkflow.step3.data.warnings.map((w: string, i: number) => (
                          <li key={i}>- {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {pushWorkflow.step3.data.responseDebug && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">NetSuite response details</summary>
                      <div className="mt-1 bg-gray-50 border rounded p-2 space-y-1 text-[10px]">
                        <div><span className="text-muted-foreground">HTTP Status:</span> {pushWorkflow.step3.data.responseDebug.status}</div>
                        <div><span className="text-muted-foreground">Location Header:</span> {pushWorkflow.step3.data.responseDebug.location || '(none)'}</div>
                        <div><span className="text-muted-foreground">Response Body:</span> {pushWorkflow.step3.data.responseDebug.body || '(empty)'}</div>
                      </div>
                    </details>
                  )}
                </div>
              )}
              {pushWorkflow.step3.status === 'error' && (
                <div className="text-xs">
                  <p className="text-red-700 font-medium">{pushWorkflow.step3.error}</p>
                  {pushWorkflow.step3.data && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View response details</summary>
                      <pre className="mt-1 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto text-[10px]">
                        {JSON.stringify(pushWorkflow.step3.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </WorkflowStep>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={closePushWorkflow}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Reusable workflow step component */
function WorkflowStep({
  stepNumber,
  title,
  description,
  status,
  onRun,
  canRun,
  children,
}: {
  stepNumber: number
  title: string
  description: string
  status: 'idle' | 'loading' | 'success' | 'error'
  onRun: () => void
  canRun: boolean
  children?: React.ReactNode
}) {
  const [isExpanded, setIsExpanded] = useState(status === 'success' || status === 'error')

  // Auto-expand when status changes to success or error
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      setIsExpanded(true)
    }
  }, [status])

  const statusIcon = {
    idle: <Clock className="h-4 w-4 text-gray-400" />,
    loading: <Loader />,
    success: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    error: <XCircle className="h-4 w-4 text-red-600" />,
  }[status]

  const borderColor = {
    idle: 'border-gray-200',
    loading: 'border-blue-300',
    success: 'border-green-300',
    error: 'border-red-300',
  }[status]

  return (
    <div className={`border ${borderColor} rounded-lg overflow-hidden`}>
      <div className="flex items-center justify-between p-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 hover:text-blue-600"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-xs font-bold">
              {stepNumber}
            </span>
            <span className="text-sm font-medium">{title}</span>
            {statusIcon}
          </div>
        </div>
        <Button
          size="sm"
          variant={status === 'success' ? 'outline' : 'default'}
          onClick={onRun}
          disabled={!canRun}
          className="text-xs h-7 px-3"
        >
          {status === 'loading' ? (
            'Running...'
          ) : status === 'success' ? (
            'Re-run'
          ) : (
            <>
              <Play className="h-3 w-3 mr-1" />
              Run
            </>
          )}
        </Button>
      </div>
      {!isExpanded && (
        <div className="px-3 pb-2">
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      )}
      {isExpanded && (
        <div className="p-3 border-t bg-white">
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
          {children}
        </div>
      )}
    </div>
  )
}
