'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PayoutCard } from '@/components/PayoutCard'
import { TransactionsDialog } from '@/components/TransactionsDialog'
import { OrderInfoDialog } from '@/components/OrderInfoDialog'
import { Sidebar } from '@/components/Sidebar'
import { Loader, LoaderWithText } from '@/components/Loader'
import { Download, Database, ArrowUpRight, Settings, Eye, EyeOff, Filter } from 'lucide-react'
import { safeToLocaleDateString } from '@/lib/dateUtils'

interface Payout {
  id: string | number
  date: string
  amount: string | number
  currency: string
  status: string
  inDatabase?: boolean
  addedToDatabaseAt?: string
  netsuiteDepositNumber?: string | null
}

interface Transaction {
  id: string
  source_order_id: string
  amount: string | number
  fee: string | number
  net: string | number
  type: string
  currency: string
  processedAt: string
}

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

interface SavedPayout {
  id: string
  date: string
  amount: number
  currency: string
  status: string
  netsuiteDepositNumber: string | null
  transactions: Array<{
    id: string
    sourceOrderId: string
    amount: number
    fee: number
    net: number
    type: string
    currency: string
    processedAt: string
  }>
}

export default function Home() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [selectedPayoutTransactions, setSelectedPayoutTransactions] = useState<Transaction[]>([])
  const [savedPayouts, setSavedPayouts] = useState<SavedPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [payoutIdInput, setPayoutIdInput] = useState('')
  const [hideSensitiveData, setHideSensitiveData] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('orders')
  const [filters, setFilters] = useState({
    netsuiteStatus: {
      all: true,
      not_pushed: false,
      pushed: false
    },
    payoutStatus: {
      all: true,
      paid: false,
      pending: false
    },
    dateRange: {
      all: true,
      recent: false
    }
  })

  // Search state
  const [payoutSearchTerm, setPayoutSearchTerm] = useState('')
  const [orderSearchTerm, setOrderSearchTerm] = useState('')

  // Filter dialog state
  const [isPayoutFiltersOpen, setIsPayoutFiltersOpen] = useState(false)
  const [isOrderFiltersOpen, setIsOrderFiltersOpen] = useState(false)

  // Edit NetSuite ID state
  const [isEditNetSuiteIdDialogOpen, setIsEditNetSuiteIdDialogOpen] = useState(false)
  const [editingNetSuiteId, setEditingNetSuiteId] = useState('')
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null)

  // Order-related state
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false)
  
  // Manual NetSuite ID state
  const [isNetSuiteIdDialogOpen, setIsNetSuiteIdDialogOpen] = useState(false)
  const [selectedOrderForNetSuite, setSelectedOrderForNetSuite] = useState<Order | null>(null)
  const [netSuiteIdInput, setNetSuiteIdInput] = useState('')

  // Order filters and single import state
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
  const [orderNameInput, setOrderNameInput] = useState('')

  const fetchSavedPayouts = async () => {
    setIsLoadingSaved(true)
    try {
      const response = await fetch('/api/payouts')
      const data = await response.json()
      if (response.ok) {
        setSavedPayouts(data.payouts || [])
        console.log(`✅ Loaded ${data.payouts?.length || 0} saved payouts from database`)
      } else {
        console.error('Error fetching saved payouts:', data.error)
      }
    } catch (error) {
      console.error('Error fetching saved payouts:', error)
    } finally {
      setIsLoadingSaved(false)
    }
  }

  const fetchSavedOrders = async () => {
    setIsLoadingOrders(true)
    try {
      const response = await fetch('/api/orders')
      const data = await response.json()
      if (response.ok) {
        setOrders(data.orders || [])
        console.log(`✅ Loaded ${data.orders?.length || 0} saved orders from database`)
      } else {
        console.error('Error fetching saved orders:', data.error)
        // If there's an error (like table doesn't exist), just set empty array
        setOrders([])
      }
    } catch (error) {
      console.error('Error fetching saved orders:', error)
      // If there's an error, just set empty array and continue
      setOrders([])
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const checkPayoutDatabaseStatus = async (payouts: Payout[]) => {
    try {
      // Get all saved payouts to check status
      const response = await fetch('/api/payouts')
      const data = await response.json()
      
      if (response.ok && data.payouts) {
        const savedPayoutsMap = new Map(data.payouts.map((p: any) => [String(p.id), p]))
        
        // Update payouts with database status
        const updatedPayouts = payouts.map(payout => {
          const savedPayout = savedPayoutsMap.get(String(payout.id))
          const isInDatabase = !!savedPayout
          
          console.log(`Payout ${payout.id}: ${isInDatabase ? 'IN DB' : 'NOT IN DB'}`)
          
          return {
            ...payout,
            inDatabase: isInDatabase,
            addedToDatabaseAt: savedPayout?.createdAt || undefined,
            netsuiteDepositNumber: savedPayout?.netsuiteDepositNumber || null
          }
        })
        
        setPayouts(updatedPayouts)
      }
    } catch (error) {
      console.error('Error checking payout database status:', error)
    }
  }

  const importAllPayouts = async () => {
    console.log('🚀 Starting import all payouts...')
    setIsLoading(true)
    try {
      console.log('📡 Fetching payouts from Shopify API...')
      const response = await fetch('/api/shopify/payouts')
      const data = await response.json()
      
      console.log('📦 Shopify API Response:', { 
        ok: response.ok, 
        status: response.status,
        payoutsCount: data.payouts?.length || 0 
      })
      
      if (response.ok) {
        const fetchedPayouts = data.payouts || []
        console.log(`✅ Fetched ${fetchedPayouts.length} payouts from Shopify`)
        setPayouts(fetchedPayouts)
        
        // Check database status first
        console.log('🔍 Checking database status...')
        await checkPayoutDatabaseStatus(fetchedPayouts)
        
        // Only save payouts that aren't already in database
        console.log('💾 Saving new payouts to database...')
        await saveNewPayoutsOnly(fetchedPayouts)
        
        console.log('✅ Import completed successfully!')
      } else {
        console.error('❌ Error fetching payouts:', data.error)
        alert('Error fetching payouts: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('❌ Error fetching payouts:', error)
      alert('Error fetching payouts: ' + error)
    } finally {
      setIsLoading(false)
      console.log('🏁 Import process finished')
    }
  }

  const importPayoutById = async () => {
    if (!payoutIdInput.trim()) {
      alert('Please enter a payout ID')
      return
    }
    
    setIsLoading(true)
    try {
      // First fetch all payouts and filter by the specific ID
      const response = await fetch('/api/shopify/payouts')
      const data = await response.json()
      if (response.ok) {
        const filteredPayouts = data.payouts.filter((payout: any) => 
          String(payout.id).includes(payoutIdInput.trim())
        )
        if (filteredPayouts.length === 0) {
          alert('No payouts found with that ID')
          setPayouts([])
        } else {
          setPayouts(filteredPayouts)
          // Check database status first
          await checkPayoutDatabaseStatus(filteredPayouts)
          // Only save payouts that aren't already in database
          await saveNewPayoutsOnly(filteredPayouts)
        }
      } else {
        console.error('Error fetching payouts:', data.error)
        alert('Error fetching payouts: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error fetching payouts:', error)
      alert('Error fetching payouts: ' + error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveNewPayoutsOnly = async (payoutsToSave: Payout[]) => {
    console.log('🔍 Checking existing payouts in database...')
    
    // Get current saved payouts to check which ones are new
    const response = await fetch('/api/payouts')
    const data = await response.json()
    const existingPayoutIds = new Set((data.payouts || []).map((p: any) => String(p.id)))
    
    console.log(`📊 Database currently has ${existingPayoutIds.size} payouts`)
    console.log('📋 Existing payout IDs:', Array.from(existingPayoutIds))
    
    // Filter to only save payouts that aren't already in database
    const newPayouts = payoutsToSave.filter(payout => !existingPayoutIds.has(String(payout.id)))
    
    console.log(`🎯 Found ${newPayouts.length} new payouts to save out of ${payoutsToSave.length} total`)
    console.log('🆕 New payout IDs:', newPayouts.map(p => String(p.id)))
    
    if (newPayouts.length === 0) {
      console.log('ℹ️ No new payouts to save - all are already in database')
      return
    }
    
    for (const payout of newPayouts) {
      console.log(`💾 Processing payout ${payout.id}...`)
      try {
        // Fetch transactions for this payout
        console.log(`📡 Fetching transactions for payout ${payout.id}...`)
        const transactionsResponse = await fetch(`/api/shopify/payouts/${payout.id}/transactions`)
        const transactionsData = await transactionsResponse.json()
        
        console.log(`📦 Transactions response for ${payout.id}:`, {
          ok: transactionsResponse.ok,
          status: transactionsResponse.status,
          transactionsCount: transactionsData.transactions?.length || 0
        })
        
        if (transactionsResponse.ok) {
          // Save payout with transactions to database
          console.log(`💾 Saving payout ${payout.id} to database...`)
          const saveResponse = await fetch('/api/payouts/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              payout,
              transactions: transactionsData.transactions || [],
            }),
          })

          console.log(`📤 Save response for ${payout.id}:`, {
            ok: saveResponse.ok,
            status: saveResponse.status
          })

          if (saveResponse.ok) {
            console.log(`✅ Successfully saved payout ${payout.id} to database`)
          } else {
            const errorData = await saveResponse.json()
            console.error(`❌ Failed to save payout ${payout.id}:`, errorData)
            console.error(`❌ Error details:`, errorData.details || 'No details provided')
          }
        } else {
          console.error(`❌ Failed to fetch transactions for payout ${payout.id}`)
        }
      } catch (error) {
        console.error(`❌ Error processing payout ${payout.id}:`, error)
      }
    }
    
    // Refresh the saved payouts display
    await fetchSavedPayouts()
    // Update the payouts with new database status
    await checkPayoutDatabaseStatus(payoutsToSave)
  }

  const fetchTransactions = async (payoutId: string) => {
    setIsLoadingTransactions(true)
    setSelectedPayoutId(payoutId)
    try {
      const response = await fetch(`/api/shopify/payouts/${payoutId}/transactions`)
      const data = await response.json()
      if (response.ok) {
        setSelectedPayoutTransactions(data.transactions || [])
        setIsDialogOpen(true) // Open the dialog
      } else {
        console.error('Error fetching transactions:', data.error)
        alert('Error fetching transactions: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
      alert('Error fetching transactions: ' + error)
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  const pushToNetSuite = async (payoutId: string) => {
    alert(`Push to NetSuite functionality coming soon! Payout ID: ${payoutId}`)
    // TODO: Implement actual NetSuite integration
  }

  const deletePayout = async (payoutId: string) => {
    if (!confirm(`⚠️ Are you sure you want to delete payout ${payoutId} and all its transactions? This action cannot be undone!`)) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/${payoutId}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (response.ok) {
        console.log(`🗑️ Successfully deleted payout:`, data.message)
        alert(`✅ Successfully deleted payout ${payoutId} and ${data.deletedTransactions} transactions`)
        
        // Remove the payout from both state arrays
        setSavedPayouts(prev => prev.filter(p => p.id !== payoutId))
        setPayouts(prev => prev.filter(p => String(p.id) !== payoutId))
      } else {
        console.error('❌ Failed to delete payout:', data.error)
        alert(`Failed to delete payout: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error deleting payout:', error)
      alert('Error deleting payout from database')
    }
  }

  // Order functions
  const fetchOrders = async () => {
    setIsLoadingOrders(true)
    try {
      const response = await fetch('/api/shopify/orders')
      const data = await response.json()
      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`✅ Fetched ${fetchedOrders.length} orders from Shopify`)
        
        // Automatically save new orders to database
        await saveNewOrdersOnly(fetchedOrders)
        
        setOrders(fetchedOrders)
      } else {
        console.error('❌ Error fetching orders:', data.error)
        alert(`Error fetching orders: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error fetching orders:', error)
      alert('Error fetching orders from Shopify')
    } finally {
      setIsLoadingOrders(false)
    }
  }

  const saveNewOrdersOnly = async (fetchedOrders: Order[]) => {
    try {
      console.log(`💾 Saving new orders to database...`)
      
      const response = await fetch('/api/orders/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orders: fetchedOrders }),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        console.log(`✅ Successfully saved orders to database:`, data.message)
        
        // Update orders with database status
        const updatedOrders = fetchedOrders.map(order => {
          const savedOrder = data.orders.find((saved: any) => saved.id === order.id)
          return savedOrder || order
        })
        
        setOrders(updatedOrders)
      } else {
        console.error('❌ Failed to save orders to database:', data.error)
        alert(`Failed to save orders to database: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error saving orders to database:', error)
      alert('Error saving orders to database')
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
        console.log(`✅ Fetched order ${order.name} from Shopify`)
        
        // Save to database
        await saveNewOrdersOnly([order])
        
        // Add to orders list if not already present
        setOrders(prevOrders => {
          const existingOrder = prevOrders.find(o => o.id === order.id)
          if (existingOrder) {
            // Update existing order
            return prevOrders.map(o => o.id === order.id ? order : o)
          } else {
            // Add new order
            return [...prevOrders, order]
          }
        })
        
        setOrderNameInput('')
      } else {
        console.error('❌ Error fetching order:', data.error)
        alert(`Error fetching order: ${data.error || 'Order not found'}`)
      }
    } catch (error) {
      console.error('❌ Error fetching order:', error)
      alert('Error fetching order from Shopify')
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
        console.error('❌ Error fetching order info:', data.error)
        setSelectedOrder(null)
      }
    } catch (error) {
      console.error('❌ Error fetching order info:', error)
      setSelectedOrder(null)
    }
  }

  const pushOrderToNetSuite = async (orderId: string) => {
    alert(`Push Order to NetSuite functionality coming soon! Order ID: ${orderId}`)
    // TODO: Implement actual NetSuite integration for orders
    // This would be similar to the payout push but for individual orders
  }

  const deleteOrder = async (orderId: string) => {
    if (!confirm(`⚠️ Are you sure you want to delete order ${orderId}? This action cannot be undone!`)) {
      return
    }

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (response.ok) {
        console.log(`🗑️ Successfully deleted order:`, data.message)
        alert(`✅ Successfully deleted order ${orderId}`)
        
        // Remove the order from state
        setOrders(prev => prev.filter(o => String(o.id) !== orderId))
      } else {
        console.error('❌ Failed to delete order:', data.error)
        alert(`Failed to delete order: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error deleting order:', error)
      alert('Error deleting order from database')
    }
  }

  // Manual NetSuite ID functions
  const openNetSuiteIdDialog = (order: Order) => {
    setSelectedOrderForNetSuite(order)
    setNetSuiteIdInput('')
    setIsNetSuiteIdDialogOpen(true)
  }

  const openEditNetSuiteIdDialog = (item: Order | Payout) => {
    setSelectedOrderForEdit(item as Order)
    setEditingNetSuiteId(item.netsuiteDepositNumber || '')
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
        
        console.log(`✅ Added NetSuite ID "${netSuiteIdInput.trim()}" to order ${selectedOrderForNetSuite.name}`)
        alert(`✅ NetSuite ID "${netSuiteIdInput.trim()}" added to order ${selectedOrderForNetSuite.name}`)
      } else {
        console.error('❌ Failed to save NetSuite ID:', data.error)
        alert(`Failed to save NetSuite ID: ${data.error}`)
      }
      
    } catch (error) {
      console.error('❌ Error saving NetSuite ID:', error)
      alert('Error saving NetSuite ID')
    }
  }

  const saveEditedNetSuiteId = async () => {
    if (!selectedOrderForEdit || !editingNetSuiteId.trim()) return
    
    try {
      // Determine if it's an order or payout based on the data structure
      const isOrder = 'financial_status' in selectedOrderForEdit
      const endpoint = isOrder ? `/api/orders/${selectedOrderForEdit.id}/netsuite` : `/api/payouts/${selectedOrderForEdit.id}/netsuite`
      
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
        // Update local state based on type
        if (isOrder) {
          setOrders(prev => prev.map(order => 
            order.id === selectedOrderForEdit.id 
              ? { ...order, netsuiteDepositNumber: editingNetSuiteId.trim() }
              : order
          ))
        } else {
          setAllPayouts(prev => prev.map(payout => 
            payout.id === selectedOrderForEdit.id 
              ? { ...payout, netsuiteDepositNumber: editingNetSuiteId.trim() }
              : payout
          ))
        }
        
        console.log('✅ NetSuite ID updated successfully:', data)
        alert('NetSuite ID updated successfully!')
        setIsEditNetSuiteIdDialogOpen(false)
        setEditingNetSuiteId('')
        setSelectedOrderForEdit(null)
      } else {
        console.error('❌ Error updating NetSuite ID:', data)
        alert('Error updating NetSuite ID: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('❌ Error updating NetSuite ID:', error)
      alert('Error updating NetSuite ID')
    }
  }

  // Filter orders based on current filter state and search term
  const filteredOrders = orders.filter(order => {
    // Search filter
    if (orderSearchTerm.trim()) {
      const searchLower = orderSearchTerm.toLowerCase()
      const orderName = order.name.toLowerCase()
      const orderId = String(order.id).toLowerCase()
      const amount = String(order.total_price).toLowerCase()
      const currency = order.currency.toLowerCase()
      
      if (!orderName.includes(searchLower) && 
          !orderId.includes(searchLower) && 
          !amount.includes(searchLower) && 
          !currency.includes(searchLower)) {
        return false
      }
    }

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

  // Load saved payouts and orders on component mount
  useEffect(() => {
    fetchSavedPayouts()
    fetchSavedOrders()
  }, [])

  // Combine saved payouts with fetched payouts for display
  const allPayouts = [...savedPayouts.map(p => ({
    id: p.id,
    date: p.date,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    inDatabase: true,
    addedToDatabaseAt: p.date, // Using date as proxy for now
    netsuiteDepositNumber: p.netsuiteDepositNumber
  })), ...payouts.filter(p => !p.inDatabase)]

  // Filter payouts based on selected filters
  const filteredPayouts = allPayouts.filter(payout => {
    // Search filter
    if (payoutSearchTerm.trim()) {
      const searchLower = payoutSearchTerm.toLowerCase()
      const payoutId = String(payout.id).toLowerCase()
      const amount = String(payout.amount).toLowerCase()
      const currency = payout.currency.toLowerCase()
      
      if (!payoutId.includes(searchLower) && 
          !amount.includes(searchLower) && 
          !currency.includes(searchLower)) {
        return false
      }
    }

    // NetSuite Status filter
    if (!filters.netsuiteStatus.all) {
      const hasNetSuiteId = !!payout.netsuiteDepositNumber
      const matchesNetSuite = (filters.netsuiteStatus.pushed && hasNetSuiteId) || 
                             (filters.netsuiteStatus.not_pushed && !hasNetSuiteId)
      if (!matchesNetSuite) return false
    }

    // Payout Status filter
    if (!filters.payoutStatus.all) {
      const matchesStatus = (filters.payoutStatus.paid && payout.status === 'paid') || 
                           (filters.payoutStatus.pending && payout.status === 'pending')
      if (!matchesStatus) return false
    }

    // Date Range filter
    if (!filters.dateRange.all) {
      if (filters.dateRange.recent) {
        const payoutDate = new Date(payout.date)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        if (payoutDate < thirtyDaysAgo) return false
      }
    }

    return true
  })


  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Overview</h2>
              <p className="text-slate-600">Welcome to Pirani Payout Sync - your Shopify to NetSuite integration hub.</p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600 mb-2">{savedPayouts.length}</div>
                  <div className="text-sm text-emerald-700">Saved Payouts</div>
                </div>
              </Card>
              
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {savedPayouts.filter(p => p.netsuiteDepositNumber).length}
                  </div>
                  <div className="text-sm text-blue-700">NetSuite Synced</div>
                </div>
              </Card>
              
              <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {savedPayouts.filter(p => !p.netsuiteDepositNumber).length}
                  </div>
                  <div className="text-sm text-orange-700">Ready for NS</div>
                </div>
              </Card>
              
              <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
                <div className="text-center">
                  <div className="text-3xl font-bold text-slate-600 mb-2">
                    {savedPayouts.reduce((sum, p) => sum + p.transactions.length, 0)}
                  </div>
                  <div className="text-sm text-slate-700">Total Transactions</div>
                </div>
              </Card>
            </div>
          </div>
        )
        
      case 'orders':
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
                      onClick={fetchOrders} 
                      disabled={isLoadingOrders}
                      className="flex items-center gap-2 h-9"
                      size="sm"
                    >
                      {isLoadingOrders ? <LoaderWithText text="Loading..." /> : (
                        <>
                          <Download className="h-4 w-4" />
                          Import All
                        </>
                      )}
                    </Button>

                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Order Name (#38266) or ID (6559002624257)"
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
                  </div>

                  {/* Results Count */}
                  <div className="text-sm text-muted-foreground">
                    {filteredOrders.length} of {orders.length}
                  </div>
                </div>

                {/* Orders Display */}
                {isLoadingOrders ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No orders found. Click "Import All Orders" or "Import by Name" to get started.
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
                                <span className="text-gray-500">••••••</span>
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
                                  ✓ In DB
                                </span>
                              )}
                              {order.netsuiteDepositNumber && (
                                <button 
                                  onClick={() => openEditNetSuiteIdDialog(order)}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer transition-colors"
                                  title="Click to edit NetSuite ID"
                                >
                                  ✓ NS: {order.netsuiteDepositNumber}
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
                                onClick={() => fetchOrderInfo(String(order.id))}
                                className="text-xs"
                              >
                                Order Info
                              </Button>
                              {order.inDatabase && !order.netsuiteDepositNumber && (
                                <>
                                  <Button 
                                    size="sm" 
                                    onClick={() => pushOrderToNetSuite(String(order.id))}
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
          </div>
        )
        
      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Settings</h2>
              <p className="text-slate-600">Configure your Shopify and NetSuite integration settings.</p>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Shopify Store URL</label>
                    <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                      https://pirani-life.myshopify.com
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Shopify Access Token</label>
                    <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                      ***configured***
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Shopify API Version</label>
                    <div className="p-3 bg-slate-50 rounded-md font-mono text-sm border">
                      2025-10
                    </div>
                  </div>
                  
                  {/* Privacy Settings */}
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium">Privacy Settings</label>
                        <p className="text-xs text-muted-foreground">Hide sensitive data in payout displays</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHideSensitiveData(!hideSensitiveData)}
                        className="flex items-center gap-2"
                      >
                        {hideSensitiveData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {hideSensitiveData ? 'Show' : 'Hide'} Data
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )
        
      case 'payouts':
        return renderPayoutsContent()
        
      case 'mappings-orders':
        return renderMappingsOrdersContent()
        
      case 'mappings-products':
        return renderMappingsProductsContent()
        
      case 'mappings-fulfillments':
        return renderMappingsFulfillmentsContent()
        
      case 'mappings-other':
        return renderMappingsOtherContent()
        
      default:
        return renderPayoutsContent()
    }
  }

  const renderPayoutsContent = () => (
    <div className="space-y-6">

      {/* Combined Payouts Management */}
            <Card>
              <CardContent className="pt-6">
                {/* Compact Controls */}
                <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b">
                  {/* Search Bar */}
                  <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                    <Input
                      placeholder="Search payouts by ID, amount, or currency..."
                      value={payoutSearchTerm}
                      onChange={(e) => setPayoutSearchTerm(e.target.value)}
                      className="h-9 flex-1"
                    />
                  </div>

                  {/* Filter and Import Controls */}
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setIsPayoutFiltersOpen(true)}
                      className="h-9 flex items-center gap-2"
                    >
                      <Filter className="h-4 w-4" />
                      Filters
                    </Button>

                    <Button 
                      onClick={importAllPayouts} 
                      disabled={isLoading}
                      className="flex items-center gap-2 h-9"
                      size="sm"
                    >
                      {isLoading ? <LoaderWithText text="Importing..." /> : (
                        <>
                          <Download className="h-4 w-4" />
                          Import All
                        </>
                      )}
                    </Button>

                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Payout ID"
                        value={payoutIdInput}
                        onChange={(e) => setPayoutIdInput(e.target.value)}
                        className="w-[120px] h-9"
                      />
                      <Button 
                        onClick={importPayoutById} 
                        disabled={isLoading || !payoutIdInput.trim()}
                        className="h-9"
                        size="sm"
                      >
                        Import
                      </Button>
                    </div>
                  </div>

                  {/* Results Count */}
                  <div className="text-sm text-muted-foreground">
                    {filteredPayouts.length} of {allPayouts.length}
                  </div>
                </div>

          {/* Payouts Display */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : allPayouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payouts found. Click "Import All Payouts" or "Import by ID" to get started.
            </div>
          ) : filteredPayouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payouts match the current filters. Try adjusting your filter criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPayouts.map((payout) => (
                <Card key={payout.id} className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Left side - Payout info */}
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-semibold text-sm">
                          #{String(payout.id).slice(-8)}
                        </h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          payout.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {payout.status}
                        </span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        {safeToLocaleDateString(payout.date)}
                      </div>
                      
                      <div className="font-bold">
                        {hideSensitiveData ? (
                          <span className="text-gray-500">••••••</span>
                        ) : (
                          `${payout.currency} ${Number(payout.amount).toFixed(2)}`
                        )}
                      </div>
                    </div>

                    {/* Right side - Status badges and actions */}
                    <div className="flex items-center space-x-4">
                      {/* Status Badges */}
                      <div className="flex items-center space-x-2">
                        {payout.inDatabase && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ In DB
                          </span>
                        )}
                        {payout.netsuiteDepositNumber && (
                          <button 
                            onClick={() => openEditNetSuiteIdDialog(payout)}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer transition-colors"
                            title="Click to edit NetSuite ID"
                          >
                            ✓ NS: {payout.netsuiteDepositNumber}
                          </button>
                        )}
                        {payout.inDatabase && !payout.netsuiteDepositNumber && (
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
                           onClick={() => fetchTransactions(String(payout.id))}
                           disabled={isLoadingTransactions}
                           className="text-xs"
                         >
                           View Transactions
                         </Button>
                         {payout.inDatabase && !payout.netsuiteDepositNumber && (
                           <Button 
                             size="sm" 
                             onClick={() => pushToNetSuite(String(payout.id))}
                             className="bg-blue-600 hover:bg-blue-700 text-xs px-3"
                           >
                             Push to NS
                           </Button>
                         )}
                         {payout.inDatabase && (
                           <Button 
                             variant="outline" 
                             size="sm" 
                             onClick={() => deletePayout(String(payout.id))}
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

          {/* Transactions Dialog */}
          <TransactionsDialog
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            payoutId={selectedPayoutId}
            transactions={selectedPayoutTransactions}
            isLoading={isLoadingTransactions}
            hideSensitiveData={hideSensitiveData}
          />
        </CardContent>
      </Card>

      {/* Payout Filters Dialog */}
      <Dialog open={isPayoutFiltersOpen} onOpenChange={setIsPayoutFiltersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filter content just for you</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">NETSUITE STATUS</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.netsuiteStatus.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
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
                    checked={filters.netsuiteStatus.not_pushed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
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
                    checked={filters.netsuiteStatus.pushed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">PAYOUT STATUS</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.payoutStatus.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: checked,
                          paid: checked ? false : prev.payoutStatus.paid,
                          pending: checked ? false : prev.payoutStatus.pending
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
                    checked={filters.payoutStatus.paid}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: false,
                          paid: checked,
                          pending: prev.payoutStatus.pending
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
                    checked={filters.payoutStatus.pending}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
                        ...prev,
                        payoutStatus: {
                          all: false,
                          paid: prev.payoutStatus.paid,
                          pending: checked
                        }
                      }))
                    }}
                    className="w-4 h-4 rounded border-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Pending</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">DATE RANGE</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.dateRange.all}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
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
                    checked={filters.dateRange.recent}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFilters(prev => ({
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
              onClick={() => setFilters({ 
                netsuiteStatus: { all: true, not_pushed: false, pushed: false },
                payoutStatus: { all: true, paid: false, pending: false },
                dateRange: { all: true, recent: false }
              })}
              className="text-slate-600"
            >
              Clear
            </Button>
            <Button 
              onClick={() => setIsPayoutFiltersOpen(false)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Apply Filters
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )

  // Mapping Content Functions
  const renderMappingsOrdersContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Order Mappings</h2>
        <p className="text-slate-600">Configure how Shopify orders map to NetSuite transactions.</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Default payment method to post when no match found</span>
              <Select defaultValue="do-not-post">
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="do-not-post">Do Not Post</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit-card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="font-medium text-slate-700">Shopify Payment Method</div>
                <div className="font-medium text-slate-700">NetSuite Payment Option</div>
              </div>
              
              {[
                { shopify: 'Visa', netsuite: 'Shopify DTC Payout' },
                { shopify: 'Mastercard', netsuite: 'Shopify DTC Payout' },
                { shopify: 'American Express', netsuite: 'Shopify DTC Payout' },
                { shopify: 'Discover', netsuite: 'Shopify DTC Payout' },
                { shopify: 'shopify_payments', netsuite: 'Shopify DTC Payout' },
                { shopify: 'unknown', netsuite: '$0 Sales' },
                { shopify: '(blank)', netsuite: '$0 Sales' }
              ].map((mapping, index) => (
                <div key={index} className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
                  <div className="text-slate-700">{mapping.shopify}</div>
                  <div className="flex items-center gap-2">
                    <Select defaultValue={mapping.netsuite}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Shopify DTC Payout">Shopify DTC Payout</SelectItem>
                        <SelectItem value="$0 Sales">$0 Sales</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Credit Card">Credit Card</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm">
                      <Database className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderMappingsProductsContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Product Mappings</h2>
        <p className="text-slate-600">Configure how Shopify products map to NetSuite items.</p>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Database className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Product Mappings</h3>
            <p className="text-slate-500">Configure product mappings between Shopify and NetSuite.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderMappingsFulfillmentsContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Fulfillment Mappings</h2>
        <p className="text-slate-600">Configure how Shopify fulfillments map to NetSuite transactions.</p>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Database className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Fulfillment Mappings</h3>
            <p className="text-slate-500">Configure fulfillment mappings between Shopify and NetSuite.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderMappingsOtherContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Other Transaction Mappings</h2>
        <p className="text-slate-600">Configure how other Shopify transactions map to NetSuite.</p>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Database className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">Other Transaction Mappings</h3>
            <p className="text-slate-500">Configure other transaction mappings between Shopify and NetSuite.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="flex-1 p-8 overflow-auto">
        {renderContent()}
      </div>
    </div>
  )

}







