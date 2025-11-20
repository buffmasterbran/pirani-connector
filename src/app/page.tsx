'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { PayoutCard } from '@/components/PayoutCard'
import { TransactionsDialog } from '@/components/TransactionsDialog'
import { OrderInfoDialog } from '@/components/OrderInfoDialog'
import { Sidebar } from '@/components/Sidebar'
import { Loader, LoaderWithText } from '@/components/Loader'
import { Download, Database, ArrowUpRight, Settings, Eye, EyeOff, Filter, Trash2, ChevronDown, ChevronUp, Loader2, X, HelpCircle, ChevronRight } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import { 
  validateOrderMappings, 
  getUnmappedPaymentMethods, 
  getUnmappedShipmentMethods,
  type MappingError,
  type PaymentMethodMapping,
  type ShipmentMethodMapping,
  type OrderFieldMapping,
  type OrderItemFieldMapping,
  type CustomerFieldMapping
} from '@/lib/mappingUtils'
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
  netsuiteDepositId?: string | null
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
  netsuiteDepositId: string | null
  transactions: Array<{
    id: string
    source_order_id: string
    order_name?: string | null
    amount: number
    fee: number
    net: number
    type: string
    currency: string
    processedAt: string | null
    netsuiteTransactionId?: string | null
    netsuiteTransactionName?: string | null
    netsuiteAmount?: number | null
  }>
}

export default function Home() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [netsuitePreviewDialog, setNetsuitePreviewDialog] = useState<{
    isOpen: boolean
    payoutId: string | null
    previewData: {
      depositRequest: any
      stats: {
        totalTransactions: number
        transactionsWithNS: number
        depositItemsCount: number
        totalFees: number
      }
    } | null
    isLoading: boolean
  }>({
    isOpen: false,
    payoutId: null,
    previewData: null,
    isLoading: false,
  })
  const [selectedPayoutTransactions, setSelectedPayoutTransactions] = useState<Transaction[]>([])
  const [selectedPayoutTotalAmount, setSelectedPayoutTotalAmount] = useState<number | null>(null)
  const [selectedPayoutCurrency, setSelectedPayoutCurrency] = useState<string>('USD')
  const [savedPayouts, setSavedPayouts] = useState<SavedPayout[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  
  // Customers and Addresses state
  const [customers, setCustomers] = useState<any[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null)
  
  const [addresses, setAddresses] = useState<any[]>([])
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [addressSearchTerm, setAddressSearchTerm] = useState('')
  const [addressTypeFilter, setAddressTypeFilter] = useState<string>('all')
  const [hasNetSuiteIdFilter, setHasNetSuiteIdFilter] = useState<string>('all')
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [payoutIdInput, setPayoutIdInput] = useState('')
  const [hideSensitiveData, setHideSensitiveData] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('orders')
  const [activeMappingTab, setActiveMappingTab] = useState('Payment')
  const [activeSettingsTab, setActiveSettingsTab] = useState('General')
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{isOpen: boolean, itemType: string, itemName: string, itemId: string}>({
    isOpen: false,
    itemType: '',
    itemName: '',
    itemId: ''
  })
  const [clearDbDialog, setClearDbDialog] = useState<{isOpen: boolean, isClearing: boolean}>({
    isOpen: false,
    isClearing: false
  })

  // Mapping error popup dialog state
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

  // Custom field state for each mapping row
  const [customFields, setCustomFields] = useState<{[key: string]: string}>({})

  // Error tracking for mapping validation
  const [mappingErrors, setMappingErrors] = useState<any[]>([])
  const [unmappedPaymentMethods, setUnmappedPaymentMethods] = useState<string[]>([])
  const [unmappedShipmentMethods, setUnmappedShipmentMethods] = useState<string[]>([])

  // Mapping data state - Updated to use Shopify codes and NetSuite IDs
  const [paymentMappings, setPaymentMappings] = useState<PaymentMethodMapping[]>([
    { id: '1', shopifyCode: 'shopify_payments', netsuiteId: '177', isActive: true },
    { id: '2', shopifyCode: 'visa', netsuiteId: '228', isActive: true },
    { id: '3', shopifyCode: 'mastercard', netsuiteId: '228', isActive: true },
    { id: '4', shopifyCode: 'american_express', netsuiteId: '228', isActive: true },
    { id: '5', shopifyCode: 'discover', netsuiteId: '228', isActive: true },
    { id: '6', shopifyCode: 'unknown', netsuiteId: '0', isActive: true },
    { id: '7', shopifyCode: 'blank', netsuiteId: '0', isActive: true }
  ])

  const [shipmentMappings, setShipmentMappings] = useState<ShipmentMethodMapping[]>([
    { id: '1', shopifyCode: 'free_shipping', netsuiteId: '293', isActive: true },
    { id: '2', shopifyCode: 'standard_shipping', netsuiteId: '288', isActive: true },
    { id: '3', shopifyCode: 'local_pickup', netsuiteId: '1035', isActive: true },
    { id: '4', shopifyCode: 'asheville', netsuiteId: '1035', isActive: true },
    { id: '5', shopifyCode: 'flat_rate', netsuiteId: '288', isActive: true },
    { id: '6', shopifyCode: 'ups_ground', netsuiteId: '4', isActive: true },
    { id: '7', shopifyCode: 'dhl', netsuiteId: '1222', isActive: true },
    { id: '8', shopifyCode: 'dhl_express_worldwide', netsuiteId: '1222', isActive: true },
    { id: '9', shopifyCode: 'economy_international', netsuiteId: '1036', isActive: true }
  ])

  const [orderMappings, setOrderMappings] = useState<OrderFieldMapping[]>([])

  const [orderItemMappings, setOrderItemMappings] = useState<OrderItemFieldMapping[]>([
    { id: '1', mappingType: 'Fixed', shopifyValue: 'Base Rate (MSRP)', netsuiteId: '1', applyToAllAccounts: false, isActive: true },
    { id: '2', mappingType: 'Order Line', shopifyCode: 'properties._pca_preview_url', netsuiteId: 'custcol_custom_image_url', applyToAllAccounts: false, isActive: true },
    { id: '3', mappingType: 'Order Line', shopifyCode: 'properties._pca_barcode', netsuiteId: 'custcol_customization_barcode', applyToAllAccounts: false, isActive: true },
    { id: '4', mappingType: 'Order Line', shopifyCode: 'properties.CustomizationType', netsuiteId: 'custcol_item_notes', applyToAllAccounts: false, isActive: true },
    { id: '5', mappingType: 'Order Line', shopifyCode: 'properties.CustomizationValue', netsuiteId: 'custcol_item_notes_2', applyToAllAccounts: false, isActive: true },
    { id: '6', mappingType: 'Order Line', shopifyCode: 'properties.CustomizationFont', netsuiteId: 'custcol_item_notes_font', applyToAllAccounts: false, isActive: true }
  ])

  const [customerMappings, setCustomerMappings] = useState<CustomerFieldMapping[]>([
    { id: '1', mappingType: 'Fixed', shopifyValue: '6 Pirani Life : Websales', netsuiteId: '1833', applyToAllAccounts: true, isActive: true },
    { id: '2', mappingType: 'Fixed', shopifyValue: 'Base Rate (MSRP)', netsuiteId: '1', applyToAllAccounts: true, isActive: true },
    { id: '3', mappingType: 'Fixed', shopifyValue: 'Pirani Life, Inc', netsuiteId: '2', applyToAllAccounts: true, isActive: true },
    { id: '4', mappingType: 'Fixed', shopifyValue: 'Direct to Consumer', netsuiteId: '28', applyToAllAccounts: true, isActive: true },
    { id: '5', mappingType: 'Fixed', shopifyValue: 'Direct to Consumer', netsuiteId: '1', applyToAllAccounts: true, isActive: true },
    { id: '6', mappingType: 'Fixed', shopifyValue: 'Pirani Website', netsuiteId: '12', applyToAllAccounts: true, isActive: true }
  ])
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
  const [importLimit, setImportLimit] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false)
  
  // Manual NetSuite ID state
  const [isNetSuiteIdDialogOpen, setIsNetSuiteIdDialogOpen] = useState(false)
  const [netsuitePayloadDialog, setNetsuitePayloadDialog] = useState<{
    isOpen: boolean
    orderId: string | null
    payload: any | null
    customerInfo: any | null
    addressInfo: any | null
    isLoading: boolean
  }>({
    isOpen: false,
    orderId: null,
    payload: null,
    customerInfo: null,
    addressInfo: null,
    isLoading: false,
  })
  const [selectedOrderForNetSuite, setSelectedOrderForNetSuite] = useState<Order | null>(null)
  const [netSuiteIdInput, setNetSuiteIdInput] = useState('')

  // Add NetSuite Mapping Dialog state
  const [isAddNetSuiteMappingDialogOpen, setIsAddNetSuiteMappingDialogOpen] = useState(false)
  const [selectedNetSuiteField, setSelectedNetSuiteField] = useState<string>('')
  const [selectedNetSuiteValue, setSelectedNetSuiteValue] = useState<string>('')
  const [customNetSuiteFieldName, setCustomNetSuiteFieldName] = useState<string>('')
  const [netsuiteListItems, setNetsuiteListItems] = useState<Array<{ id: string; name: string; [key: string]: any }>>([])
  const [isLoadingNetSuiteList, setIsLoadingNetSuiteList] = useState(false)
  const [editingMappingIndex, setEditingMappingIndex] = useState<number | null>(null)
  // Custom field info state
  const [customFieldInfo, setCustomFieldInfo] = useState<{
    fieldType: 'select' | 'text' | 'date' | 'checkbox' | 'integer' | 'currency' | 'percent' | null
    listItems: Array<{ value: string; text: string }>
  } | null>(null)
  const [isLoadingCustomFieldInfo, setIsLoadingCustomFieldInfo] = useState(false)
  const [customFieldValue, setCustomFieldValue] = useState<string>('')
  // Cache for custom field info by field ID (for displaying labels)
  const [customFieldInfoCache, setCustomFieldInfoCache] = useState<Record<string, {
    fieldType: string
    listItems: Array<{ value: string; text: string }>
  }>>({})
  
  // Custom Shopify field selector dialog state
  const [isCustomShopifyFieldDialogOpen, setIsCustomShopifyFieldDialogOpen] = useState(false)
  const [customShopifyOrderId, setCustomShopifyOrderId] = useState<string>('')
  const [customShopifyOrderData, setCustomShopifyOrderData] = useState<any>(null)
  const [isLoadingCustomShopifyOrder, setIsLoadingCustomShopifyOrder] = useState(false)
  const [selectedCustomShopifyField, setSelectedCustomShopifyField] = useState<string>('')
  
  // Store NetSuite list items per field for dropdowns in table rows
  const [netsuiteListCache, setNetsuiteListCache] = useState<Record<string, Array<{ id: string; name: string; [key: string]: any }>>>({})
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())
  
  // Fields that require dropdown lookups
  const fieldsWithDropdowns = ['class', 'location', 'partner', 'subsidiary', 'currency', 'terms', 'department', 'account', 'shipMethod', 'taxCode', 'priceLevel', 'units']
  
  // Helper function to flatten nested objects for display
  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const flattened: Record<string, any> = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, flattenObject(obj[key], newKey))
        } else {
          flattened[newKey] = obj[key]
        }
      }
    }
    return flattened
  }

  // Fetch Shopify order for custom field selector
  const handleFetchCustomShopifyOrder = async () => {
    if (!customShopifyOrderId.trim()) return
    
    setIsLoadingCustomShopifyOrder(true)
    try {
      // Remove # if present
      const orderId = customShopifyOrderId.replace(/^#/, '')
      const response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(orderId)}`)
      const data = await response.json()
      
      if (data.order) {
        setCustomShopifyOrderData(data.order)
      } else {
        alert(`Order ${customShopifyOrderId} not found`)
      }
    } catch (error) {
      console.error('Error fetching Shopify order:', error)
      alert('Failed to fetch order from Shopify')
    } finally {
      setIsLoadingCustomShopifyOrder(false)
    }
  }

  // Fetch NetSuite custom field information
  const handleFetchCustomFieldInfo = async () => {
    if (!customNetSuiteFieldName.trim()) {
      setCustomFieldInfo(null)
      return
    }

    setIsLoadingCustomFieldInfo(true)
    setCustomFieldInfo(null)
    setCustomFieldValue('')

    try {
      const response = await fetch('/api/netsuite/field-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordType: 'salesorder',
          fieldId: customNetSuiteFieldName.trim(),
        }),
      })

      const result = await response.json()

      if (result.success && result.data) {
        const fieldInfo = {
          fieldType: result.data.fieldType,
          listItems: result.data.listItems || [],
        }
        setCustomFieldInfo(fieldInfo)
        // Cache the field info for later use when displaying mappings
        if (customNetSuiteFieldName.trim()) {
          setCustomFieldInfoCache(prev => ({
            ...prev,
            [customNetSuiteFieldName.trim()]: fieldInfo
          }))
        }
      } else {
        alert(result.error || 'Failed to fetch field information')
        setCustomFieldInfo(null)
      }
    } catch (error) {
      console.error('Error fetching custom field info:', error)
      alert('Error fetching field information from NetSuite')
      setCustomFieldInfo(null)
    } finally {
      setIsLoadingCustomFieldInfo(false)
    }
  }
  
  // Extract ID from shopifyValue format "Name (IID: id)"
  const extractIdFromShopifyValue = (shopifyValue?: string): string => {
    if (!shopifyValue) return ''
    const match = shopifyValue.match(/\(IID:\s*(\d+)\)/)
    return match ? match[1] : ''
  }

  // Get display text for a custom field value (looks up label from cached field info)
  const getCustomFieldDisplayText = (mapping: OrderFieldMapping): string => {
    if (mapping.mappingType !== 'Custom' || !mapping.shopifyValue) {
      return mapping.shopifyValue || mapping.shopifyCode || ''
    }

    const fieldId = mapping.customFieldId || mapping.netsuiteId
    const fieldInfo = customFieldInfoCache[fieldId]
    
    if (fieldInfo && fieldInfo.listItems && fieldInfo.listItems.length > 0) {
      // Look up the label for this value
      const item = fieldInfo.listItems.find(item => item.value === mapping.shopifyValue)
      if (item) {
        return `${item.text} (${mapping.shopifyValue})`
      }
    }

    // Fallback: just return the value
    return mapping.shopifyValue
  }

  // Fetch field info for a custom field if not cached (for displaying existing mappings)
  const ensureCustomFieldInfoLoaded = async (fieldId: string) => {
    if (customFieldInfoCache[fieldId]) {
      return // Already cached
    }

    try {
      const response = await fetch('/api/netsuite/field-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordType: 'salesorder',
          fieldId: fieldId,
        }),
      })

      const result = await response.json()
      if (result.success && result.data) {
        setCustomFieldInfoCache(prev => ({
          ...prev,
          [fieldId]: {
            fieldType: result.data.fieldType,
            listItems: result.data.listItems || [],
          }
        }))
      }
    } catch (error) {
      console.error('Error fetching field info for display:', error)
      // Silently fail - we'll just show the value without label
    }
  }
  
  // Fetch NetSuite list for a field and cache it
  const fetchNetSuiteListForField = async (field: string) => {
    if (!fieldsWithDropdowns.includes(field) || netsuiteListCache[field]) {
      return // Already cached or doesn't need lookup
    }
    
    setLoadingFields(prev => new Set(prev).add(field))
    try {
      const response = await fetch(`/api/netsuite/lists?field=${field}`)
      const data = await response.json()
      if (data.success && data.items) {
        setNetsuiteListCache(prev => ({ ...prev, [field]: data.items }))
      }
    } catch (error) {
      console.error(`Error fetching NetSuite list for ${field}:`, error)
    } finally {
      setLoadingFields(prev => {
        const next = new Set(prev)
        next.delete(field)
        return next
      })
    }
  }

  // Fetch NetSuite list when a field requiring dropdown is selected
  useEffect(() => {
    if (isAddNetSuiteMappingDialogOpen && selectedNetSuiteField && fieldsWithDropdowns.includes(selectedNetSuiteField)) {
      setIsLoadingNetSuiteList(true)
      setSelectedNetSuiteValue('')
      setNetsuiteListItems([])
      
      fetch(`/api/netsuite/lists?field=${selectedNetSuiteField}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.items) {
            setNetsuiteListItems(data.items)
          } else {
            console.error('Error fetching NetSuite list:', data.error)
            setNetsuiteListItems([])
          }
        })
        .catch(error => {
          console.error('Error fetching NetSuite list:', error)
          setNetsuiteListItems([])
        })
        .finally(() => {
          setIsLoadingNetSuiteList(false)
        })
    } else if (selectedNetSuiteField && !fieldsWithDropdowns.includes(selectedNetSuiteField)) {
      // Clear the value dropdown if field doesn't need it
      setSelectedNetSuiteValue('')
      setNetsuiteListItems([])
    }
  }, [selectedNetSuiteField, isAddNetSuiteMappingDialogOpen])

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
  const [orderRangeStart, setOrderRangeStart] = useState('')
  const [orderRangeEnd, setOrderRangeEnd] = useState('')
  const [payoutRangeStart, setPayoutRangeStart] = useState('')
  const [payoutRangeEnd, setPayoutRangeEnd] = useState('')

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true)
    try {
      const response = await fetch('/api/customers?includeAddresses=true')
      const data = await response.json()
      if (response.ok && data.success) {
        setCustomers(data.customers || [])
        console.log(`✅ Loaded ${data.customers?.length || 0} customers from database`)
      } else {
        console.error('Error fetching customers:', data.error)
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setIsLoadingCustomers(false)
    }
  }

  const fetchAddresses = async () => {
    setIsLoadingAddresses(true)
    try {
      const params = new URLSearchParams()
      if (addressTypeFilter !== 'all') {
        params.append('addressType', addressTypeFilter)
      }
      if (hasNetSuiteIdFilter !== 'all') {
        params.append('hasNetSuiteId', hasNetSuiteIdFilter)
      }
      
      const response = await fetch(`/api/addresses?${params.toString()}`)
      const data = await response.json()
      if (response.ok && data.success) {
        setAddresses(data.addresses || [])
        console.log(`✅ Loaded ${data.addresses?.length || 0} addresses from database`)
      } else {
        console.error('Error fetching addresses:', data.error)
      }
    } catch (error) {
      console.error('Error fetching addresses:', error)
    } finally {
      setIsLoadingAddresses(false)
    }
  }

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
        const fetchedOrders = data.orders || []
        console.log(`✅ Loaded ${fetchedOrders.length} saved orders from database`)

        setOrders(fetchedOrders.slice(0, 100))
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
            addedToDatabaseAt: (savedPayout as any)?.createdAt || undefined,
            netsuiteDepositNumber: (savedPayout as any)?.netsuiteDepositNumber || null
          }
        })
        
        setPayouts(updatedPayouts)
      }
    } catch (error) {
      console.error('Error checking payout database status:', error)
    }
  }

  const importAllPayouts = async (fetchAll: boolean = false, maxPayouts?: number) => {
    console.log(`🚀 Starting ${fetchAll ? 'import ALL payouts' : 'import recent payouts'}...`)
    setIsLoading(true)
    try {
      let url = '/api/shopify/payouts'
      if (fetchAll) {
        url += '?all=true'
        if (maxPayouts) {
          url += `&limit=${maxPayouts}`
        }
      }
      
      console.log(`📡 Fetching payouts from Shopify API... (${fetchAll ? 'paginated' : 'single page'})`)
      const response = await fetch(url)
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

  const importPayoutsByRange = async () => {
    const start = parseInt(payoutRangeStart.trim())
    const end = parseInt(payoutRangeEnd.trim())
    
    if (!payoutRangeStart.trim() || !payoutRangeEnd.trim()) {
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
    
    // Calculate the limit: if start is 1 and end is 10, we want 10 payouts
    const limit = end
    
    setIsLoading(true)
    try {
      console.log(`🔄 Importing the most recent ${limit} payouts (positions ${start}-${end})...`)
      
      // Fetch the specified number of payouts (most recent first)
      const response = await fetch(`/api/shopify/payouts?limit=${limit}`)
      const data = await response.json()
      
      if (response.ok) {
        const fetchedPayouts = data.payouts || []
        console.log(`✅ Fetched ${fetchedPayouts.length} payouts from Shopify`)
        
        if (fetchedPayouts.length === 0) {
          alert(`No payouts found`)
        } else {
          // Slice to get only the range requested (e.g., if start=1, end=10, get payouts 0-9)
          const rangePayouts = fetchedPayouts.slice(start - 1, end)
          
          // Check database status first
          await checkPayoutDatabaseStatus(rangePayouts)
          
          // Save payouts to database
          await saveNewPayoutsOnly(rangePayouts)
          
          setPayouts(rangePayouts)
          alert(`Successfully imported ${rangePayouts.length} payouts (positions ${start}-${end} of ${fetchedPayouts.length} total)`)
        }
      } else {
        console.error('❌ Error fetching payouts:', data.error)
        alert(`Error fetching payouts: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error importing payouts by range:', error)
      alert('Error importing payouts by range: ' + error)
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
    
    // Process all payouts to ensure transactions are imported (even for existing payouts)
    const payoutsToProcess = payoutsToSave.length > 0 ? payoutsToSave : []
    
    if (payoutsToProcess.length === 0) {
      console.log('ℹ️ No payouts to process')
      return
    }
    
    for (const payout of payoutsToProcess) {
      console.log(`💾 Processing payout ${payout.id}...`)
      try {
        // Fetch transactions for this payout from Shopify
        console.log(`📡 Fetching transactions for payout ${payout.id} from Shopify...`)
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
      const response = await fetch(`/api/payouts/${payoutId}/transactions`)
      const data = await response.json()
      if (response.ok) {
        setSelectedPayoutTransactions(data.transactions || [])
        setSelectedPayoutTotalAmount(data.payoutTotalAmount ?? null)
        setSelectedPayoutCurrency(data.payoutCurrency || 'USD')
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
    // First, get the preview of what will be sent
    setNetsuitePreviewDialog({
      isOpen: true,
      payoutId,
      previewData: null,
      isLoading: true,
    })

    try {
      const previewResponse = await fetch(`/api/payouts/${payoutId}/preview-deposit`)
      const previewData = await previewResponse.json()

      if (!previewResponse.ok || !previewData.success) {
        setNetsuitePreviewDialog({
          isOpen: false,
          payoutId: null,
          previewData: null,
          isLoading: false,
        })
        alert(`Cannot preview deposit:\n\n${JSON.stringify(previewData, null, 2)}`)
        return
      }

      // Log to console for easy copying
      console.log('📋 NetSuite Deposit Preview:', {
        stats: previewData.stats,
        depositRequest: previewData.depositRequest,
      })
      console.log('📋 JSON Body to be sent:', JSON.stringify(previewData.depositRequest, null, 2))

      setNetsuitePreviewDialog({
        isOpen: true,
        payoutId,
        previewData,
        isLoading: false,
      })
    } catch (error) {
      console.error('❌ Error previewing deposit:', error)
      setNetsuitePreviewDialog({
        isOpen: false,
        payoutId: null,
        previewData: null,
        isLoading: false,
      })
      alert(`Error previewing deposit: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleCreateNetSuiteDeposit = async () => {
    if (!netsuitePreviewDialog.payoutId) return

    setNetsuitePreviewDialog(prev => ({ ...prev, isLoading: true }))

    try {
      const response = await fetch(`/api/payouts/${netsuitePreviewDialog.payoutId}/create-deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        const text = await response.text()
        console.error('❌ Failed to parse response:', parseError, 'Response text:', text)
        setNetsuitePreviewDialog({
          isOpen: false,
          payoutId: null,
          previewData: null,
          isLoading: false,
        })
        alert(`Failed to parse response:\n\n${text}`)
        return
      }

      setNetsuitePreviewDialog({
        isOpen: false,
        payoutId: null,
        previewData: null,
        isLoading: false,
      })

      if (response.ok && data.success) {
        console.log(`✅ Successfully created NetSuite deposit:`, data)
        const fullResponse = JSON.stringify(data, null, 2)
        alert(`✅ Successfully created NetSuite deposit!\n\nFull Response:\n${fullResponse}`)
        
        // Refresh payouts to show the new deposit ID
        fetchSavedPayouts()
      } else {
        console.error('❌ Failed to create NetSuite deposit:', data)
        const fullResponse = JSON.stringify(data, null, 2)
        alert(`Failed to create NetSuite deposit:\n\nFull Response:\n${fullResponse}`)
      }
    } catch (error) {
      console.error('❌ Error creating NetSuite deposit:', error)
      const errorDetails = error instanceof Error 
        ? JSON.stringify({ message: error.message, stack: error.stack }, null, 2)
        : JSON.stringify(error, null, 2)
      setNetsuitePreviewDialog({
        isOpen: false,
        payoutId: null,
        previewData: null,
        isLoading: false,
      })
      alert(`Error creating NetSuite deposit:\n\n${errorDetails}`)
    }
  }

  const clearNetSuiteDepositId = async (payoutId: string, e?: React.MouseEvent) => {
    // Prevent event bubbling if event is provided
    if (e) {
      e.stopPropagation()
    }

    if (!confirm(`⚠️ Are you sure you want to clear the NetSuite Deposit ID for payout ${payoutId}? This will allow you to retest creating the deposit.`)) {
      return
    }

    try {
      const response = await fetch(`/api/payouts/${payoutId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clearNetsuiteDepositId: true }),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        console.log(`✅ Successfully cleared NetSuite deposit ID:`, data.message)
        
        // Refresh payouts to show updated state
        fetchSavedPayouts()
      } else {
        console.error('❌ Failed to clear NetSuite deposit ID:', data.error)
        alert(`Failed to clear NetSuite deposit ID: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error clearing NetSuite deposit ID:', error)
      alert('Error clearing NetSuite deposit ID from database')
    }
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
      
      console.log(`🔄 ${fetchAll ? 'Fetching ALL orders' : 'Fetching recent orders'}...`)
      const response = await fetch(url)
      const data = await response.json()
      
      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`✅ Fetched ${fetchedOrders.length} orders from Shopify`)
        
        // Automatically save new orders to database
        await saveNewOrdersOnly(fetchedOrders)
        
        setOrders(fetchedOrders.slice(0, 100))
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
        console.log(`✅ Successfully saved orders to database: imported=${data.imported ?? 0}, updated=${data.updated ?? 0}`)
        
        // Update orders with database status - only update existing orders, don't replace the entire list
        setOrders(prevOrders => {
          return prevOrders.map(existingOrder => {
            const savedOrder = data.orders.find((saved: any) => saved.id === existingOrder.id)
            return savedOrder || existingOrder
          })
        })

        await fetchSavedOrders()
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
            console.log(`📝 Updating existing order ${order.name} in list`)
            return prevOrders.map(o => o.id === order.id ? order : o)
          } else {
            // Add new order
            console.log(`➕ Adding new order ${order.name} to list (total: ${prevOrders.length + 1})`)
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
      console.log(`🔄 Importing the most recent ${limit} orders (positions ${start}-${end})...`)
      
      // Fetch the specified number of orders (most recent first)
      const response = await fetch(`/api/shopify/orders?limit=${limit}`)
      const data = await response.json()
      
      if (response.ok) {
        const fetchedOrders = data.orders || []
        console.log(`✅ Fetched ${fetchedOrders.length} orders from Shopify`)
        
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
        console.error('❌ Error fetching orders:', data.error)
        alert(`Error fetching orders: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ Error importing orders by range:', error)
      alert('Error importing orders by range: ' + error)
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
    // First, fetch the preview payload
    setNetsuitePayloadDialog({
      isOpen: true,
      orderId,
      payload: null,
      isLoading: true,
    })

    try {
      // Fetch preview payload
      const previewResponse = await fetch(`/api/netsuite/push-order?shopifyOrderId=${orderId}`)
      const previewData = await previewResponse.json()

      if (previewResponse.ok && previewData.success) {
        setNetsuitePayloadDialog({
          isOpen: true,
          orderId,
          payload: previewData.payload,
          customerInfo: previewData.customerInfo || null,
          addressInfo: previewData.addressInfo || null,
          isLoading: false,
        })
      } else {
        alert(`❌ Failed to generate payload:\n\n${previewData.error || 'Unknown error'}`)
        setNetsuitePayloadDialog({
          isOpen: false,
          orderId: null,
          payload: null,
          customerInfo: null,
          addressInfo: null,
          isLoading: false,
        })
      }
    } catch (error) {
      console.error('Error fetching payload preview:', error)
      alert(`❌ Error fetching payload preview: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setNetsuitePayloadDialog({
        isOpen: false,
        orderId: null,
        payload: null,
        isLoading: false,
      })
    }
  }

  const confirmPushToNetSuite = async () => {
    if (!netsuitePayloadDialog.orderId) return

    try {
      const response = await fetch('/api/netsuite/push-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shopifyOrderId: netsuitePayloadDialog.orderId }),
      })

      const data = await response.json()

      // Close dialog
      setNetsuitePayloadDialog({
        isOpen: false,
        orderId: null,
        payload: null,
        isLoading: false,
      })

      if (response.ok && data.success) {
        alert(`✅ Successfully pushed order to NetSuite!\n\nSales Order ID: ${data.salesOrderId || 'N/A'}\nSales Order Name: ${data.salesOrderName || 'N/A'}${data.warnings && data.warnings.length > 0 ? `\n\nWarnings:\n${data.warnings.join('\n')}` : ''}`)
        
        // Refresh orders to show updated NetSuite IDs
        await fetchOrders()
      } else {
        const errorMsg = data.error || 'Unknown error occurred'
        const warnings = data.warnings && data.warnings.length > 0 ? `\n\nWarnings:\n${data.warnings.join('\n')}` : ''
        alert(`❌ Failed to push order to NetSuite:\n\n${errorMsg}${warnings}`)
        console.error('NetSuite push error:', data)
      }
    } catch (error) {
      console.error('Error pushing order to NetSuite:', error)
      alert(`❌ Error pushing order to NetSuite: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setNetsuitePayloadDialog({
        isOpen: false,
        orderId: null,
        payload: null,
        isLoading: false,
      })
    }
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
      const endpoint = isOrder ? `/api/orders/${(selectedOrderForEdit as any).id}/netsuite` : `/api/payouts/${(selectedOrderForEdit as any).id}/netsuite`
      
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
          setPayouts(prev => prev.map(payout => 
            payout.id === (selectedOrderForEdit as any).id 
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

  // Fetch mappings from database
  const fetchPaymentMappings = async () => {
    try {
      const response = await fetch('/api/mappings/payment-methods')
      const result = await response.json()
      if (result.success) {
        setPaymentMappings(result.data)
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

  const fetchOrderMappings = async () => {
    try {
      const response = await fetch('/api/mappings/order-fields')
      const result = await response.json()
      if (result.success) {
        setOrderMappings(result.data)
        // Pre-load field info for Custom mappings to show labels
        for (const mapping of result.data) {
          if (mapping.mappingType === 'Custom' && mapping.shopifyValue) {
            const fieldId = mapping.customFieldId || mapping.netsuiteId
            if (fieldId && !customFieldInfoCache[fieldId]) {
              ensureCustomFieldInfoLoaded(fieldId)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching order mappings:', error)
    }
  }

  const fetchOrderItemMappings = async () => {
    try {
      const response = await fetch('/api/mappings/order-item-fields')
      const result = await response.json()
      if (result.success) {
        setOrderItemMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching order item mappings:', error)
    }
  }

  const fetchCustomerMappings = async () => {
    try {
      const response = await fetch('/api/mappings/customer-fields')
      const result = await response.json()
      if (result.success) {
        setCustomerMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching customer mappings:', error)
    }
  }

  // Payout mappings state
  const [payoutMappings, setPayoutMappings] = useState<Array<{
    id: number
    mappingType: string
    netsuiteId: string
    description: string | null
    isActive: boolean
    isDefaultDepositAccount: boolean
    isDefaultFeesAccount: boolean
  }>>([])

  // Payout mapping edit dialog state
  const [payoutMappingEditDialog, setPayoutMappingEditDialog] = useState<{
    isOpen: boolean
    mapping: {
      id: number
      mappingType: string
      netsuiteId: string
      description: string | null
      isActive: boolean
      isDefaultDepositAccount: boolean
      isDefaultFeesAccount: boolean
    } | null
  }>({
    isOpen: false,
    mapping: null
  })

  const fetchPayoutMappings = async () => {
    try {
      const response = await fetch('/api/mappings/payout-mappings')
      const result = await response.json()
      if (result.success && result.data) {
        // API now returns flat array directly
        setPayoutMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching payout mappings:', error)
    }
  }

  const handleSetDefaultAccount = async (mappingId: number, defaultType: 'deposit_account' | 'fees_account') => {
    try {
      const response = await fetch('/api/mappings/payout-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'setDefault',
          mappingId,
          defaultType,
        }),
      })

      const result = await response.json()
      if (result.success) {
        await fetchPayoutMappings()
      } else {
        alert(`Failed to set default: ${result.error}`)
      }
    } catch (error) {
      console.error('Error setting default account:', error)
      alert('Error setting default account')
    }
  }

  // Payout mapping handlers
  const handleEditPayoutMapping = (mapping: {
    id: number
    mappingType: string
    netsuiteId: string
    description: string | null
    isActive: boolean
    isDefaultDepositAccount: boolean
    isDefaultFeesAccount: boolean
  }) => {
    setPayoutMappingEditDialog({
      isOpen: true,
      mapping: { ...mapping }
    })
  }

  const handleSavePayoutMapping = async (mapping: {
    id: number
    mappingType: string
    netsuiteId: string
    description: string | null
    isActive: boolean
    isDefaultDepositAccount: boolean
    isDefaultFeesAccount: boolean
  }) => {
    try {
      const response = await fetch(`/api/mappings/payout-mappings/${mapping.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mappingType: mapping.mappingType,
          netsuiteId: mapping.netsuiteId,
          description: mapping.description,
          isActive: mapping.isActive,
          isDefaultDepositAccount: mapping.isDefaultDepositAccount,
          isDefaultFeesAccount: mapping.isDefaultFeesAccount
        }),
      })

      const result = await response.json()

      if (result.success) {
        await fetchPayoutMappings()
        setPayoutMappingEditDialog({ isOpen: false, mapping: null })
      } else {
        alert(`Error updating payout mapping: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating payout mapping:', error)
      alert(`Error updating payout mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDeletePayoutMapping = async (mappingId: number) => {
    try {
      const response = await fetch(`/api/mappings/payout-mappings/${mappingId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        await fetchPayoutMappings()
        closeDeleteConfirmDialog()
      } else {
        alert(`Error deleting payout mapping: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting payout mapping:', error)
      alert(`Error deleting payout mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleAddPayoutMapping = () => {
    setPayoutMappingEditDialog({
      isOpen: true,
      mapping: {
        id: 0,
        mappingType: '',
        netsuiteId: '',
        description: '',
        isActive: true,
        isDefaultDepositAccount: false,
        isDefaultFeesAccount: false
      }
    })
  }

  const handleClearDatabase = async () => {
    setClearDbDialog({ isOpen: true, isClearing: true })
    try {
      const response = await fetch('/api/admin/clear-database', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Refresh all data
        fetchSavedPayouts()
        setClearDbDialog({ isOpen: false, isClearing: false })
        const stats = data.stats || {}
        alert(`Database cleared successfully!\n\nDeleted:\n- ${stats.transactions || 0} transactions\n- ${stats.payouts || 0} payouts\n- ${stats.orderLines || 0} order lines\n- ${stats.orders || 0} orders\n- ${stats.customerAddresses || 0} customer addresses\n- ${stats.customers || 0} customers`)
        
        // Refresh data if on relevant tabs
        if (activeSection === 'customers') {
          fetchCustomers()
        } else if (activeSection === 'addresses') {
          fetchAddresses()
        }
      } else {
        console.error('Error clearing database:', data.error)
        alert(`Error clearing database: ${data.error || 'Unknown error'}`)
        setClearDbDialog({ isOpen: false, isClearing: false })
      }
    } catch (error) {
      console.error('Error clearing database:', error)
      alert(`Error clearing database: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setClearDbDialog({ isOpen: false, isClearing: false })
    }
  }

  const handleCreatePayoutMapping = async (mapping: {
    mappingType: string
    netsuiteId: string
    description: string | null
    isActive: boolean
    isDefaultDepositAccount: boolean
    isDefaultFeesAccount: boolean
  }) => {
    try {
      const response = await fetch('/api/mappings/payout-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mapping),
      })

      const result = await response.json()

      if (result.success) {
        await fetchPayoutMappings()
        setPayoutMappingEditDialog({ isOpen: false, mapping: null })
      } else {
        alert(`Error creating payout mapping: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating payout mapping:', error)
      alert(`Error creating payout mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Load saved payouts and orders on component mount
  useEffect(() => {
    fetchSavedPayouts()
    fetchSavedOrders()
    // Load all mappings from database
    fetchPaymentMappings()
    fetchShipmentMappings()
    fetchOrderMappings()
    fetchOrderItemMappings()
    fetchCustomerMappings()
    fetchPayoutMappings()
  }, [])

  // Load customers and addresses when their sections are active
  useEffect(() => {
    if (activeSection === 'customers') {
      fetchCustomers()
    }
  }, [activeSection])

  useEffect(() => {
    if (activeSection === 'addresses') {
      fetchAddresses()
    }
  }, [activeSection, addressTypeFilter, hasNetSuiteIdFilter])

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

  // Combine saved payouts with fetched payouts for display
  const allPayouts = [...savedPayouts.map(p => ({
    id: p.id,
    date: p.date,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    inDatabase: true,
    addedToDatabaseAt: p.date, // Using date as proxy for now
    netsuiteDepositNumber: p.netsuiteDepositNumber,
    netsuiteDepositId: p.netsuiteDepositId
  })), ...payouts.filter(p => !p.inDatabase)]

  // Helper function to check if a payout has transactions with issues (missing cash sales, etc.)
  const hasMissingCashSale = (payout: typeof allPayouts[0]): boolean => {
    // Find the saved payout with transactions
    const savedPayout = savedPayouts.find(sp => String(sp.id) === String(payout.id))
    if (!savedPayout || !savedPayout.transactions) return false
    
    // Check if any transaction has an order_name but no netsuiteTransactionName
    return savedPayout.transactions.some((transaction: any) => {
      const hasOrderName = transaction.order_name && 
                          transaction.order_name !== '—' && 
                          transaction.order_name !== 'N/A'
      const missingNetSuiteName = !transaction.netsuiteTransactionName || 
                                  transaction.netsuiteTransactionName === null ||
                                  transaction.netsuiteTransactionName === ''
      return hasOrderName && missingNetSuiteName
    })
  }

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
            
            {/* Clear Database Button */}
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-red-900 mb-1">Database Management</h3>
                    <p className="text-sm text-red-700">Clear all payouts, transactions, and order lines from the database.</p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setClearDbDialog({ isOpen: true, isClearing: false })}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Database
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                              {/* Mapping Error Indicators */}
                              {mappingErrors.filter(error => error.orderId === order.id).length > 0 && (
                                <button
                                  onClick={() => openMappingErrorDialog(String(order.id), order.name)}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer transition-colors"
                                >
                                  ⚠ Mapping Error
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
            
            {/* Settings Navigation Tabs */}
            <div className="flex space-x-1 border-b">
              {['General', 'Field Discovery'].map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  onClick={() => setActiveSettingsTab(tab)}
                  className={`px-4 py-2 text-sm font-medium ${
                    tab === activeSettingsTab
                      ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* General Settings Tab */}
            {activeSettingsTab === 'General' && (
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
            )}

            {/* Field Discovery Tab */}
            {activeSettingsTab === 'Field Discovery' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      NetSuite Field Discovery
                    </CardTitle>
                    <p className="text-sm text-slate-600">
                      Discover and map NetSuite field IDs to human-readable names. This helps complete your mapping configuration.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      
                      {/* Payment Methods Discovery */}
                      <div>
                        <h4 className="font-medium text-slate-800 mb-3">Payment Methods</h4>
                        <div className="bg-slate-50 p-4 rounded-lg">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="text-sm font-medium text-slate-700">Unknown Payment Method IDs</label>
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 177</span>
                                  <span className="text-green-600 text-sm">✅ Shopify Payments (mapped)</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 228</span>
                                  <span className="text-green-600 text-sm">✅ Visa/Mastercard/Amex (mapped)</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-slate-700">NetSuite API Endpoint</label>
                              <div className="mt-2 p-3 bg-white rounded border font-mono text-sm">
                                GET /record/v1/paymentmethod
                              </div>
                              <Button className="mt-2 w-full" size="sm">
                                <Database className="h-4 w-4 mr-2" />
                                Fetch Payment Methods
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Shipping Methods Discovery */}
                      <div>
                        <h4 className="font-medium text-slate-800 mb-3">Shipping Methods</h4>
                        <div className="bg-slate-50 p-4 rounded-lg">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="text-sm font-medium text-slate-700">Unknown Shipping Method IDs</label>
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 293</span>
                                  <span className="text-green-600 text-sm">✅ Free Shipping (mapped)</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 288</span>
                                  <span className="text-green-600 text-sm">✅ Standard Shipping (mapped)</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 1035</span>
                                  <span className="text-green-600 text-sm">✅ Local Pickup (mapped)</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-slate-700">NetSuite API Endpoint</label>
                              <div className="mt-2 p-3 bg-white rounded border font-mono text-sm">
                                GET /record/v1/shippingitem
                              </div>
                              <Button className="mt-2 w-full" size="sm">
                                <Database className="h-4 w-4 mr-2" />
                                Fetch Shipping Methods
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Other Fields Discovery */}
                      <div>
                        <h4 className="font-medium text-slate-800 mb-3">Other NetSuite Fields</h4>
                        <div className="bg-slate-50 p-4 rounded-lg">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-slate-700">Location Fields</label>
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center justify-between p-3 bg-white rounded border">
                                  <span className="font-mono text-sm">ID: 1</span>
                                  <span className="text-green-600 text-sm">✅ Default Location (mapped)</span>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                  Location ID 1 is correctly mapped to "Default Location"
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-slate-700">NetSuite API Endpoints</label>
                              <div className="mt-2 space-y-2">
                                <div className="p-2 bg-white rounded border font-mono text-xs">
                                  GET /record/v1/location
                                </div>
                                <div className="p-2 bg-white rounded border font-mono text-xs">
                                  GET /record/v1/classification
                                </div>
                                <div className="p-2 bg-white rounded border font-mono text-xs">
                                  GET /record/v1/partner
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Field Mapping Tool */}
                      <div>
                        <h4 className="font-medium text-slate-800 mb-3">Manual Field Mapping</h4>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p className="text-sm text-blue-800 mb-3">
                            Use this tool to manually map unknown field IDs to human-readable names:
                          </p>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-sm font-medium">Field Type</label>
                              <div className="mt-1 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                                Select component temporarily disabled
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium">NetSuite ID</label>
                              <Input placeholder="e.g., 177" className="mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Human Name</label>
                              <Input placeholder="e.g., Visa" className="mt-1" />
                            </div>
                          </div>
                          <Button className="mt-3 w-full" size="sm">
                            <Database className="h-4 w-4 mr-2" />
                            Add Mapping
                          </Button>
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )
        
      case 'help':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Help & FAQ</h2>
              <p className="text-slate-600">Common questions and guidance for using the Shopify to NetSuite connector.</p>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Frequently Asked Questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* FAQ Item: Shopify Tax Handling */}
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === 'tax-handling' ? null : 'tax-handling')}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight 
                          className={`h-5 w-5 text-slate-500 transition-transform ${
                            expandedFaq === 'tax-handling' ? 'transform rotate-90' : ''
                          }`}
                        />
                        <span className="font-semibold text-slate-800">
                          Shopify Tax Adjustments
                        </span>
                      </div>
                    </button>
                    {expandedFaq === 'tax-handling' && (
                      <div className="px-4 pb-4 pt-0 border-t bg-gray-50">
                        <div className="pt-4 space-y-3 text-sm text-slate-700">
                          <div>
                            <p className="font-medium mb-2">Understanding Shopify Tax Handling:</p>
                            <p>
                              When Shopify Pay processes an order, they charge tax to the customer regardless of your tax settings because Shopify handles tax collection and remittance. This tax amount is then <strong>deducted from your payout</strong> as a pass-through - meaning you never actually receive the tax money.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium mb-2">What happens when an order is cancelled?</p>
                            <p>
                              If an order is cancelled, Shopify will <strong>refund the tax</strong> to the customer. This creates a tax adjustment in your payout that needs to be properly categorized.
                            </p>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <p className="font-medium text-blue-900 mb-1">💡 Recommendation:</p>
                            <p className="text-blue-800">
                              All tax adjustments should be set to <strong>"Shopify Tax Adjustment"</strong> in the dropdown. This ensures proper categorization in NetSuite and maintains accurate accounting records.
                            </p>
                            <p className="text-blue-800 mt-2 text-xs">
                              <strong>Note:</strong> This is a recommendation, not a requirement. You can still choose other options if needed for your specific use case.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* FAQ Item: Split Shopify Pay Payments */}
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === 'split-payments' ? null : 'split-payments')}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight 
                          className={`h-5 w-5 text-slate-500 transition-transform ${
                            expandedFaq === 'split-payments' ? 'transform rotate-90' : ''
                          }`}
                        />
                        <span className="font-semibold text-slate-800">
                          Split Shopify Pay Payments Across Multiple Payouts
                        </span>
                      </div>
                    </button>
                    {expandedFaq === 'split-payments' && (
                      <div className="px-4 pb-4 pt-0 border-t bg-gray-50">
                        <div className="pt-4 space-y-3 text-sm text-slate-700">
                          <div>
                            <p className="font-medium mb-2">When Shopify Pay payments span multiple payouts:</p>
                            <p>
                              In some cases, Shopify Pay may split a single order's payment across <strong>two separate payouts</strong>. This typically happens when there are timing differences or payment processing delays.
                            </p>
                          </div>
                          <div>
                            <p className="font-medium mb-2">Required NetSuite workflow:</p>
                            <ol className="list-decimal list-inside space-y-2 ml-2">
                              <li>
                                <strong>Delete the Cash Sale:</strong> The original cash sale created for the order must be deleted in NetSuite.
                              </li>
                              <li>
                                <strong>Invoice the Sales Order:</strong> Convert the sales order to an invoice instead of using a cash sale.
                              </li>
                              <li>
                                <strong>Match Payments:</strong> Apply payment matching to link the split payments from both payouts to the invoiced sales order.
                              </li>
                            </ol>
                          </div>
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <p className="font-medium text-yellow-900 mb-1">⚠️ Important:</p>
                            <p className="text-yellow-800">
                              This workflow <strong>only applies</strong> when a Shopify Pay payment is split across <strong>2 payouts</strong>. For single-payout payments, use the standard cash sale workflow.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Placeholder for future FAQs */}
                  <div className="text-center py-8 text-slate-400 text-sm">
                    More help topics coming soon...
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )
        
      case 'payouts':
        return renderPayoutsContent()
        
      case 'customers':
        return renderCustomersContent()
        
      case 'addresses':
        return renderAddressesContent()
        
      case 'mappings-orders':
        return renderMappingsOrdersContent()
        
      case 'mappings-products':
        return renderMappingsProductsContent()
        
      case 'mappings-fulfillments':
        return renderMappingsFulfillmentsContent()
        
      case 'mappings-payouts':
        return renderMappingsPayoutsContent()
        
      case 'mappings-other':
        return renderMappingsOtherContent()
        
      default:
        return renderPayoutsContent()
    }
  }

  const renderCustomersContent = () => {
    const filteredCustomers = customers.filter((customer) => {
      if (!customerSearchTerm) return true
      const search = customerSearchTerm.toLowerCase()
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
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Button onClick={fetchCustomers} disabled={isLoadingCustomers} variant="outline">
                {isLoadingCustomers ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground mb-4">
              {filteredCustomers.length} of {customers.length} customers
            </div>

            {isLoadingCustomers ? (
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

  const renderAddressesContent = () => {
    const filteredAddresses = addresses.filter((address) => {
      if (!addressSearchTerm) return true
      const search = addressSearchTerm.toLowerCase()
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
                value={addressSearchTerm}
                onChange={(e) => setAddressSearchTerm(e.target.value)}
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
              <Button onClick={fetchAddresses} disabled={isLoadingAddresses} variant="outline">
                {isLoadingAddresses ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground mb-4">
              {filteredAddresses.length} of {addresses.length} addresses
            </div>

            {isLoadingAddresses ? (
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
                      onClick={() => importAllPayouts(false)} 
                      disabled={isLoading}
                      className="flex items-center gap-2 h-9"
                      size="sm"
                    >
                      {isLoading ? <LoaderWithText text="Importing..." /> : (
                        <>
                          <Download className="h-4 w-4" />
                          Import Payouts
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
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Import:</span>
                      <Input
                        type="number"
                        placeholder="Start"
                        value={payoutRangeStart}
                        onChange={(e) => setPayoutRangeStart(e.target.value)}
                        className="w-[70px] h-9"
                        title="Starting position (e.g., 1 for first payout)"
                      />
                      <span className="text-sm text-muted-foreground">-</span>
                      <Input
                        type="number"
                        placeholder="End"
                        value={payoutRangeEnd}
                        onChange={(e) => setPayoutRangeEnd(e.target.value)}
                        className="w-[70px] h-9"
                        title="Ending position (e.g., 10 for 10th payout)"
                      />
                      <Button 
                        onClick={importPayoutsByRange} 
                        disabled={isLoading || !payoutRangeStart.trim() || !payoutRangeEnd.trim()}
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
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold text-sm">
                            #{payout.id}
                          </h4>
                          {/* Shopify Link */}
                          <a
                            href={`https://admin.shopify.com/store/pirani-life/payments/payouts/${payout.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs"
                            title="View in Shopify"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          {/* NetSuite Link */}
                          {payout.netsuiteDepositId && (
                            <a
                              href={`https://7913744.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${payout.netsuiteDepositId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 text-xs"
                              title="View in NetSuite"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          )}
                        </div>
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
                          <div className="inline-flex items-center gap-1">
                            <button 
                              onClick={() => openEditNetSuiteIdDialog(payout)}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer transition-colors"
                              title="Click to edit NetSuite ID"
                            >
                              ✓ NS: {payout.netsuiteDepositNumber}
                            </button>
                            <button
                              onClick={(e) => clearNetSuiteDepositId(String(payout.id), e)}
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors"
                              title="Clear NetSuite Deposit ID (for testing)"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
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
                           className={`text-xs ${
                             hasMissingCashSale(payout) 
                               ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-600' 
                               : ''
                           }`}
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
            payoutTotalAmount={selectedPayoutTotalAmount}
            payoutCurrency={selectedPayoutCurrency}
            isLoading={isLoadingTransactions}
            hideSensitiveData={hideSensitiveData}
            onRefreshTransactions={selectedPayoutId ? () => fetchTransactions(selectedPayoutId) : undefined}
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

  // Delete confirmation functions
  const openDeleteConfirmDialog = (itemType: string, itemName: string, itemId: string) => {
    setDeleteConfirmDialog({
      isOpen: true,
      itemType,
      itemName,
      itemId
    })
  }

  const closeDeleteConfirmDialog = () => {
    setDeleteConfirmDialog({
      isOpen: false,
      itemType: '',
      itemName: '',
      itemId: ''
    })
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

  const confirmDelete = async () => {
    const { itemType, itemName, itemId } = deleteConfirmDialog
    console.log(`Deleting ${itemType}: ${itemName}`)
    
    try {
      let apiEndpoint = ''
      
      // Determine the API endpoint based on item type
      switch (itemType) {
        case 'Payment Method':
          apiEndpoint = `/api/mappings/payment-methods/${itemId}`
          break
        case 'Shipment Method':
          apiEndpoint = `/api/mappings/shipment-methods/${itemId}`
          break
        case 'Order Mapping':
          apiEndpoint = `/api/mappings/order-fields/${itemId}`
          break
        case 'Order Item Mapping':
          apiEndpoint = `/api/mappings/order-item-fields/${itemId}`
          break
        case 'Customer Mapping':
          apiEndpoint = `/api/mappings/customer-fields/${itemId}`
          break
        case 'Payout Mapping':
          await handleDeletePayoutMapping(parseInt(itemId))
          closeDeleteConfirmDialog()
          return // handleDeletePayoutMapping already refreshes the list
        default:
          console.log(`Unknown item type: ${itemType}`)
          return
      }

      // Delete from database
      const response = await fetch(apiEndpoint, {
        method: 'DELETE'
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Update local state after successful deletion
        switch (itemType) {
          case 'Payment Method':
            setPaymentMappings(prev => prev.filter(item => item.id.toString() !== itemId))
            break
          case 'Shipment Method':
            setShipmentMappings(prev => prev.filter(item => item.id.toString() !== itemId))
            break
          case 'Order Mapping':
            setOrderMappings(prev => prev.filter(item => item.id.toString() !== itemId))
            break
          case 'Order Item Mapping':
            setOrderItemMappings(prev => prev.filter(item => item.id.toString() !== itemId))
            break
          case 'Customer Mapping':
            setCustomerMappings(prev => prev.filter(item => item.id.toString() !== itemId))
            break
        }
        console.log(`✅ Successfully deleted ${itemType}: ${itemName}`)
      } else {
        console.error(`❌ Failed to delete ${itemType}: ${itemName}`, result.error)
      }
    } catch (error) {
      console.error(`❌ Error deleting ${itemType}: ${itemName}`, error)
    }
    
    closeDeleteConfirmDialog()
  }

  // Handle custom field input changes
  const handleCustomFieldChange = (rowId: string, value: string) => {
    setCustomFields(prev => ({
      ...prev,
      [rowId]: value
    }))
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

    console.log('🔍 Detecting missing mappings from orders...')
    
    // Validate all orders
    const errors = validateOrdersForMappings(orders)
    
    // Update error state
    setMappingErrors(errors)
    
    if (errors.length > 0) {
      console.log(`⚠️ Found ${errors.length} mapping errors:`, errors)
      
      // Extract unique missing mappings
      const missingPaymentMethods = getUnmappedPaymentMethods(errors)
      const missingShipmentMethods = getUnmappedShipmentMethods(errors)
      
      console.log('Missing payment methods:', missingPaymentMethods)
      console.log('Missing shipment methods:', missingShipmentMethods)
      
      // Update unmapped methods lists
      setUnmappedPaymentMethods(missingPaymentMethods)
      setUnmappedShipmentMethods(missingShipmentMethods)
    } else {
      console.log('✅ All orders have valid mappings')
      setUnmappedPaymentMethods([])
      setUnmappedShipmentMethods([])
    }
  }

  // Add new payment method mapping
  const addPaymentMethodMapping = async (shopifyCode: string, netsuiteId: string) => {
    try {
      const response = await fetch('/api/mappings/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopifyCode,
          netsuiteId,
          isActive: true
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log(`✅ Added payment method mapping: ${shopifyCode} → ${netsuiteId}`)
        
        // Update local state
        setPaymentMappings(prev => [...prev, result.data])
        
        // Re-detect missing mappings
        detectMissingMappings()
        
        return true
      } else {
        console.error(`❌ Failed to add payment method mapping:`, result.error)
        return false
      }
    } catch (error) {
      console.error(`❌ Error adding payment method mapping:`, error)
      return false
    }
  }

  // Add new shipment method mapping
  const addShipmentMethodMapping = async (shopifyCode: string, netsuiteId: string) => {
    try {
      const response = await fetch('/api/mappings/shipment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopifyCode,
          netsuiteId,
          isActive: true
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log(`✅ Added shipment method mapping: ${shopifyCode} → ${netsuiteId}`)
        
        // Update local state
        setShipmentMappings(prev => [...prev, result.data])
        
        // Re-detect missing mappings
        detectMissingMappings()
        
        return true
      } else {
        console.error(`❌ Failed to add shipment method mapping:`, result.error)
        return false
      }
    } catch (error) {
      console.error(`❌ Error adding shipment method mapping:`, error)
      return false
    }
  }

  // Mapping Content Functions
  const renderMappingsOrdersContent = () => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Order Mappings</h2>
          <p className="text-slate-600">Configure how Shopify orders map to NetSuite transactions.</p>
        </div>
        
        {/* Navigation Tabs - nav-mappings-orders-tab-payment, nav-mappings-orders-tab-shipment, nav-mappings-orders-tab-order, nav-mappings-orders-tab-order-item, nav-mappings-orders-tab-customer */}
        <div className="flex space-x-1 border-b">
          {['Payment', 'Shipment', 'Order', 'Order Item', 'Customer'].map((tab) => (
            <Button
              key={tab}
              variant="ghost"
              onClick={() => setActiveMappingTab(tab)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === activeMappingTab
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50' 
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {tab}
            </Button>
          ))}
        </div>

        {/* Payment Methods Section */}
        {activeMappingTab === 'Payment' && (
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-600">Default payment method to post when no match found</span>
                    <Database className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-48 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                      Select component temporarily disabled
                    </div>
                    <Button variant="ghost" size="sm">
                      <Database className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg mb-3">
                    <div className="font-medium text-slate-700 flex items-center space-x-2">
                      <span>Shopify Payment Method</span>
                      <Database className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="font-medium text-slate-700 flex items-center space-x-2">
                      <span>NetSuite Payment Option</span>
                      <Database className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                  
                       {paymentMappings.map((mapping, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4 p-4 border rounded-lg mb-2">
                      <div className="text-slate-700 font-mono text-sm">{mapping.shopifyCode}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-600 font-mono text-sm">{mapping.netsuiteId}</span>
                        <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Payment Method', mapping.shopifyCode, mapping.id.toString())}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unmapped Payment Methods Section */}
                {unmappedPaymentMethods.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <div className="mb-3">
                      <h4 className="font-medium text-red-700 flex items-center space-x-2">
                        <span>⚠️ Unmapped Payment Methods</span>
                      </h4>
                      <p className="text-sm text-red-600">These payment methods need to be mapped to avoid errors:</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 p-4 bg-red-50 rounded-lg mb-3">
                      <div className="font-medium text-slate-700 flex items-center space-x-2">
                        <span>Shopify Payment Method</span>
                        <Database className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="font-medium text-slate-700 flex items-center space-x-2">
                        <span>NetSuite Payment Option</span>
                        <Database className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    
                    {unmappedPaymentMethods.map((paymentMethod, index) => (
                      <div key={index} className="grid grid-cols-2 gap-4 p-4 border border-red-200 rounded-lg mb-2 bg-white">
                        <div className="text-red-700 font-medium">{paymentMethod}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">→</span>
                          <div className="w-full p-2 border rounded bg-gray-50 text-sm text-gray-500">
                            Select component temporarily disabled
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shipment Methods Section */}
        {activeMappingTab === 'Shipment' && (
          <Card>
            <CardHeader>
              <CardTitle>Shipment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-600">Default shipment method to post to when no match found</span>
                    <Database className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-48 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                      Select component temporarily disabled
                    </div>
                    <Button variant="ghost" size="sm">
                      <Database className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg mb-3">
                    <div className="font-medium text-slate-700 flex items-center space-x-2">
                      <span>Shopify-default Shipment Methods</span>
                      <Database className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="font-medium text-slate-700">NetSuite Shipment Methods</div>
                  </div>
                  
                  {shipmentMappings.map((mapping, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4 p-4 border rounded-lg mb-2">
                      <div className="text-slate-700 font-mono text-sm">{mapping.shopifyCode}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-600 font-mono text-sm">{mapping.netsuiteId}</span>
                        <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Shipment Method', mapping.shopifyCode, mapping.id.toString())}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Advanced Options Section */}
                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <h4 className="font-medium text-slate-700">Advanced options</h4>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="w-4 h-4" />
                      <span className="text-sm text-slate-600">Filter orders by weight/total</span>
                    </div>
                  </div>
                </div>

                {/* Need Help Link */}
                <div className="pt-4">
                  <a href="#" className="text-sm text-blue-600 hover:underline">Need help?</a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Mappings Section */}
        {activeMappingTab === 'Order' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Order mappings</h2>
              <p className="text-slate-600">Configure how Shopify orders map to NetSuite transactions.</p>
            </div>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div></div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Reload NetSuite lists
            </Button>
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Test mappings
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                // Reset to saved state - reload from database
                fetchOrderMappings()
              }}
            >
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              size="sm"
              onClick={async () => {
                try {
                  // Save all mappings to database
                  const response = await fetch('/api/mappings/order-fields', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mappings: orderMappings }),
                  })

                  const result = await response.json()
                  
                  if (result.success) {
                    alert(`✅ Successfully saved ${result.results?.length || orderMappings.length} mapping(s) to database!`)
                    // Reload mappings from database to get updated IDs
                    await fetchOrderMappings()
                  } else {
                    alert(`❌ Failed to save mappings: ${result.error || 'Unknown error'}`)
                    console.error('Save error:', result)
                  }
                } catch (error) {
                  console.error('Error saving mappings:', error)
                  alert(`❌ Error saving mappings: ${error instanceof Error ? error.message : 'Unknown error'}`)
                }
              }}
            >
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
              <div className="flex items-center space-x-2">
                <span>Mapping type</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Shopify field</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>NetSuite field</span>
              </div>
                    <div>Delete</div>
                  </div>
            
                       {orderMappings.map((mapping, index) => (
                         <div key={mapping.id || index} className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                           <div className="flex items-center space-x-2">
                             <input 
                               type="checkbox" 
                               checked={mapping.isActive} 
                               onChange={(e) => {
                                 const updated = [...orderMappings]
                                 updated[index] = { ...updated[index], isActive: e.target.checked }
                                 setOrderMappings(updated)
                               }}
                               className="w-4 h-4" 
                             />
                             <Select
                               value={mapping.mappingType}
                               onValueChange={(value) => {
                                 const updated = [...orderMappings]
                                 updated[index] = { 
                                   ...updated[index], 
                                   mappingType: value as 'Fixed' | 'Order Header' | 'Order Header with Translation' | 'Custom',
                                   // Clear shopifyCode/shopifyValue when changing type
                                   shopifyCode: undefined,
                                   shopifyValue: undefined,
                                 }
                                 setOrderMappings(updated)
                               }}
                             >
                               <SelectTrigger className="w-32">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="Fixed">Fixed</SelectItem>
                                 <SelectItem value="Order Header">Order Header</SelectItem>
                                 <SelectItem value="Order Header with Translation">Order Header with Translation</SelectItem>
                                 <SelectItem value="Custom">Custom</SelectItem>
                               </SelectContent>
                             </Select>
                             </div>
                           <div className="flex items-center">
                             {mapping.mappingType === 'Fixed' && fieldsWithDropdowns.includes(mapping.netsuiteId) ? (
                               // For Fixed mappings with NetSuite dropdowns, show dropdown in Shopify column
                               <Select
                                 value={extractIdFromShopifyValue(mapping.shopifyValue) || undefined}
                                 onValueChange={(value) => {
                                   const listItems = netsuiteListCache[mapping.netsuiteId] || []
                                   const selectedItem = listItems.find(item => item.id === value)
                                   if (selectedItem) {
                                     const updated = [...orderMappings]
                                     updated[index] = {
                                       ...updated[index],
                                       shopifyValue: `${selectedItem.name} (IID: ${selectedItem.id})`,
                                     }
                                     setOrderMappings(updated)
                                   }
                                 }}
                                 onOpenChange={(open) => {
                                   if (open && mapping.netsuiteId && !netsuiteListCache[mapping.netsuiteId]) {
                                     fetchNetSuiteListForField(mapping.netsuiteId)
                                   }
                                 }}
                               >
                                 <SelectTrigger className="w-full">
                                   <SelectValue placeholder={loadingFields.has(mapping.netsuiteId) ? "Loading..." : "Select value..."}>
                                     {(() => {
                                       const selectedId = extractIdFromShopifyValue(mapping.shopifyValue)
                                       if (selectedId && netsuiteListCache[mapping.netsuiteId]) {
                                         const selectedItem = netsuiteListCache[mapping.netsuiteId].find(item => item.id === selectedId)
                                         return selectedItem ? selectedItem.name : mapping.shopifyValue || "Select value..."
                                       }
                                       return mapping.shopifyValue || "Select value..."
                                     })()}
                                   </SelectValue>
                                 </SelectTrigger>
                                 <SelectContent>
                                   {loadingFields.has(mapping.netsuiteId) ? (
                                     <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                                   ) : netsuiteListCache[mapping.netsuiteId]?.length > 0 ? (
                                     netsuiteListCache[mapping.netsuiteId].map((item) => (
                                       <SelectItem key={item.id} value={item.id}>
                                         {item.name} (IID: {item.id})
                                       </SelectItem>
                                     ))
                                   ) : (
                                     <div className="px-2 py-1.5 text-sm text-slate-500">No items available</div>
                                   )}
                                 </SelectContent>
                               </Select>
                             ) : mapping.mappingType === 'Fixed' ? (
                               // If NetSuite field has a list, show dropdown; otherwise show text input
                               fieldsWithDropdowns.includes(mapping.netsuiteId) ? (
                                 <div className="text-slate-400 italic text-sm p-2 w-full">
                                   Select value from NetSuite list above
                                 </div>
                               ) : (
                                 <Input
                                   placeholder="Enter fixed value..."
                                   value={mapping.shopifyValue || ''}
                                   onChange={(e) => {
                                     const updated = [...orderMappings]
                                     updated[index] = { ...updated[index], shopifyValue: e.target.value, shopifyCode: undefined }
                                     setOrderMappings(updated)
                                   }}
                                   className="w-full"
                                 />
                               )
                             ) : mapping.mappingType === 'Custom' ? (
                               // For Custom mappings, show label with value if available
                               <div className="text-slate-700 text-sm p-2 border rounded bg-slate-50 w-full">
                                 {getCustomFieldDisplayText(mapping)}
                               </div>
                             ) : mapping.mappingType === 'Order Header' || mapping.mappingType === 'Order Header with Translation' ? (
                               <Select
                                 value={mapping.shopifyCode || ''}
                                 onValueChange={(value) => {
                                   if (value === 'custom') {
                                     // Open custom Shopify field selector
                                     setEditingMappingIndex(index)
                                     setIsCustomShopifyFieldDialogOpen(true)
                                   } else {
                                     const updated = [...orderMappings]
                                     updated[index] = { ...updated[index], shopifyCode: value, shopifyValue: undefined }
                                     setOrderMappings(updated)
                                   }
                                 }}
                               >
                                 <SelectTrigger className="w-full">
                                   <SelectValue placeholder="Select Shopify field..." />
                                 </SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="id">Order ID</SelectItem>
                                   <SelectItem value="name">Order Name</SelectItem>
                                   <SelectItem value="order_number">Order Number</SelectItem>
                                   <SelectItem value="created_at">Created At</SelectItem>
                                   <SelectItem value="updated_at">Updated At</SelectItem>
                                   <SelectItem value="financial_status">Financial Status</SelectItem>
                                   <SelectItem value="fulfillment_status">Fulfillment Status</SelectItem>
                                   <SelectItem value="currency">Currency</SelectItem>
                                   <SelectItem value="total_price">Total Price</SelectItem>
                                   <SelectItem value="subtotal_price">Subtotal Price</SelectItem>
                                   <SelectItem value="total_tax">Total Tax</SelectItem>
                                   <SelectItem value="total_shipping_price_set">Shipping Price</SelectItem>
                                   <SelectItem value="total_discounts">Total Discounts</SelectItem>
                                   <SelectItem value="payment_gateway_names">Payment Gateway</SelectItem>
                                   <SelectItem value="customer.id">Customer ID</SelectItem>
                                   <SelectItem value="customer.email">Customer Email</SelectItem>
                                   <SelectItem value="shipping_address.address1">Shipping Address 1</SelectItem>
                                   <SelectItem value="shipping_address.city">Shipping City</SelectItem>
                                   <SelectItem value="shipping_address.zip">Shipping Zip</SelectItem>
                                   <SelectItem value="custom">Custom Field...</SelectItem>
                                 </SelectContent>
                               </Select>
                             ) : (
                               <Input
                                 placeholder="Enter custom value..."
                                 value={mapping.shopifyValue || mapping.shopifyCode || ''}
                                 onChange={(e) => {
                                   const updated = [...orderMappings]
                                   updated[index] = { ...updated[index], shopifyValue: e.target.value, shopifyCode: undefined }
                                   setOrderMappings(updated)
                                 }}
                                 className="w-full"
                               />
                             )}
                           </div>
                           <div className="flex flex-col space-y-2">
                             <div className="flex items-center space-x-2">
                               <span className="text-slate-400">→</span>
                               <div className="flex items-center space-x-2 w-full">
                                 {mapping.netsuiteId ? (
                                   <div className="text-slate-700 font-mono text-sm p-2 border rounded bg-slate-50 w-full">
                                     {mapping.netsuiteId}
                                   </div>
                                 ) : (
                                   <div className="text-slate-400 italic text-sm p-2 w-full">
                                     Click "Add row" to set NetSuite field
                                   </div>
                                 )}
                               </div>
                             </div>
                             {/* Show custom field input when "Custom" is selected */}
                             {mapping.mappingType === 'Custom' && (
                               <div className="flex items-center space-x-2 ml-6">
                                 <span className="text-sm text-slate-600">Custom field ID:</span>
                                 <Input 
                                   placeholder="e.g., custbody_custom_field"
                                   value={customFields[`order-${index}`] || mapping.customFieldId || ''}
                                   onChange={(e) => {
                                     handleCustomFieldChange(`order-${index}`, e.target.value)
                                     const updated = [...orderMappings]
                                     updated[index] = { ...updated[index], customFieldId: e.target.value }
                                     setOrderMappings(updated)
                                   }}
                                   className="w-full"
                                 />
                               </div>
                             )}
                           </div>
                           <div className="flex items-center justify-center">
                             <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Order Mapping', mapping.shopifyCode || mapping.shopifyValue || '', mapping.id.toString())}>
                               <Trash2 className="h-4 w-4 text-red-500" />
                             </Button>
                           </div>
                         </div>
                       ))}
          </div>
          <div className="flex justify-between items-center mt-4">
            <a href="#" className="text-sm text-blue-600 hover:underline">Need help?</a>
            <Button 
              variant="outline"
              onClick={() => {
                setIsAddNetSuiteMappingDialogOpen(true)
                setSelectedNetSuiteField('')
                setCustomNetSuiteFieldName('')
                setSelectedNetSuiteValue('')
                setNetsuiteListItems([])
              }}
            >
              <Database className="h-4 w-4 mr-2" /> Add row
            </Button>
          </div>
        </CardContent>
            </Card>
          </div>
        )}

        {/* Order Item Mappings Section */}
        {activeMappingTab === 'Order Item' && (
          <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Order Item Mappings</CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Reload NetSuite lists
            </Button>
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Test mappings
            </Button>
            <Button variant="outline" size="sm">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm">Save</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
              <div className="flex items-center space-x-2">
                <span>Mapping type</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Shopify field / fixed value</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>NetSuite field</span>
              </div>
                    <div>Apply to all accounts</div>
                    <div>Delete</div>
                  </div>
            
                     {orderItemMappings.map((mapping, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 p-4 border rounded-lg">
                <div className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                    <div className="w-32 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                      Select disabled
                    </div>
                </div>
                <div className="text-slate-700 font-mono text-sm">
                  {mapping.shopifyCode || mapping.shopifyValue}
                </div>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-600 font-mono text-sm">{mapping.netsuiteId}</span>
                  </div>
                  {/* Show custom field input when "Custom" is selected */}
                  {mapping.mappingType === 'Custom' && (
                    <div className="flex items-center space-x-2 ml-6">
                      <span className="text-sm text-slate-600">Custom field ID:</span>
                      <Input 
                        placeholder="e.g., custcol_custom_field"
                        value={customFields[`orderitem-${index}`] || ''}
                        onChange={(e) => handleCustomFieldChange(`orderitem-${index}`, e.target.value)}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center">
                  <input type="checkbox" defaultChecked={Boolean(mapping.applyToAllAccounts)} className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-center">
                  <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Order Item Mapping', mapping.shopifyCode || mapping.shopifyValue || '', mapping.id.toString())}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4">
            <a href="#" className="text-sm text-blue-600 hover:underline">Need help?</a>
            <Button variant="outline">
              <Database className="h-4 w-4 mr-2" /> Add row
            </Button>
          </div>
        </CardContent>
          </Card>
        )}

        {/* Customer Mappings Section */}
        {activeMappingTab === 'Customer' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Customer mappings</h2>
              <p className="text-slate-600">Configure how Shopify customer data maps to NetSuite fields.</p>
            </div>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div></div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Reload NetSuite lists
            </Button>
            <Button variant="outline" size="sm">
              <Database className="h-4 w-4 mr-2" /> Test mappings
            </Button>
            <Button variant="outline" size="sm">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm">Save</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
              <div className="flex items-center space-x-2">
                <span>Mapping type</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Shopify field / fixed value</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>NetSuite field</span>
              </div>
                    <div>Apply to all accounts</div>
                    <div>Delete</div>
                  </div>
            
                       {customerMappings.map((mapping, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 p-4 border rounded-lg">
                <div className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked={mapping.isActive} className="w-4 h-4" />
                    <div className="w-32 p-2 border rounded bg-gray-50 text-sm text-gray-500">
                      Select disabled
                    </div>
                </div>
                <div className="text-slate-700 font-mono text-sm">
                  {mapping.shopifyCode || mapping.shopifyValue}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-600 font-mono text-sm">{mapping.netsuiteId}</span>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" defaultChecked={Boolean(mapping.applyToAllAccounts)} className="w-4 h-4" />
                </div>
                <div className="flex items-center justify-center">
                  <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Customer Mapping', mapping.shopifyCode || mapping.shopifyValue || '', mapping.id.toString())}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4">
            <a href="#" className="text-sm text-blue-600 hover:underline">Need help?</a>
            <Button variant="outline">
              <Database className="h-4 w-4 mr-2" /> Add row
            </Button>
          </div>
        </CardContent>
            </Card>
          </div>
        )}
      </div>
    )
  }

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

  const renderMappingsPayoutsContent = () => {
    // Helper function to format mapping type for display
    const formatMappingType = (mappingType: string): string => {
      return mappingType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Payout Mappings</h2>
          <p className="text-slate-600">Configure how Shopify payouts map to NetSuite deposits.</p>
        </div>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payout Mappings</CardTitle>
            <Button onClick={handleAddPayoutMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
              Add Mapping
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Configure how Shopify payouts map to NetSuite deposits.
              </p>
              
              {/* Payout Mappings Table */}
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Mapping Type</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">NetSuite ID</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Description</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Default Deposit Account</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Default Fees Account</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payoutMappings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                          No payout mappings found. Loading...
                        </td>
                      </tr>
                    ) : (
                      payoutMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td className="px-4 py-3 text-sm text-slate-900">{formatMappingType(mapping.mappingType)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{mapping.netsuiteId || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{mapping.description || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="radio"
                              name="defaultDepositAccount"
                              checked={mapping.isDefaultDepositAccount}
                              onChange={() => handleSetDefaultAccount(mapping.id, 'deposit_account')}
                              className="w-4 h-4 text-blue-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="radio"
                              name="defaultFeesAccount"
                              checked={mapping.isDefaultFeesAccount}
                              onChange={() => handleSetDefaultAccount(mapping.id, 'fees_account')}
                              className="w-4 h-4 text-blue-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditPayoutMapping(mapping)}
                              >
                                Edit
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => openDeleteConfirmDialog('Payout Mapping', formatMappingType(mapping.mappingType), mapping.id.toString())}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit/Create Payout Mapping Dialog */}
        <Dialog open={payoutMappingEditDialog.isOpen} onOpenChange={(open) => {
          if (!open) {
            setPayoutMappingEditDialog({ isOpen: false, mapping: null })
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {payoutMappingEditDialog.mapping?.id === 0 ? 'Add Payout Mapping' : 'Edit Payout Mapping'}
              </DialogTitle>
            </DialogHeader>
            {payoutMappingEditDialog.mapping && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Mapping Type
                  </label>
                  <Input
                    value={payoutMappingEditDialog.mapping.mappingType}
                    onChange={(e) => setPayoutMappingEditDialog({
                      ...payoutMappingEditDialog,
                      mapping: {
                        ...payoutMappingEditDialog.mapping!,
                        mappingType: e.target.value
                      }
                    })}
                    placeholder="e.g., deposit_account, fees_account, fees_description"
                    disabled={payoutMappingEditDialog.mapping.id !== 0}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use lowercase with underscores (e.g., deposit_account)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    NetSuite ID
                  </label>
                  <Input
                    value={payoutMappingEditDialog.mapping.netsuiteId}
                    onChange={(e) => setPayoutMappingEditDialog({
                      ...payoutMappingEditDialog,
                      mapping: {
                        ...payoutMappingEditDialog.mapping!,
                        netsuiteId: e.target.value
                      }
                    })}
                    placeholder="NetSuite account ID or value"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <Input
                    value={payoutMappingEditDialog.mapping.description || ''}
                    onChange={(e) => setPayoutMappingEditDialog({
                      ...payoutMappingEditDialog,
                      mapping: {
                        ...payoutMappingEditDialog.mapping!,
                        description: e.target.value || null
                      }
                    })}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={payoutMappingEditDialog.mapping.isActive}
                    onChange={(e) => setPayoutMappingEditDialog({
                      ...payoutMappingEditDialog,
                      mapping: {
                        ...payoutMappingEditDialog.mapping!,
                        isActive: e.target.checked
                      }
                    })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm font-medium text-slate-700">
                    Active
                  </label>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setPayoutMappingEditDialog({ isOpen: false, mapping: null })}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      if (payoutMappingEditDialog.mapping!.id === 0) {
                        handleCreatePayoutMapping({
                          mappingType: payoutMappingEditDialog.mapping!.mappingType,
                          netsuiteId: payoutMappingEditDialog.mapping!.netsuiteId,
                          description: payoutMappingEditDialog.mapping!.description,
                          isActive: payoutMappingEditDialog.mapping!.isActive,
                          isDefaultDepositAccount: payoutMappingEditDialog.mapping!.isDefaultDepositAccount,
                          isDefaultFeesAccount: payoutMappingEditDialog.mapping!.isDefaultFeesAccount
                        })
                      } else {
                        handleSavePayoutMapping(payoutMappingEditDialog.mapping!)
                      }
                    }}
                  >
                    {payoutMappingEditDialog.mapping!.id === 0 ? 'Create' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

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

      {/* NetSuite Deposit Preview Dialog */}
      <Dialog 
        open={netsuitePreviewDialog.isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setNetsuitePreviewDialog({
              isOpen: false,
              payoutId: null,
              previewData: null,
              isLoading: false,
            })
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              NetSuite Deposit Preview - Payout #{netsuitePreviewDialog.payoutId || ''}
            </DialogTitle>
          </DialogHeader>
          
          {/* Actions - Moved to top */}
          {netsuitePreviewDialog.previewData && !netsuitePreviewDialog.isLoading && (
            <div className="flex justify-end gap-2 pb-4 border-b">
              <Button
                variant="outline"
                onClick={() => {
                  setNetsuitePreviewDialog({
                    isOpen: false,
                    payoutId: null,
                    previewData: null,
                    isLoading: false,
                  })
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateNetSuiteDeposit}
                disabled={netsuitePreviewDialog.isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {netsuitePreviewDialog.isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Deposit'
                )}
              </Button>
            </div>
          )}
          
          {netsuitePreviewDialog.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader />
            </div>
          ) : netsuitePreviewDialog.previewData ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h3 className="font-semibold mb-3">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Transactions</p>
                    <p className="text-lg font-semibold">{netsuitePreviewDialog.previewData.stats.totalTransactions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Transactions with NS IDs</p>
                    <p className="text-lg font-semibold text-green-600">{netsuitePreviewDialog.previewData.stats.transactionsWithNS}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Deposit Items</p>
                    <p className="text-lg font-semibold">{netsuitePreviewDialog.previewData.stats.depositItemsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Fees</p>
                    <p className="text-lg font-semibold text-red-600">
                      {netsuitePreviewDialog.previewData.stats.totalFees.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* JSON Body */}
              <div>
                <h3 className="font-semibold mb-2">JSON Body to be sent to NetSuite</h3>
                <div className="bg-white border border-gray-200 p-4 rounded-lg overflow-x-auto">
                  <JsonView
                    value={netsuitePreviewDialog.previewData.depositRequest}
                    style={{
                      backgroundColor: 'transparent',
                      fontSize: '12px',
                    }}
                    theme="light"
                    collapsed={false}
                    displayDataTypes={false}
                    displayObjectSize={false}
                    enableClipboard={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click arrows to expand/collapse sections. Also logged to browser console for easy copying
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Mapping Error Dialog - Global overlay */}
      <Dialog open={mappingErrorDialog.isOpen} onOpenChange={closeMappingErrorDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-red-600">⚠</span>
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
                    <span className="text-red-600 mt-0.5">⚠</span>
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
                <li>2. Look for the <strong>"Unmapped Payment Methods"</strong> or <strong>"Unmapped Shipment Methods"</strong> section</li>
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

      {/* NetSuite Payload Preview Dialog */}
      <Dialog open={netsuitePayloadDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setNetsuitePayloadDialog({
            isOpen: false,
            orderId: null,
            payload: null,
            isLoading: false,
          })
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>NetSuite Sales Order Payload Preview</DialogTitle>
          </DialogHeader>
          {netsuitePayloadDialog.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader />
              <span className="ml-2">Generating payload...</span>
            </div>
          ) : netsuitePayloadDialog.payload ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Order ID:</strong> {netsuitePayloadDialog.orderId}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Review the JSON payload below. Click "Push to NetSuite" to send this order.
                </p>
              </div>

              {/* Customer Info */}
              {netsuitePayloadDialog.customerInfo && (
                <div>
                  <h3 className="font-semibold mb-2">Customer Information</h3>
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <strong>{netsuitePayloadDialog.customerInfo.firstName} {netsuitePayloadDialog.customerInfo.lastName}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        <strong>{netsuitePayloadDialog.customerInfo.email}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Shopify Customer ID:</span>{' '}
                        <strong>{netsuitePayloadDialog.customerInfo.shopifyCustomerId}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">NetSuite Customer ID:</span>{' '}
                        <strong className={netsuitePayloadDialog.customerInfo.netsuiteCustomerId ? 'text-green-600' : 'text-red-600'}>
                          {netsuitePayloadDialog.customerInfo.netsuiteCustomerId || 'Not Found'}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Address Info */}
              {netsuitePayloadDialog.addressInfo && (
                <div>
                  <h3 className="font-semibold mb-2">Address Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {netsuitePayloadDialog.addressInfo.billing && (
                      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                        <h4 className="font-medium mb-2 text-sm">Billing Address</h4>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="text-muted-foreground">NetSuite Address ID:</span>{' '}
                            <strong className={netsuitePayloadDialog.addressInfo.billing.netsuiteAddressId ? 'text-green-600' : 'text-orange-600'}>
                              {netsuitePayloadDialog.addressInfo.billing.netsuiteAddressId || 'Not Found (will use customer default)'}
                            </strong>
                          </div>
                          <div>
                            <strong>{netsuitePayloadDialog.addressInfo.billing.firstName} {netsuitePayloadDialog.addressInfo.billing.lastName}</strong>
                          </div>
                          <div>{netsuitePayloadDialog.addressInfo.billing.address1}</div>
                          {netsuitePayloadDialog.addressInfo.billing.address2 && (
                            <div>{netsuitePayloadDialog.addressInfo.billing.address2}</div>
                          )}
                          <div>
                            {netsuitePayloadDialog.addressInfo.billing.city}, {netsuitePayloadDialog.addressInfo.billing.province} {netsuitePayloadDialog.addressInfo.billing.zip}
                          </div>
                          <div>{netsuitePayloadDialog.addressInfo.billing.country}</div>
                          {netsuitePayloadDialog.addressInfo.billing.phone && (
                            <div>Phone: {netsuitePayloadDialog.addressInfo.billing.phone}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {netsuitePayloadDialog.addressInfo.shipping && (
                      <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                        <h4 className="font-medium mb-2 text-sm">Shipping Address</h4>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="text-muted-foreground">NetSuite Address ID:</span>{' '}
                            <strong className={netsuitePayloadDialog.addressInfo.shipping.netsuiteAddressId ? 'text-green-600' : 'text-orange-600'}>
                              {netsuitePayloadDialog.addressInfo.shipping.netsuiteAddressId || 'Not Found (will use customer default)'}
                            </strong>
                          </div>
                          <div>
                            <strong>{netsuitePayloadDialog.addressInfo.shipping.firstName} {netsuitePayloadDialog.addressInfo.shipping.lastName}</strong>
                          </div>
                          <div>{netsuitePayloadDialog.addressInfo.shipping.address1}</div>
                          {netsuitePayloadDialog.addressInfo.shipping.address2 && (
                            <div>{netsuitePayloadDialog.addressInfo.shipping.address2}</div>
                          )}
                          <div>
                            {netsuitePayloadDialog.addressInfo.shipping.city}, {netsuitePayloadDialog.addressInfo.shipping.province} {netsuitePayloadDialog.addressInfo.shipping.zip}
                          </div>
                          <div>{netsuitePayloadDialog.addressInfo.shipping.country}</div>
                          {netsuitePayloadDialog.addressInfo.shipping.phone && (
                            <div>Phone: {netsuitePayloadDialog.addressInfo.shipping.phone}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">NetSuite JSON Payload</h3>
                <div className="bg-white border border-gray-200 p-4 rounded-lg overflow-x-auto">
                  <JsonView
                    value={netsuitePayloadDialog.payload}
                    style={{
                      backgroundColor: 'transparent',
                      fontSize: '12px',
                    }}
                    theme="light"
                    collapsed={false}
                    displayDataTypes={false}
                    displayObjectSize={false}
                    enableClipboard={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click arrows to expand/collapse sections. Use the copy button to copy the JSON.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setNetsuitePayloadDialog({
                      isOpen: false,
                      orderId: null,
                      payload: null,
                      isLoading: false,
                    })
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmPushToNetSuite}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Push to NetSuite
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No payload data available
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.isOpen} onOpenChange={closeDeleteConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete this {deleteConfirmDialog.itemType}?</p>
            <p className="text-sm text-slate-600">{deleteConfirmDialog.itemName}</p>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={closeDeleteConfirmDialog}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Yes, Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Database Confirmation Dialog */}
      <Dialog open={clearDbDialog.isOpen} onOpenChange={(open) => {
        if (!clearDbDialog.isClearing) {
          setClearDbDialog({ isOpen: open, isClearing: false })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Clear Database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-700">
              Are you sure you want to clear the entire database? This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              <li>All payouts and transactions</li>
              <li>All orders and order lines</li>
              <li>All customers and customer addresses</li>
            </ul>
            <p className="text-sm font-semibold text-red-600">
              ⚠️ This action cannot be undone!
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setClearDbDialog({ isOpen: false, isClearing: false })}
                disabled={clearDbDialog.isClearing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearDatabase}
                disabled={clearDbDialog.isClearing}
                className="flex items-center gap-2"
              >
                {clearDbDialog.isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Clear Database
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add NetSuite Mapping Dialog */}
      <Dialog open={isAddNetSuiteMappingDialogOpen} onOpenChange={setIsAddNetSuiteMappingDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add NetSuite Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                NetSuite Field
              </label>
              <Select 
                value={selectedNetSuiteField} 
                onValueChange={(value) => {
                  setSelectedNetSuiteField(value)
                  setCustomNetSuiteFieldName('')
                  // If not custom, auto-close and create mapping
                  if (value && value !== 'Custom field') {
                    const netsuiteId = value
                    const newMapping: OrderFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Fixed',
                      shopifyValue: '',
                      netsuiteId: netsuiteId,
                      applyToAllAccounts: true,
                      isActive: true,
                    }
                    setOrderMappings([...orderMappings, newMapping])
                    setIsAddNetSuiteMappingDialogOpen(false)
                    setSelectedNetSuiteField('')
                    setSelectedNetSuiteValue('')
                    setNetsuiteListItems([])
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a NetSuite field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Custom field">Custom field</SelectItem>
                  <SelectItem value="account">Account (Only for CashSale/Invoice)</SelectItem>
                  <SelectItem value="authCode">Auth. Code</SelectItem>
                  <SelectItem value="billingSchedule">Billing Schedule</SelectItem>
                  <SelectItem value="ccType">CC Type</SelectItem>
                  <SelectItem value="class">Class</SelectItem>
                  <SelectItem value="creditCardProcessingProfile">Credit Card Processing Profile</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="customForm">Custom Form</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="discountItem">Discount Item</SelectItem>
                  <SelectItem value="drAccount">Undeposited Funds (Only for CashSale/Invoice)</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="endDate">End Date</SelectItem>
                  <SelectItem value="excludeCommission">Exclude Commissions</SelectItem>
                  <SelectItem value="getAuthorization">Get Authorization</SelectItem>
                  <SelectItem value="handlingMode">Handling Mode</SelectItem>
                  <SelectItem value="isResidential">Is Residential</SelectItem>
                  <SelectItem value="leadSource">Lead Source</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="memo">Memo</SelectItem>
                  <SelectItem value="opportunity">Opportunity</SelectItem>
                  <SelectItem value="orderStatus">Order Status</SelectItem>
                  <SelectItem value="orderType">Record Type</SelectItem>
                  <SelectItem value="otherRefNum">PO #</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="payPalAuthId">PayPal Authorization ID</SelectItem>
                  <SelectItem value="payPalTranId">PayPal Transaction ID</SelectItem>
                  <SelectItem value="paymentOperation">Payment Operation</SelectItem>
                  <SelectItem value="paymentOption">Payment Option</SelectItem>
                  <SelectItem value="salesRep">Sales Rep</SelectItem>
                  <SelectItem value="shipComplete">Ship Complete</SelectItem>
                  <SelectItem value="shipDate">Ship Date</SelectItem>
                  <SelectItem value="shippingCost">Shipping Cost</SelectItem>
                  <SelectItem value="startDate">Start Date</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="subsidiary">Subsidiary</SelectItem>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="toBeEmailed">To Be Emailed</SelectItem>
                  <SelectItem value="toBeFaxed">To Be Faxed</SelectItem>
                  <SelectItem value="toBePrinted">To Be Printed</SelectItem>
                  <SelectItem value="tranDate">Transaction Date</SelectItem>
                  <SelectItem value="tranId">Order #</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Show custom field input when "Custom field" is selected */}
            {selectedNetSuiteField === 'Custom field' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Custom Field Name
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., custbody_sales_order_urgency"
                      value={customNetSuiteFieldName}
                      onChange={(e) => {
                        setCustomNetSuiteFieldName(e.target.value)
                        setCustomFieldInfo(null)
                        setCustomFieldValue('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customNetSuiteFieldName.trim()) {
                          handleFetchCustomFieldInfo()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={handleFetchCustomFieldInfo}
                      disabled={!customNetSuiteFieldName.trim() || isLoadingCustomFieldInfo}
                    >
                      {isLoadingCustomFieldInfo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Query'
                      )}
                    </Button>
                  </div>
                </div>

                {/* Show field info and appropriate input based on field type */}
                {isLoadingCustomFieldInfo && (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                    Querying NetSuite...
                  </div>
                )}

                {customFieldInfo && (
                  <div className="space-y-4">
                    <div className="text-sm text-slate-600">
                      Field Type: <span className="font-medium">{customFieldInfo.fieldType}</span>
                    </div>

                    {/* Select dropdown */}
                    {customFieldInfo.fieldType === 'select' && customFieldInfo.listItems.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Select Value
                        </label>
                        <Select value={customFieldValue} onValueChange={setCustomFieldValue}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a value..." />
                          </SelectTrigger>
                          <SelectContent>
                            {customFieldInfo.listItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.text}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Date input */}
                    {customFieldInfo.fieldType === 'date' && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Date Value
                        </label>
                        <Input
                          type="date"
                          value={customFieldValue}
                          onChange={(e) => setCustomFieldValue(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Text input */}
                    {(customFieldInfo.fieldType === 'text' || 
                      customFieldInfo.fieldType === 'integer' || 
                      customFieldInfo.fieldType === 'currency' || 
                      customFieldInfo.fieldType === 'percent') && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          {customFieldInfo.fieldType === 'integer' ? 'Integer Value' :
                           customFieldInfo.fieldType === 'currency' ? 'Currency Value' :
                           customFieldInfo.fieldType === 'percent' ? 'Percent Value' :
                           'Text Value'}
                        </label>
                        <Input
                          type={customFieldInfo.fieldType === 'integer' ? 'number' : 'text'}
                          placeholder={`Enter ${customFieldInfo.fieldType} value...`}
                          value={customFieldValue}
                          onChange={(e) => setCustomFieldValue(e.target.value)}
                        />
                      </div>
                    )}

                    {/* Checkbox */}
                    {customFieldInfo.fieldType === 'checkbox' && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Checkbox Value
                        </label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={customFieldValue === 'true'}
                            onCheckedChange={(checked) => setCustomFieldValue(checked ? 'true' : 'false')}
                          />
                          <span className="text-sm text-slate-600">Checked</span>
                        </div>
                      </div>
                    )}

                    {/* No options available for select */}
                    {customFieldInfo.fieldType === 'select' && customFieldInfo.listItems.length === 0 && (
                      <div className="p-4 border rounded-lg text-center text-slate-500">
                        No options available for this select field
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Show value dropdown for fields that require lookups */}
            {selectedNetSuiteField && selectedNetSuiteField !== 'Custom field' && fieldsWithDropdowns.includes(selectedNetSuiteField) && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  {selectedNetSuiteField.charAt(0).toUpperCase() + selectedNetSuiteField.slice(1)} Value
                </label>
                {isLoadingNetSuiteList ? (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    Loading {selectedNetSuiteField} options...
                  </div>
                ) : netsuiteListItems.length > 0 ? (
                  <Select value={selectedNetSuiteValue} onValueChange={setSelectedNetSuiteValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select a ${selectedNetSuiteField}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {netsuiteListItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (IID: {item.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    No {selectedNetSuiteField} options available
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddNetSuiteMappingDialogOpen(false)
                  setSelectedNetSuiteField('')
                  setCustomNetSuiteFieldName('')
                  setSelectedNetSuiteValue('')
                  setNetsuiteListItems([])
                  setEditingMappingIndex(null)
                  setCustomFieldInfo(null)
                  setCustomFieldValue('')
                }}
              >
                Cancel
              </Button>
              {selectedNetSuiteField === 'Custom field' && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (!customNetSuiteFieldName.trim()) {
                      alert('Please enter a custom field name')
                      return
                    }

                    // For select fields, require a value to be selected
                    if (customFieldInfo?.fieldType === 'select' && !customFieldValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }

                    // For other field types, use the entered value or empty string
                    const netsuiteValue = customFieldValue || ''
                    
                    const newMapping: OrderFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Custom',
                      shopifyValue: netsuiteValue, // Store the selected/entered value
                      netsuiteId: customNetSuiteFieldName.trim(),
                      applyToAllAccounts: true,
                      isActive: true,
                      customFieldId: customNetSuiteFieldName.trim(),
                    }
                    setOrderMappings([...orderMappings, newMapping])
                    setIsAddNetSuiteMappingDialogOpen(false)
                    setSelectedNetSuiteField('')
                    setCustomNetSuiteFieldName('')
                    setSelectedNetSuiteValue('')
                    setNetsuiteListItems([])
                    setCustomFieldInfo(null)
                    setCustomFieldValue('')
                  }}
                  disabled={!customNetSuiteFieldName.trim() || (customFieldInfo?.fieldType === 'select' && !customFieldValue)}
                >
                  Add Mapping
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Shopify Field Selector Dialog */}
      <Dialog open={isCustomShopifyFieldDialogOpen} onOpenChange={setIsCustomShopifyFieldDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map Custom Order Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Order Id</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="#42395"
                    value={customShopifyOrderId}
                    onChange={(e) => setCustomShopifyOrderId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customShopifyOrderId.trim()) {
                        handleFetchCustomShopifyOrder()
                      }
                    }}
                  />
                  <Button
                    onClick={handleFetchCustomShopifyOrder}
                    disabled={!customShopifyOrderId.trim() || isLoadingCustomShopifyOrder}
                  >
                    {isLoadingCustomShopifyOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Below is the field data for this order. Any mapping you add will only apply to orders imported after the mapping is saved. 
              Note that this tool is in beta; please report any issues you encounter using it. 
              If you're mapping an order line field, please be aware that only the first item's data from the order is shown for simplicity.
            </p>

            {customShopifyOrderData && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 p-2 border-b flex justify-between items-center">
                  <span className="text-sm font-medium">Field</span>
                  <span className="text-sm font-medium">Value</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {Object.entries(flattenObject(customShopifyOrderData)).map(([field, value]) => (
                    <div
                      key={field}
                      className="grid grid-cols-2 gap-4 p-2 border-b hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        if (editingMappingIndex !== null && editingMappingIndex >= 0 && editingMappingIndex < orderMappings.length) {
                          const updated = [...orderMappings]
                          updated[editingMappingIndex] = {
                            ...updated[editingMappingIndex],
                            shopifyCode: field,
                            shopifyValue: undefined,
                          }
                          setOrderMappings(updated)
                          setIsCustomShopifyFieldDialogOpen(false)
                          setCustomShopifyOrderId('')
                          setCustomShopifyOrderData(null)
                          setEditingMappingIndex(null)
                        }
                      }}
                    >
                      <div className="font-mono text-sm">{field}</div>
                      <div className="text-sm text-slate-600 truncate">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCustomShopifyFieldDialogOpen(false)
                  setCustomShopifyOrderId('')
                  setCustomShopifyOrderData(null)
                  setEditingMappingIndex(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}







