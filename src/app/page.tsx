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
import { Download, Database, ArrowUpRight, Settings, Eye, EyeOff, Filter, Trash2, ChevronDown, ChevronUp, Loader2, X, HelpCircle, ChevronRight, MoreVertical, Pencil, Check, MapPin } from 'lucide-react'
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
  
  // Products state
  const [products, setProducts] = useState<any[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [exclusionReasonDialog, setExclusionReasonDialog] = useState<{isOpen: boolean, product: any | null}>({
    isOpen: false,
    product: null
  })
  const [productActionMenuOpen, setProductActionMenuOpen] = useState<string | null>(null)
  const [editingProductCategory, setEditingProductCategory] = useState<string | null>(null)
  const [productCategories, setProductCategories] = useState<Record<string, string>>({})
  const [productDetailsDialog, setProductDetailsDialog] = useState<{isOpen: boolean, product: any | null}>({
    isOpen: false,
    product: null
  })
  const [productPagination, setProductPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })
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
  const [paymentMappings, setPaymentMappings] = useState<PaymentMethodMapping[]>([])
  const [paymentMethodNetSuiteList, setPaymentMethodNetSuiteList] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false)
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<string>('')
  const [isLoadingDefaultPaymentMethod, setIsLoadingDefaultPaymentMethod] = useState(false)

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

  const [customerMappings, setCustomerMappings] = useState<CustomerFieldMapping[]>([])

  // Customer NetSuite mapping dialog state
  const [isAddCustomerNetSuiteMappingDialogOpen, setIsAddCustomerNetSuiteMappingDialogOpen] = useState(false)
  const [selectedCustomerNetSuiteField, setSelectedCustomerNetSuiteField] = useState<string>('')
  const [selectedCustomerNetSuiteValue, setSelectedCustomerNetSuiteValue] = useState<string>('')
  const [customCustomerNetSuiteFieldName, setCustomCustomerNetSuiteFieldName] = useState<string>('')
  const [customerNetSuiteListItems, setCustomerNetSuiteListItems] = useState<Array<{ id: string; name: string; [key: string]: any }>>([])
  const [isLoadingCustomerNetSuiteList, setIsLoadingCustomerNetSuiteList] = useState(false)
  
  // Customer custom field info state
  const [customerCustomFieldInfo, setCustomerCustomFieldInfo] = useState<{
    fieldType: 'select' | 'text' | 'date' | 'checkbox' | 'integer' | 'currency' | 'percent' | null
    listItems: Array<{ value: string; text: string }>
  } | null>(null)
  const [isLoadingCustomerCustomFieldInfo, setIsLoadingCustomerCustomFieldInfo] = useState(false)
  const [customerCustomFieldValue, setCustomerCustomFieldValue] = useState<string>('')
  
  // Fields that require dropdowns for Customer mappings
  const customerFieldsWithDropdowns = ['currency', 'terms', 'taxCode', 'subsidiary', 'partner', 'account']
  
  // Standard NetSuite Customer fields (based on image)
  const standardCustomerFields = [
    { value: 'Custom field', label: 'Custom field' },
    { value: 'campaignCategory', label: 'Campaign Category' },
    { value: 'category', label: 'Category' },
    { value: 'companyName', label: 'Company vs. Individual' },
    { value: 'currency', label: 'Currency' },
    { value: 'customForm', label: 'Custom Customer Form' },
    { value: 'email', label: 'Email' },
    { value: 'externalId', label: 'External ID' },
    { value: 'firstName', label: 'First Name' },
    { value: 'globalSubscriptionStatus', label: 'Global Subscription Status' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'leadSource', label: 'Lead Source' },
    { value: 'parent', label: 'Parent' },
    { value: 'resaleNumber', label: 'Resale Number' },
    { value: 'salesRep', label: 'Sales Rep' },
    { value: 'shipComplete', label: 'Ship Complete' },
    { value: 'taxCode', label: 'Tax Code' },
    { value: 'terms', label: 'Terms' },
    { value: 'territory', label: 'Territory' },
    { value: 'vatRegistrationNumber', label: 'VAT Registration Number' },
  ]
  
  // Common Shopify Customer fields
  const commonCustomerFields = [
    { value: 'id', label: 'Customer ID' },
    { value: 'email', label: 'Email' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'phone', label: 'Phone' },
    { value: 'tags', label: 'Tags' },
    { value: 'note', label: 'Note' },
    { value: 'created_at', label: 'Created At' },
    { value: 'updated_at', label: 'Updated At' },
  ]
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
  const [isSearchingOrders, setIsSearchingOrders] = useState(false)
  const [searchedOrders, setSearchedOrders] = useState<Order[]>([])

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
  
  // Add Order Item NetSuite Mapping Dialog state
  const [isAddOrderItemNetSuiteMappingDialogOpen, setIsAddOrderItemNetSuiteMappingDialogOpen] = useState(false)
  const [selectedOrderItemNetSuiteField, setSelectedOrderItemNetSuiteField] = useState<string>('')
  const [selectedOrderItemNetSuiteValue, setSelectedOrderItemNetSuiteValue] = useState<string>('')
  const [customOrderItemNetSuiteFieldName, setCustomOrderItemNetSuiteFieldName] = useState<string>('')
  const [orderItemNetSuiteListItems, setOrderItemNetSuiteListItems] = useState<Array<{ id: string; name: string; [key: string]: any }>>([])
  const [isLoadingOrderItemNetSuiteList, setIsLoadingOrderItemNetSuiteList] = useState(false)
  
  // Fields that require dropdowns for Order Items
  const orderItemFieldsWithDropdowns = ['class', 'department', 'location', 'priceLevel', 'purchaseOrderVendor', 'unitsOfMeasure']
  
  // Custom line item field selector dialog state
  const [isCustomLineItemFieldDialogOpen, setIsCustomLineItemFieldDialogOpen] = useState(false)
  const [customLineItemOrderId, setCustomLineItemOrderId] = useState<string>('')
  const [customLineItemOrderData, setCustomLineItemOrderData] = useState<any>(null)
  const [isLoadingCustomLineItemOrder, setIsLoadingCustomLineItemOrder] = useState(false)
  const [editingOrderItemMappingIndex, setEditingOrderItemMappingIndex] = useState<number | null>(null)
  
  // Common Order Line fields (matching Shopify line item structure)
  const commonOrderLineFields = [
    { value: 'id', label: 'Item ID' },
    { value: 'line_number', label: 'Line Number' },
    { value: 'location_id', label: 'Location ID' },
    { value: 'name', label: 'Name/Description' },
    { value: 'title', label: 'Title' },
    { value: 'price', label: 'Price' },
    { value: 'quantity', label: 'Quantity' },
    { value: 'sku', label: 'SKU' },
    { value: 'taxable', label: 'Taxable' },
  ]
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
  
  // Order Header configuration dialog state
  const [isOrderHeaderConfigDialogOpen, setIsOrderHeaderConfigDialogOpen] = useState(false)
  const [editingOrderHeaderIndex, setEditingOrderHeaderIndex] = useState<number | null>(null)
  const [orderHeaderOrderId, setOrderHeaderOrderId] = useState<string>('')
  const [orderHeaderOrderData, setOrderHeaderOrderData] = useState<any>(null)
  const [isLoadingOrderHeaderOrder, setIsLoadingOrderHeaderOrder] = useState(false)
  
  // Translation mapping dialog state
  const [isTranslationDialogOpen, setIsTranslationDialogOpen] = useState(false)
  const [translationMappingIndex, setTranslationMappingIndex] = useState<number | null>(null)
  const [translationMappings, setTranslationMappings] = useState<Array<{ id?: string; shopifyValue: string; netsuiteValue: string; isActive: boolean }>>([])
  const [translationDefaultValue, setTranslationDefaultValue] = useState<string>('')
  const [availableShopifyValues, setAvailableShopifyValues] = useState<string[]>([])
  const [isLoadingShopifyValues, setIsLoadingShopifyValues] = useState(false)
  const [translationOrderId, setTranslationOrderId] = useState<string>('')
  const [translationOrderData, setTranslationOrderData] = useState<any>(null)
  const [isLoadingTranslationOrder, setIsLoadingTranslationOrder] = useState(false)
  // NetSuite field info for translation dialog (to determine if dropdowns should be used)
  const [translationNetSuiteFieldInfo, setTranslationNetSuiteFieldInfo] = useState<{
    listItems: Array<{ id: string; name: string }>
  } | null>(null)
  const [isLoadingTranslationNetSuiteFieldInfo, setIsLoadingTranslationNetSuiteFieldInfo] = useState(false)
  
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
  
  // Helper function to flatten line items for display
  const flattenLineItems = (orderData: any): Record<string, any> => {
    const flattened: Record<string, any> = {}
    
    // Ensure we have the order object structure
    const lineItems = orderData?.line_items || orderData?.order?.line_items || []
    
    if (Array.isArray(lineItems) && lineItems.length > 0) {
      // Use the first line item as the base for non-properties fields
      const firstLineItem = lineItems[0]
      
      console.log('🔍 Total line items:', lineItems.length)
      console.log('🔍 Order data structure:', {
        hasLineItems: !!orderData?.line_items,
        hasOrderLineItems: !!orderData?.order?.line_items,
        lineItemsCount: lineItems.length
      })
      
      // Collect properties from ALL line items
      lineItems.forEach((item: any, index: number) => {
        console.log(`🔍 Line item ${index}:`, {
          name: item.name || item.title,
          hasProperties: !!item.properties,
          propertiesType: typeof item.properties,
          isArray: Array.isArray(item.properties),
          propertiesLength: item.properties?.length || 0,
          propertiesSample: item.properties?.[0] || null
        })
        
        if (item.properties && Array.isArray(item.properties) && item.properties.length > 0) {
          console.log(`✅ Line item ${index} (${item.name || item.title}) has ${item.properties.length} properties`)
          item.properties.forEach((prop: any) => {
            if (prop.name) {
              const key = `properties.${prop.name}`
              // If duplicate property name exists, keep the last one (or we could prefix with index)
              flattened[key] = prop.value || ''
              console.log(`  → Added ${key} = ${prop.value}`)
            } else {
              console.log(`  ⚠️ Property missing name:`, prop)
            }
          })
        } else {
          console.log(`⚠️ Line item ${index} (${item.name || item.title}) - properties check failed:`, {
            hasProperties: !!item.properties,
            isArray: Array.isArray(item.properties),
            length: item.properties?.length || 0
          })
        }
      })
      
      // Flatten the rest of the first line item (excluding properties since we handled them above)
      const lineItemWithoutProperties = { ...firstLineItem }
      delete lineItemWithoutProperties.properties
      Object.assign(flattened, flattenObject(lineItemWithoutProperties, ''))
      
      console.log('🔍 Final flattened keys with properties:', Object.keys(flattened).filter(k => k.startsWith('properties')))
    }
    return flattened
  }
  
  // Fetch Shopify order for custom line item field selector
  const handleFetchCustomLineItemOrder = async () => {
    if (!customLineItemOrderId.trim()) return
    
    setIsLoadingCustomLineItemOrder(true)
    try {
      // Remove # if present
      const orderId = customLineItemOrderId.replace(/^#/, '')
      const response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(orderId)}`)
      const data = await response.json()
      
      if (data.order) {
        console.log('📦 Raw order data from API:', {
          id: data.order.id,
          name: data.order.name,
          order_number: data.order.order_number
        })
        console.log('📦 Line items from API:', data.order.line_items)
        if (data.order.line_items && Array.isArray(data.order.line_items)) {
          data.order.line_items.forEach((item: any, idx: number) => {
            console.log(`📦 Line item ${idx} FULL OBJECT:`, JSON.stringify(item, null, 2))
            console.log(`📦 Line item ${idx} summary:`, {
              name: item.name || item.title,
              properties: item.properties,
              propertiesType: typeof item.properties,
              isArray: Array.isArray(item.properties),
              propertiesLength: item.properties?.length || 0,
              allKeys: Object.keys(item)
            })
          })
        }
        setCustomLineItemOrderData(data.order)
      } else {
        alert(`Order ${customLineItemOrderId} not found`)
        setCustomLineItemOrderData(null)
      }
    } catch (error) {
      console.error('Error fetching Shopify order:', error)
      alert('Failed to fetch order from Shopify')
      setCustomLineItemOrderData(null)
    } finally {
      setIsLoadingCustomLineItemOrder(false)
    }
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

  // Fetch Shopify order for Order Header configuration
  const handleFetchOrderHeaderOrder = async () => {
    if (!orderHeaderOrderId.trim()) return
    
    setIsLoadingOrderHeaderOrder(true)
    try {
      // Remove # if present
      const orderId = orderHeaderOrderId.replace(/^#/, '')
      const response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(orderId)}`)
      const data = await response.json()
      
      if (data.order) {
        setOrderHeaderOrderData(data.order)
      } else {
        alert(`Order ${orderHeaderOrderId} not found`)
        setOrderHeaderOrderData(null)
      }
    } catch (error) {
      console.error('Error fetching Shopify order:', error)
      alert('Failed to fetch order from Shopify')
      setOrderHeaderOrderData(null)
    } finally {
      setIsLoadingOrderHeaderOrder(false)
    }
  }

  // Fetch Shopify order for Translation configuration
  const handleFetchTranslationOrder = async () => {
    if (!translationOrderId.trim()) return
    
    setIsLoadingTranslationOrder(true)
    try {
      // Remove # if present
      const orderId = translationOrderId.replace(/^#/, '')
      const response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(orderId)}`)
      const data = await response.json()
      
      if (data.order) {
        setTranslationOrderData(data.order)
      } else {
        alert(`Order ${translationOrderId} not found`)
        setTranslationOrderData(null)
      }
    } catch (error) {
      console.error('Error fetching Shopify order:', error)
      alert('Failed to fetch order from Shopify')
      setTranslationOrderData(null)
    } finally {
      setIsLoadingTranslationOrder(false)
    }
  }

  // Load available Shopify values for a field
  const loadAvailableShopifyValues = async (shopifyCode: string) => {
    if (!shopifyCode) return
    
    setIsLoadingShopifyValues(true)
    try {
      const response = await fetch(`/api/mappings/order-fields/translation?shopifyCode=${encodeURIComponent(shopifyCode)}`)
      const data = await response.json()
      
      if (data.success && data.data) {
        setAvailableShopifyValues(data.data)
      } else {
        console.error('Error loading Shopify values:', data.error)
        setAvailableShopifyValues([])
      }
    } catch (error) {
      console.error('Error loading Shopify values:', error)
      setAvailableShopifyValues([])
    } finally {
      setIsLoadingShopifyValues(false)
    }
  }

  // Load NetSuite field info for translation dialog (uses same endpoint as Custom mapping)
  const loadTranslationNetSuiteFieldInfo = async (netsuiteFieldId: string) => {
    if (!netsuiteFieldId) {
      setTranslationNetSuiteFieldInfo(null)
      return
    }
    
    // Check if field requires dropdown lookup (same fields as Custom mapping)
    if (!fieldsWithDropdowns.includes(netsuiteFieldId)) {
      setTranslationNetSuiteFieldInfo(null)
      return
    }
    
    setIsLoadingTranslationNetSuiteFieldInfo(true)
    try {
      const response = await fetch(`/api/netsuite/lists?field=${netsuiteFieldId}`)
      const result = await response.json()
      
      if (result.success && result.items) {
        console.log('✅ Loaded NetSuite list for', netsuiteFieldId, ':', {
          itemsCount: result.items.length,
        })
        setTranslationNetSuiteFieldInfo({
          listItems: result.items || [],
        })
      } else {
        console.error('❌ Error loading NetSuite list:', result.error)
        setTranslationNetSuiteFieldInfo(null)
      }
    } catch (error) {
      console.error('Error loading NetSuite list:', error)
      setTranslationNetSuiteFieldInfo(null)
    } finally {
      setIsLoadingTranslationNetSuiteFieldInfo(false)
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

  // Fetch NetSuite list when Customer field requiring dropdown is selected
  useEffect(() => {
    if (isAddCustomerNetSuiteMappingDialogOpen && selectedCustomerNetSuiteField && customerFieldsWithDropdowns.includes(selectedCustomerNetSuiteField)) {
      fetchCustomerNetSuiteList(selectedCustomerNetSuiteField)
    } else if (selectedCustomerNetSuiteField && !customerFieldsWithDropdowns.includes(selectedCustomerNetSuiteField)) {
      setSelectedCustomerNetSuiteValue('')
      setCustomerNetSuiteListItems([])
    }
  }, [selectedCustomerNetSuiteField, isAddCustomerNetSuiteMappingDialogOpen])

  // Fetch NetSuite list for Order Item fields when a field requiring dropdown is selected
  useEffect(() => {
    if (isAddOrderItemNetSuiteMappingDialogOpen && selectedOrderItemNetSuiteField && orderItemFieldsWithDropdowns.includes(selectedOrderItemNetSuiteField)) {
      setIsLoadingOrderItemNetSuiteList(true)
      setSelectedOrderItemNetSuiteValue('')
      setOrderItemNetSuiteListItems([])
      
      fetch(`/api/netsuite/lists?field=${selectedOrderItemNetSuiteField}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.items) {
            setOrderItemNetSuiteListItems(data.items)
          } else {
            console.error('Error fetching Order Item NetSuite list:', data.error)
            setOrderItemNetSuiteListItems([])
          }
        })
        .catch(error => {
          console.error('Error fetching Order Item NetSuite list:', error)
          setOrderItemNetSuiteListItems([])
        })
        .finally(() => {
          setIsLoadingOrderItemNetSuiteList(false)
        })
    } else if (selectedOrderItemNetSuiteField && !orderItemFieldsWithDropdowns.includes(selectedOrderItemNetSuiteField) && selectedOrderItemNetSuiteField !== 'Custom field') {
      // Clear the value dropdown if field doesn't need it
      setSelectedOrderItemNetSuiteValue('')
      setOrderItemNetSuiteListItems([])
    }
  }, [selectedOrderItemNetSuiteField, isAddOrderItemNetSuiteMappingDialogOpen])

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

  // Fetch products from database (with pagination)
  const fetchProducts = async (page: number = productPagination.page, limit: number = productPagination.limit) => {
    setIsLoadingProducts(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('limit', limit.toString())
      if (productSearchTerm) {
        params.append('search', productSearchTerm)
      }
      
      const response = await fetch(`/api/products?${params.toString()}`)
      const data = await response.json()
      if (response.ok && data.success) {
        const loadedProducts = data.products || []
        setProducts(loadedProducts)
        setProductPagination(data.pagination)
        
        // Initialize product categories with default value
        const defaultCategories: Record<string, string> = {}
        loadedProducts.forEach((product: any) => {
          defaultCategories[product.id] = product.category || 'ShopifyPriceQty'
        })
        setProductCategories(prev => ({ ...prev, ...defaultCategories }))
        console.log(`✅ Loaded ${loadedProducts.length} products from database (page ${page})`)
      } else {
        console.error('Error fetching products:', data.error)
        alert(`Failed to fetch products: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching products:', error)
      alert(`Error fetching products: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoadingProducts(false)
    }
  }

  // Retrieve products from NetSuite and save to database
  const retrieveProductsFromNetSuite = async () => {
    setIsLoadingProducts(true)
    try {
      const params = new URLSearchParams()
      params.append('limit', '1000') // Fetch more from NetSuite
      
      const response = await fetch(`/api/netsuite/products?${params.toString()}`)
      const data = await response.json()
      if (response.ok && data.success) {
        const loadedProducts = data.items || []
        console.log(`✅ Retrieved ${loadedProducts.length} products from NetSuite`)
        
        // Save products to database
        try {
          const saveResponse = await fetch('/api/products/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: loadedProducts }),
          })
          const saveData = await saveResponse.json()
          if (saveData.success) {
            console.log(`💾 Saved ${saveData.imported} new and ${saveData.updated} updated products to database`)
            // Reload current page from database
            await fetchProducts(1, productPagination.limit)
          }
        } catch (error) {
          console.error('❌ Error saving products to database:', error)
        }
      } else {
        console.error('Error fetching products from NetSuite:', data.error)
        alert(`Failed to fetch products from NetSuite: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error fetching products from NetSuite:', error)
      alert(`Error fetching products from NetSuite: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoadingProducts(false)
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
        console.error('Error fetching transactions:', data)
        const errorMsg = data.error || 'Unknown error'
        const details = data.details ? `\n\nDetails: ${data.details}` : ''
        alert(`Error fetching transactions: ${errorMsg}${details}`)
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      alert(`Error fetching transactions: ${errorMsg}`)
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
        
        // Return the result so callers can check if orders were imported or updated
        return { success: true, imported: data.imported ?? 0, updated: data.updated ?? 0 }
      } else {
        console.error('❌ Failed to save orders to database:', data.error)
        alert(`Failed to save orders to database: ${data.error}`)
        return { success: false, error: data.error }
      }
    } catch (error) {
      console.error('❌ Error saving orders to database:', error)
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
        console.log(`✅ Fetched order ${order.name} from Shopify`)
        
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

  // Determine which orders to use: searched orders if searching, otherwise regular orders
  const ordersToFilter = orderSearchTerm.trim() ? searchedOrders : orders

  // Filter orders based on current filter state and search term
  // Note: If searching, the search is already done in the database, so we only apply other filters
  const filteredOrders = ordersToFilter.filter(order => {
    // If we're searching, the search is already done in the database query
    // So we only need to apply other filters here

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

  // Fetch unmapped payment methods from orders
  const fetchUnmappedPaymentMethods = async () => {
    try {
      const response = await fetch('/api/mappings/payment-methods/unmapped')
      const result = await response.json()
      if (result.success) {
        setUnmappedPaymentMethods(result.unmapped || [])
      }
    } catch (error) {
      console.error('Error fetching unmapped payment methods:', error)
    }
  }

  // Fetch NetSuite payment methods list
  const fetchPaymentMethodNetSuiteList = async () => {
    if (paymentMethodNetSuiteList.length > 0) return // Already loaded
    
    setIsLoadingPaymentMethods(true)
    try {
      const response = await fetch('/api/netsuite/lists?field=paymentMethod')
      const result = await response.json()
      if (result.success && result.items) {
        setPaymentMethodNetSuiteList(result.items)
      }
    } catch (error) {
      console.error('Error fetching NetSuite payment methods:', error)
    } finally {
      setIsLoadingPaymentMethods(false)
    }
  }

  // Fetch default payment method setting
  const fetchDefaultPaymentMethod = async () => {
    setIsLoadingDefaultPaymentMethod(true)
    try {
      const response = await fetch('/api/mappings/defaults?key=default_payment_method')
      const result = await response.json()
      if (result.success && result.value) {
        setDefaultPaymentMethod(result.value)
      }
    } catch (error) {
      console.error('Error fetching default payment method:', error)
    } finally {
      setIsLoadingDefaultPaymentMethod(false)
    }
  }

  // Save default payment method
  const saveDefaultPaymentMethod = async (value: string) => {
    try {
      const response = await fetch('/api/mappings/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'default_payment_method',
          value,
          description: 'Default payment method to use when no match is found',
        }),
      })
      const result = await response.json()
      if (result.success) {
        setDefaultPaymentMethod(value)
        return true
      }
      return false
    } catch (error) {
      console.error('Error saving default payment method:', error)
      return false
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
        setCustomerMappings(result.data.map((m: any) => ({
          id: String(m.id),
          mappingType: m.mappingType,
          shopifyCode: m.shopifyCode,
          shopifyValue: m.shopifyValue,
          netsuiteId: m.netsuiteId,
          applyToAllAccounts: m.applyToAllAccounts,
          isActive: m.isActive,
          customFieldId: m.customFieldId,
        })))
      }
    } catch (error) {
      console.error('Error fetching customer mappings:', error)
    }
  }

  // Fetch NetSuite list for customer field
  const fetchCustomerNetSuiteList = async (field: string) => {
    setIsLoadingCustomerNetSuiteList(true)
    try {
      const response = await fetch(`/api/netsuite/lists?field=${field}`)
      const result = await response.json()
      if (result.success && result.items) {
        setCustomerNetSuiteListItems(result.items)
      }
    } catch (error) {
      console.error(`Error fetching NetSuite ${field} list:`, error)
    } finally {
      setIsLoadingCustomerNetSuiteList(false)
    }
  }

  // Fetch custom customer field info from NetSuite
  const handleFetchCustomerCustomFieldInfo = async () => {
    if (!customCustomerNetSuiteFieldName.trim()) {
      setCustomerCustomFieldInfo(null)
      return
    }

    setIsLoadingCustomerCustomFieldInfo(true)
    setCustomerCustomFieldInfo(null)
    setCustomerCustomFieldValue('')

    try {
      const response = await fetch('/api/netsuite/field-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordType: 'customer',
          fieldId: customCustomerNetSuiteFieldName.trim(),
        }),
      })

      const result = await response.json()

      if (result.success && result.data) {
        const fieldInfo = {
          fieldType: result.data.fieldType,
          listItems: result.data.listItems || [],
        }
        setCustomerCustomFieldInfo(fieldInfo)
        console.log(`✅ Customer custom field info loaded:`, fieldInfo)
      } else {
        console.error('❌ Failed to fetch customer custom field info:', result.error)
        setCustomerCustomFieldInfo(null)
      }
    } catch (error) {
      console.error('❌ Error fetching customer custom field info:', error)
      setCustomerCustomFieldInfo(null)
    } finally {
      setIsLoadingCustomerCustomFieldInfo(false)
    }
  }

  // Save Customer Mappings
  const handleSaveCustomerMappings = async () => {
    try {
      const response = await fetch('/api/mappings/customer-fields', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappings: customerMappings }),
      })

      const result = await response.json()

      if (result.success) {
        alert(`✅ Successfully saved ${result.results?.length || customerMappings.length} customer mapping(s) to database!`)
        await fetchCustomerMappings() // Reload to get updated IDs
      } else {
        alert(`❌ Failed to save customer mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
        console.error('Save customer mappings error:', result)
      }
    } catch (error) {
      console.error('Error saving customer mappings:', error)
      alert(`❌ Error saving customer mappings: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

  // Order source mappings state
  const [orderSourceMappings, setOrderSourceMappings] = useState<Array<{
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isActive: boolean
  }>>([])

  // Order source mapping edit dialog state
  const [orderSourceMappingEditDialog, setOrderSourceMappingEditDialog] = useState<{
    isOpen: boolean
    mapping: {
      id: number
      appId: number | null
      sourceName: string | null
      friendlyName: string
      isActive: boolean
    } | null
  }>({
    isOpen: false,
    mapping: null
  })

  const fetchOrderSourceMappings = async () => {
    try {
      const response = await fetch('/api/mappings/order-source-mappings')
      const result = await response.json()
      if (result.success && result.data) {
        setOrderSourceMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching order source mappings:', error)
    }
  }

  const handleAddOrderSourceMapping = () => {
    setOrderSourceMappingEditDialog({
      isOpen: true,
      mapping: {
        id: 0,
        appId: null,
        sourceName: null,
        friendlyName: '',
        isActive: true
      }
    })
  }

  const handleEditOrderSourceMapping = (mapping: {
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isActive: boolean
  }) => {
    setOrderSourceMappingEditDialog({
      isOpen: true,
      mapping: { ...mapping }
    })
  }

  const handleSaveOrderSourceMapping = async (mapping: {
    id: number
    appId: number | null
    sourceName: string | null
    friendlyName: string
    isActive: boolean
  }) => {
    try {
      if (mapping.id === 0) {
        // Create new mapping
        const response = await fetch('/api/mappings/order-source-mappings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isActive: mapping.isActive,
          }),
        })

        const result = await response.json()

        if (result.success) {
          await fetchOrderSourceMappings()
          setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
        } else {
          alert(`Error creating order source mapping: ${result.error || 'Unknown error'}`)
        }
      } else {
        // Update existing mapping
        const response = await fetch(`/api/mappings/order-source-mappings/${mapping.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isActive: mapping.isActive,
          }),
        })

        const result = await response.json()

        if (result.success) {
          await fetchOrderSourceMappings()
          setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
        } else {
          alert(`Error updating order source mapping: ${result.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error saving order source mapping:', error)
      alert(`Error saving order source mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDeleteOrderSourceMapping = async (mappingId: number) => {
    try {
      const response = await fetch(`/api/mappings/order-source-mappings/${mappingId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        await fetchOrderSourceMappings()
        closeDeleteConfirmDialog()
      } else {
        alert(`Error deleting order source mapping: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting order source mapping:', error)
      alert(`Error deleting order source mapping: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
    fetchOrderSourceMappings()
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

  useEffect(() => {
    if (activeSection === 'products') {
      fetchProducts(1, productPagination.limit)
    }
  }, [activeSection])

  // Debounce search for products
  useEffect(() => {
    if (activeSection !== 'products') return
    
    const timeoutId = setTimeout(() => {
      fetchProducts(1, productPagination.limit)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [productSearchTerm])

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

  // Load payment method data when Payment tab is active
  useEffect(() => {
    if (activeMappingTab === 'Payment') {
      fetchPaymentMappings()
      fetchUnmappedPaymentMethods()
      fetchPaymentMethodNetSuiteList()
      fetchDefaultPaymentMethod()
    }
  }, [activeMappingTab])

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
              {['General', 'Order Source Mappings', 'Field Discovery'].map((tab) => (
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

            {/* Order Source Mappings Tab */}
            {activeSettingsTab === 'Order Source Mappings' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Order Source Mappings
                    </CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Map Shopify order sources (app IDs and source names) to friendly display names.
                    </p>
                  </div>
                  <Button onClick={handleAddOrderSourceMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Add Mapping
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Order Source Mappings Table */}
                    <div className="border rounded-lg">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">App ID</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Source Name</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Friendly Name</th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Active</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {orderSourceMappings.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                                No order source mappings found. Click "Add Mapping" to create one.
                              </td>
                            </tr>
                          ) : (
                            orderSourceMappings.map((mapping) => (
                              <tr key={mapping.id}>
                                <td className="px-4 py-3 text-sm text-slate-900 font-mono">
                                  {mapping.appId ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-600">
                                  {mapping.sourceName ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                  {mapping.friendlyName}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    mapping.isActive 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {mapping.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleEditOrderSourceMapping(mapping)}
                                    >
                                      Edit
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => openDeleteConfirmDialog('Order Source Mapping', mapping.friendlyName, mapping.id.toString())}
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

            {/* Edit/Create Order Source Mapping Dialog */}
            <Dialog open={orderSourceMappingEditDialog.isOpen} onOpenChange={(open) => {
              if (!open) {
                setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })
              }
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {orderSourceMappingEditDialog.mapping?.id === 0 ? 'Create' : 'Edit'} Order Source Mapping
                  </DialogTitle>
                </DialogHeader>
                {orderSourceMappingEditDialog.mapping && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        App ID (optional)
                      </label>
                      <Input
                        type="number"
                        value={orderSourceMappingEditDialog.mapping.appId || ''}
                        onChange={(e) => setOrderSourceMappingEditDialog({
                          ...orderSourceMappingEditDialog,
                          mapping: {
                            ...orderSourceMappingEditDialog.mapping!,
                            appId: e.target.value ? Number(e.target.value) : null,
                            sourceName: e.target.value ? null : orderSourceMappingEditDialog.mapping!.sourceName
                          }
                        })}
                        placeholder="e.g., 2329312, 3890849"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Shopify app_id (e.g., 2329312 for Facebook, 3890849 for Shop App)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Source Name (optional)
                      </label>
                      <Input
                        value={orderSourceMappingEditDialog.mapping.sourceName || ''}
                        onChange={(e) => setOrderSourceMappingEditDialog({
                          ...orderSourceMappingEditDialog,
                          mapping: {
                            ...orderSourceMappingEditDialog.mapping!,
                            sourceName: e.target.value || null,
                            appId: e.target.value ? null : orderSourceMappingEditDialog.mapping!.appId
                          }
                        })}
                        placeholder="e.g., web, checkout"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Shopify source_name (e.g., 'web', 'checkout'). Either App ID or Source Name must be provided.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Friendly Name *
                      </label>
                      <Input
                        value={orderSourceMappingEditDialog.mapping.friendlyName}
                        onChange={(e) => setOrderSourceMappingEditDialog({
                          ...orderSourceMappingEditDialog,
                          mapping: {
                            ...orderSourceMappingEditDialog.mapping!,
                            friendlyName: e.target.value
                          }
                        })}
                        placeholder="e.g., Facebook, Shop App, Web"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Display name shown in the transactions table
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={orderSourceMappingEditDialog.mapping.isActive}
                        onChange={(e) => setOrderSourceMappingEditDialog({
                          ...orderSourceMappingEditDialog,
                          mapping: {
                            ...orderSourceMappingEditDialog.mapping!,
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
                        onClick={() => setOrderSourceMappingEditDialog({ isOpen: false, mapping: null })}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleSaveOrderSourceMapping(orderSourceMappingEditDialog.mapping!)}
                      >
                        {orderSourceMappingEditDialog.mapping.id === 0 ? 'Create' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
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
        
      case 'products':
        return renderProductsContent()
        
      case 'mappings-orders':
        return renderMappingsOrdersContent()
        
      case 'mappings-customers':
        return renderMappingsCustomersContent()
        
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

  const renderProductsContent = () => {
    const toggleProductSelection = (productId: string) => {
      setSelectedProducts(prev => {
        const next = new Set(prev)
        if (next.has(productId)) {
          next.delete(productId)
        } else {
          next.add(productId)
        }
        return next
      })
    }

    const toggleAllProducts = () => {
      if (selectedProducts.size === products.length) {
        setSelectedProducts(new Set())
      } else {
        setSelectedProducts(new Set(products.map(p => p.id)))
      }
    }

    const handlePageChange = (newPage: number) => {
      fetchProducts(newPage, productPagination.limit)
    }

    const handleLimitChange = (newLimit: number) => {
      fetchProducts(1, newLimit)
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Products</h2>
          <p className="text-slate-600">Manage products synced from NetSuite.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Products</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={retrieveProductsFromNetSuite} disabled={isLoadingProducts}>
                  {isLoadingProducts ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                  Sync
                </Button>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Errors/Exclusions
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Bulk actions
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Reload Selected Products from NetSuite</DropdownMenuItem>
                    <DropdownMenuItem>Post Selected Products to Shopify</DropdownMenuItem>
                    <DropdownMenuItem>Post Price/Inventory for Selected Products to Shopify</DropdownMenuItem>
                    <DropdownMenuItem>Delete Selected Products from Shopify</DropdownMenuItem>
                    <DropdownMenuItem>Delete selected products from NetSuite Connector</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  placeholder="Search Products"
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchProducts(1, productPagination.limit)
                    }
                  }}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="text-sm text-slate-600 mb-4">
              {selectedProducts.size} / {productPagination.limit} selected
            </div>

            {isLoadingProducts ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                <p className="text-sm text-slate-500 mt-2">Loading products from database...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No products loaded. Click "Sync" to fetch products from NetSuite.
              </div>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <Checkbox
                            checked={selectedProducts.size === products.length && products.length > 0}
                            onCheckedChange={toggleAllProducts}
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">SKU</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Shopify</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">default</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Quantity Available</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                          <div className="flex items-center gap-2">
                            Category
                            <Pencil className="h-3 w-3 text-slate-400" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {products.map((product) => {
                        const isSelected = selectedProducts.has(product.id)
                        const hasExclusion = product.exclusionReason || product.status === 'excluded'
                        const hasError = product.error || product.status === 'error'
                        const productCategory = productCategories[product.id] || product.category || 'ShopifyPriceQty'
                        const isEditingCategory = editingProductCategory === product.id
                        
                        return (
                          <tr key={product.id} className={isSelected ? 'bg-blue-50' : ''}>
                            <td className="px-4 py-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleProductSelection(product.id)}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-slate-700">{product.sku || product.id}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">Shopify</td>
                            <td className="px-4 py-3 text-sm text-slate-700">default</td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {product.quantityAvailable !== null && product.quantityAvailable !== undefined 
                                ? product.quantityAvailable.toLocaleString() 
                                : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {hasError ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                  Error trying to post to Shopify
                                </span>
                              ) : hasExclusion ? (
                                <span className="text-red-600 text-xs">This product is excluded by a mapping rule and will not post.</span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                  Active
                                </span>
                              )}
                            </td>
                          <td className="px-4 py-3 text-sm">
                            {isEditingCategory ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={productCategory}
                                  onChange={(e) => {
                                    setProductCategories(prev => ({
                                      ...prev,
                                      [product.id]: e.target.value
                                    }))
                                  }}
                                  className="h-7 text-xs w-32"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      setEditingProductCategory(null)
                                    } else if (e.key === 'Escape') {
                                      setEditingProductCategory(null)
                                      setProductCategories(prev => {
                                        const next = { ...prev }
                                        delete next[product.id]
                                        return next
                                      })
                                    }
                                  }}
                                  onBlur={() => setEditingProductCategory(null)}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingProductCategory(null)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-700">{productCategory}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingProductCategory(product.id)}
                                  className="h-5 w-5 p-0 hover:bg-slate-100"
                                >
                                  <Pencil className="h-3 w-3 text-slate-500" />
                                </Button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu open={productActionMenuOpen === product.id} onOpenChange={(open) => setProductActionMenuOpen(open ? product.id : null)}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  setProductDetailsDialog({ isOpen: true, product })
                                }}>
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement show product mapping
                                  alert(`Show product mapping for: ${product.sku || product.name}`)
                                }}>
                                  Show Product Mapping
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement show NetSuite system notes
                                  alert(`Show NetSuite System Notes for: ${product.sku || product.name}`)
                                }}>
                                  Show NetSuite System Notes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement reload from NetSuite
                                  alert(`Reload from NetSuite: ${product.sku || product.name}`)
                                }}>
                                  Reload from NetSuite
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement update inventory and price
                                  alert(`Update Inventory and Price on Shopify for: ${product.sku || product.name}`)
                                }}>
                                  Update Inventory and Price on Shopify
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement delete from Shopify
                                  if (confirm(`Delete ${product.sku || product.name} from Shopify?`)) {
                                    alert(`Delete from Shopify: ${product.sku || product.name}`)
                                  }
                                }}>
                                  Delete from Shopify
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setProductActionMenuOpen(null)
                                  // TODO: Implement delete from NetSuite Connector
                                  if (confirm(`Delete ${product.sku || product.name} from NetSuite Connector?`)) {
                                    alert(`Delete from NetSuite Connector: ${product.sku || product.name}`)
                                  }
                                }}>
                                  Delete from NetSuite Connector
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {productPagination.totalPages > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-slate-600">
                    {((productPagination.page - 1) * productPagination.limit) + 1} – {Math.min(productPagination.page * productPagination.limit, productPagination.total)} of {productPagination.total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(productPagination.page - 1)}
                      disabled={productPagination.page === 1}
                    >
                      «
                    </Button>
                    {Array.from({ length: Math.min(productPagination.totalPages, 5) }, (_, i) => {
                      let pageNum: number
                      if (productPagination.totalPages <= 5) {
                        pageNum = i + 1
                      } else if (productPagination.page <= 3) {
                        pageNum = i + 1
                      } else if (productPagination.page >= productPagination.totalPages - 2) {
                        pageNum = productPagination.totalPages - 4 + i
                      } else {
                        pageNum = productPagination.page - 2 + i
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={productPagination.page === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(productPagination.page + 1)}
                      disabled={productPagination.page >= productPagination.totalPages}
                    >
                      »
                    </Button>
                    <div className="flex items-center gap-1 ml-4">
                      {[10, 25, 50, 100, 500].map((limit) => (
                        <Button
                          key={limit}
                          variant={productPagination.limit === limit ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleLimitChange(limit)}
                          className="h-8 px-3"
                        >
                          {limit}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>

        {/* Exclusion Reason Dialog */}
        <Dialog open={exclusionReasonDialog.isOpen} onOpenChange={(open) => setExclusionReasonDialog({ isOpen: open, product: null })}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Exclusion reason:</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {exclusionReasonDialog.product && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Product: {exclusionReasonDialog.product.sku || exclusionReasonDialog.product.name}</p>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">
                    {exclusionReasonDialog.product.exclusionReason || `Syncing price and/or quantity to Shopify requires that the item already exist in Shopify and that the SKU match exactly to the one being synced. NetSuite Connector price and/or quantity sync updates existing items but can't create items that don't exist and/or can't be found by searching for a matching SKU. Please create the item in Shopify directly and/or ensure that the SKU matches what's being synced, and then the price and/or quantity update should work.

**Please note that for some storefronts (like Shopify) SKUS are case sensitive. Therefore SKU ABC is not the same as SKU abc.**

Additionally if you created this product via some import process to the storefront, there may be invisible Unicode characters that were imported into your SKU field that will not render in the storefront UI. If you have verified the SKU in the storefronts matches NetSuite, then completely delete the SKU value in the storefront on the item and, once the field appears empty, press DEL and/or BACKSPACE multiple times to make sure you have deleted all the hidden characters. Reinput and resave your SKU value and then see if it will sync. If it does, you likely have many more imported items with this issue you will need to address directly in the storefront.

If you've created a matching SKU in Shopify, you'll need to trigger a resync. Once an item is excluded, it won't resync automatically unless NetSuite Connector detects a change to the item data in NetSuite. This helps ensure that legitimate updates aren't slowed down by repeatedly trying to sync items that can't be synced.`}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Product Details Dialog */}
        <Dialog open={productDetailsDialog.isOpen} onOpenChange={(open) => setProductDetailsDialog({ isOpen: open, product: null })}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
            </DialogHeader>
            {productDetailsDialog.product && (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Field name</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Field Id</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Created Date</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">createdDate</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.createdDate || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Last Loaded from NetSuite</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">FarAppLastLoaded</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.lastLoadedFromNetSuite || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Last Modified in NetSuite Connector</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">FarAppLastModified</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.lastModifiedInConnector || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Last Pushed To</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">FarAppLastPushedTo</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.lastPushedTo || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Last Source Change</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">FarAppLastSourceChange</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.lastSourceChange || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Is Fulfillable</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">isFulfillable</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.isFulfillable ? 'true' : 'false'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Inactive</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">isInactive</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.isinactive === 'T' || productDetailsDialog.product.isinactive === true ? 'true' : 'false'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Online</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">isOnline</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.isOnline ? 'true' : 'false'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Item Name or Number</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">itemId</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.sku || productDetailsDialog.product.id}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Last Modified</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">lastModifiedDate</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.lastModifiedDate || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Item Type</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">NSItemType</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.type || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Internal ID</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">ProductID</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.id}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Sale Unit .name</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">saleUnit.name</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.saleUnit?.name || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Shopify Inventory Item ID (default)</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">ShopifyInventoryItemID-default</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.shopifyInventoryItemId || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Shopify Product ID (default)</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">ShopifyProductID-default</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.shopifyProductId || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Shopify Variant ID (default)</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">ShopifyVariantID-default</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.shopifyVariantId || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-slate-600">Units Type .name</td>
                        <td className="px-4 py-2 text-sm font-mono text-slate-500">unitsType.name</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{productDetailsDialog.product.unitsType?.name || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setProductDetailsDialog({ isOpen: false, product: null })}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    // TODO: Implement reload from NetSuite
                    alert(`Reload from NetSuite: ${productDetailsDialog.product.sku || productDetailsDialog.product.name}`)
                  }}>
                    Reload from NetSuite
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
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
            key={selectedPayoutId || 'transactions-dialog'}
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
        case 'Order Source Mapping':
          await handleDeleteOrderSourceMapping(parseInt(itemId))
          closeDeleteConfirmDialog()
          return // handleDeleteOrderSourceMapping already refreshes the list
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
        
        // Refresh mappings and unmapped list
        await fetchPaymentMappings()
        await fetchUnmappedPaymentMethods()
        
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
        
        {/* Navigation Tabs - nav-mappings-orders-tab-payment, nav-mappings-orders-tab-shipment, nav-mappings-orders-tab-order, nav-mappings-orders-tab-order-item */}
        <div className="flex space-x-1 border-b">
          {['Payment', 'Shipment', 'Order', 'Order Item'].map((tab) => (
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
              <div className="flex items-center justify-between">
              <CardTitle>Payment Methods</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    await fetchUnmappedPaymentMethods()
                    await fetchPaymentMappings()
                  }}
                >
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Default Payment Method */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Default payment method to post when no match found</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Select
                      value={defaultPaymentMethod || 'none'}
                      onValueChange={async (value) => {
                        // Save empty string if "none" is selected, otherwise save the value
                        await saveDefaultPaymentMethod(value === 'none' ? '' : value)
                      }}
                      onOpenChange={(open) => {
                        if (open && paymentMethodNetSuiteList.length === 0) {
                          fetchPaymentMethodNetSuiteList()
                        }
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder={isLoadingDefaultPaymentMethod ? "Loading..." : "Select default..."}>
                          {defaultPaymentMethod && defaultPaymentMethod !== '' && paymentMethodNetSuiteList.length > 0
                            ? paymentMethodNetSuiteList.find(pm => pm.id === defaultPaymentMethod)?.name || defaultPaymentMethod
                            : defaultPaymentMethod === '' || !defaultPaymentMethod ? "Do Not Post" : "Select default..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Do Not Post</SelectItem>
                        {isLoadingPaymentMethods ? (
                          <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                        ) : paymentMethodNetSuiteList.length > 0 ? (
                          paymentMethodNetSuiteList.map((pm) => (
                            <SelectItem key={pm.id} value={pm.id}>
                              {pm.name} (IID: {pm.id})
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-slate-500">No payment methods available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Mapped Payment Methods */}
                {paymentMappings.length > 0 && (
                  <div>
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg mb-3">
                    <div className="font-medium text-slate-700 flex items-center space-x-2">
                      <span>Shopify Payment Method</span>
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="font-medium text-slate-700 flex items-center space-x-2">
                      <span>NetSuite Payment Option</span>
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                  
                    {paymentMappings.map((mapping) => (
                      <div key={mapping.id} className="grid grid-cols-2 gap-4 p-4 border rounded-lg mb-2">
                        <div className="text-slate-700 font-medium flex items-center">{mapping.shopifyCode}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">→</span>
                          <Select
                            value={mapping.netsuiteId}
                            onValueChange={async (value) => {
                              await addPaymentMethodMapping(mapping.shopifyCode, value)
                            }}
                            onOpenChange={(open) => {
                              if (open && paymentMethodNetSuiteList.length === 0) {
                                fetchPaymentMethodNetSuiteList()
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {paymentMethodNetSuiteList.find(pm => pm.id === mapping.netsuiteId)?.name || mapping.netsuiteId}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingPaymentMethods ? (
                                <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                              ) : paymentMethodNetSuiteList.length > 0 ? (
                                paymentMethodNetSuiteList.map((pm) => (
                                  <SelectItem key={pm.id} value={pm.id}>
                                    {pm.name} (IID: {pm.id})
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-2 py-1.5 text-sm text-slate-500">No payment methods available</div>
                              )}
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openDeleteConfirmDialog('Payment Method', mapping.shopifyCode, mapping.id.toString())}
                          >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                )}

                {/* Unmapped Payment Methods */}
                {unmappedPaymentMethods.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="mb-3">
                      <h4 className="font-medium text-red-700 flex items-center space-x-2 mb-1">
                        <span>⚠️ Unmapped Payment Methods</span>
                      </h4>
                      <p className="text-sm text-slate-600">These payment methods from your orders need to be mapped:</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 p-4 bg-red-50 rounded-lg mb-3">
                      <div className="font-medium text-slate-700 flex items-center space-x-2">
                        <span>Shopify Payment Method</span>
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="font-medium text-slate-700 flex items-center space-x-2">
                        <span>NetSuite Payment Option</span>
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    
                    {unmappedPaymentMethods.map((paymentMethod) => (
                      <div key={paymentMethod} className="grid grid-cols-2 gap-4 p-4 border border-red-200 rounded-lg mb-2 bg-white">
                        <div className="text-red-700 font-medium flex items-center">{paymentMethod}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">→</span>
                          <Select
                            onValueChange={async (value) => {
                              const success = await addPaymentMethodMapping(paymentMethod, value)
                              if (success) {
                                // Mapping will be removed from unmapped list automatically via useEffect
                              }
                            }}
                            onOpenChange={(open) => {
                              if (open && paymentMethodNetSuiteList.length === 0) {
                                fetchPaymentMethodNetSuiteList()
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select NetSuite payment method..." />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingPaymentMethods ? (
                                <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                              ) : paymentMethodNetSuiteList.length > 0 ? (
                                paymentMethodNetSuiteList.map((pm) => (
                                  <SelectItem key={pm.id} value={pm.id}>
                                    {pm.name} (IID: {pm.id})
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-2 py-1.5 text-sm text-slate-500">No payment methods available</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {paymentMappings.length === 0 && unmappedPaymentMethods.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <p>No payment methods found. Import orders to see payment methods that need mapping.</p>
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
                  // Prepare mappings for save - include translation mappings if they exist
                  const mappingsToSave = orderMappings.map((mapping, index) => {
                    // First check if mapping already has translation mappings stored
                    if (mapping.translationMappings && Array.isArray(mapping.translationMappings) && mapping.translationMappings.length > 0) {
                      // Ensure translation mappings are in the correct format (remove id if present for new mappings)
                      const formattedTranslations = mapping.translationMappings.map((tm: any) => ({
                        shopifyValue: tm.shopifyValue,
                        netsuiteValue: tm.netsuiteValue,
                        isActive: tm.isActive !== false,
                      }))
                      return {
                        ...mapping,
                        translationMappings: formattedTranslations,
                      }
                    }
                    
                    // If this mapping has translation mappings configured in the dialog, include them
                    // Check by index or by ID (for both temp IDs and real IDs)
                    if (translationMappingIndex !== null) {
                      const dialogMapping = orderMappings[translationMappingIndex]
                      // Match by index or by ID (handles both temp IDs and real IDs)
                      if ((dialogMapping && (
                          mapping.id === dialogMapping.id || 
                          index === translationMappingIndex
                        )) && translationMappings.length > 0) {
                        return {
                          ...mapping,
                          translationMappings: translationMappings
                            .filter((tm) => tm.shopifyValue && tm.netsuiteValue)
                            .map((tm: any) => ({
                              shopifyValue: tm.shopifyValue,
                              netsuiteValue: tm.netsuiteValue,
                              isActive: tm.isActive !== false,
                            })),
                          translationDefaultValue: translationDefaultValue || undefined,
                        }
                      }
                    }
                    return mapping
                  })
                  
                  // Debug logging
                  const mappingsWithTranslations = mappingsToSave.filter(m => m.translationMappings && m.translationMappings.length > 0)
                  if (mappingsWithTranslations.length > 0) {
                    console.log('Saving mappings with translations:', mappingsWithTranslations.map(m => ({
                      id: m.id,
                      netsuiteId: m.netsuiteId,
                      translationCount: m.translationMappings?.length || 0,
                      translations: m.translationMappings
                    })))
                  }

                  // Save all mappings to database
                  const response = await fetch('/api/mappings/order-fields', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mappings: mappingsToSave }),
                  })

                  const result = await response.json()
                  
                  if (result.success) {
                    alert(`✅ Successfully saved ${result.results?.length || orderMappings.length} mapping(s) to database!`)
                    // Clear translation dialog state if it was open
                    if (translationMappingIndex !== null) {
                      setTranslationMappings([])
                      setTranslationDefaultValue('')
                      setTranslationMappingIndex(null)
                    }
                    // Reload mappings from database to get updated IDs
                    await fetchOrderMappings()
                  } else {
                    alert(`❌ Failed to save mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
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
                             ) : mapping.mappingType === 'Order Header' ? (
                               <div className="w-full">
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
                               </div>
                             ) : mapping.mappingType === 'Order Header with Translation' ? (
                               <div className="w-full">
                                 {mapping.shopifyCode ? (
                                   <div className="text-slate-700 text-sm p-2 border rounded bg-slate-50 mb-2">
                                     {mapping.shopifyCode}
                                   </div>
                                 ) : null}
                                 <Button
                                   type="button"
                                   variant="outline"
                                   size="sm"
                                  onClick={() => {
                                    setTranslationMappingIndex(index)
                                    setTranslationMappings(mapping.translationMappings || [])
                                    setTranslationDefaultValue(mapping.translationDefaultValue || '')
                                    setIsTranslationDialogOpen(true)
                                    // Load available Shopify values if shopifyCode is already set
                                    if (mapping.shopifyCode) {
                                      loadAvailableShopifyValues(mapping.shopifyCode)
                                    }
                                    // Load NetSuite field info to determine if dropdowns should be used
                                    if (mapping.netsuiteId) {
                                      loadTranslationNetSuiteFieldInfo(mapping.netsuiteId)
                                    }
                                  }}
                                   className="w-full"
                                 >
                                   Configure
                                 </Button>
                               </div>
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
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                // Reset to saved state - reload from database
                fetchOrderItemMappings()
              }}
            >
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              size="sm"
              onClick={async () => {
                try {
                  // Prepare mappings for save
                  const mappingsToSave = orderItemMappings.map((mapping) => ({
                    ...mapping,
                  }))

                  // Save all mappings to database
                  const response = await fetch('/api/mappings/order-item-fields', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mappings: mappingsToSave }),
                  })

                  const result = await response.json()
                  
                  if (result.success) {
                    alert(`✅ Successfully saved ${result.results?.length || orderItemMappings.length} mapping(s) to database!`)
                    // Reload mappings from database to get updated IDs
                    await fetchOrderItemMappings()
                  } else {
                    alert(`❌ Failed to save mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
                    console.error('Save error:', result)
                  }
                } catch (error) {
                  console.error('Error saving order item mappings:', error)
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
                <span>Shopify field / fixed value</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>NetSuite field</span>
              </div>
                    <div>Delete</div>
                  </div>
            
                     {orderItemMappings.map((mapping, index) => (
              <div key={mapping.id || index} className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={mapping.isActive}
                    onCheckedChange={(checked) => {
                      const updated = [...orderItemMappings]
                      updated[index] = { ...updated[index], isActive: checked === true }
                      setOrderItemMappings(updated)
                    }}
                  />
                  <Select
                    value={mapping.mappingType}
                    onValueChange={(value) => {
                      const updated = [...orderItemMappings]
                      updated[index] = { 
                        ...updated[index], 
                        mappingType: value as 'Fixed' | 'Order Line' | 'Custom',
                        shopifyCode: value === 'Order Line' ? undefined : updated[index].shopifyCode,
                        shopifyValue: value === 'Fixed' ? updated[index].shopifyValue : undefined,
                      }
                      setOrderItemMappings(updated)
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fixed">Fixed</SelectItem>
                      <SelectItem value="Order Line">Order Line</SelectItem>
                      <SelectItem value="Custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                    </div>
                <div className="flex items-center">
                  {mapping.mappingType === 'Order Line' ? (
                    <Select
                      value={mapping.shopifyCode || ''}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setEditingOrderItemMappingIndex(index)
                          setIsCustomLineItemFieldDialogOpen(true)
                        } else {
                          const updated = [...orderItemMappings]
                          updated[index] = { ...updated[index], shopifyCode: value }
                          setOrderItemMappings(updated)
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Shopify field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {commonOrderLineFields.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                        {orderItemMappings
                          .filter(m => m.shopifyCode && m.shopifyCode.startsWith('Custom:'))
                          .map((m) => m.shopifyCode!)
                          .filter((code, idx, arr) => arr.indexOf(code) === idx) // Unique values
                          .map((code) => (
                            <SelectItem key={code} value={code}>
                              {code}
                            </SelectItem>
                          ))}
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : mapping.mappingType === 'Fixed' && orderItemFieldsWithDropdowns.includes(mapping.netsuiteId) ? (
                    // For Fixed mappings with NetSuite dropdowns, show dropdown
                    <Select
                      value={extractIdFromShopifyValue(mapping.shopifyValue) || undefined}
                      onValueChange={(value) => {
                        const listItems = netsuiteListCache[mapping.netsuiteId] || []
                        const selectedItem = listItems.find(item => item.id === value)
                        if (selectedItem) {
                          const updated = [...orderItemMappings]
                          updated[index] = {
                            ...updated[index],
                            shopifyValue: `${selectedItem.name} (IID: ${selectedItem.id})`,
                          }
                          setOrderItemMappings(updated)
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
                            if (mapping.shopifyValue) {
                              const selectedId = extractIdFromShopifyValue(mapping.shopifyValue)
                              if (selectedId && netsuiteListCache[mapping.netsuiteId]) {
                                const selectedItem = netsuiteListCache[mapping.netsuiteId].find(item => item.id === selectedId)
                                return selectedItem ? selectedItem.name : mapping.shopifyValue || "Select value..."
                              }
                              return mapping.shopifyValue || "Select value..."
                            }
                            return "Select value..."
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
                    <Input
                      value={mapping.shopifyValue || ''}
                      onChange={(e) => {
                        const updated = [...orderItemMappings]
                        updated[index] = { ...updated[index], shopifyValue: e.target.value }
                        setOrderItemMappings(updated)
                      }}
                      placeholder="Enter fixed value..."
                      className="w-full"
                    />
                  ) : (
                    <div className="text-slate-400 italic text-sm p-2 w-full">
                      Custom field
                </div>
                  )}
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
                        value={mapping.customFieldId || mapping.netsuiteId || ''}
                        onChange={(e) => {
                          const updated = [...orderItemMappings]
                          updated[index] = { 
                            ...updated[index], 
                            netsuiteId: e.target.value,
                            customFieldId: e.target.value,
                          }
                          setOrderItemMappings(updated)
                        }}
                        className="w-full"
                      />
                    </div>
                  )}
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
            <Button 
              variant="outline"
              onClick={() => setIsAddOrderItemNetSuiteMappingDialogOpen(true)}
            >
              <Database className="h-4 w-4 mr-2" /> Add row
            </Button>
          </div>
        </CardContent>
          </Card>
        )}

      </div>
    )
  }

  const renderMappingsCustomersContent = () => {
    return (
          <div className="space-y-6">
            <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Customer Mappings</h2>
              <p className="text-slate-600">Configure how Shopify customer data maps to NetSuite fields.</p>
            </div>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Customer Mappings</CardTitle>
          <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Reset to saved state - reload from database
                  fetchCustomerMappings()
                }}
              >
                Cancel
            </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white" 
                size="sm"
                onClick={handleSaveCustomerMappings}
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
                <span>Shopify field / fixed value</span>
              </div>
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>NetSuite field</span>
              </div>
                    <div>Delete</div>
                  </div>
            
                       {customerMappings.map((mapping, index) => (
                <div key={mapping.id || index} className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={mapping.isActive}
                      onCheckedChange={(checked) => {
                        const updated = [...customerMappings]
                        updated[index] = { ...updated[index], isActive: checked === true }
                        setCustomerMappings(updated)
                      }}
                    />
                    <Select
                      value={mapping.mappingType}
                      onValueChange={(value) => {
                        const updated = [...customerMappings]
                        updated[index] = { 
                          ...updated[index], 
                          mappingType: value as 'Fixed' | 'Customer Field' | 'Custom',
                          shopifyCode: value === 'Customer Field' ? undefined : updated[index].shopifyCode,
                          shopifyValue: value === 'Fixed' ? updated[index].shopifyValue : undefined,
                        }
                        setCustomerMappings(updated)
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fixed">Fixed</SelectItem>
                        <SelectItem value="Customer Field">Customer Field</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                  <div className="flex items-center">
                    {mapping.mappingType === 'Customer Field' ? (
                      <Select
                        value={mapping.shopifyCode || ''}
                        onValueChange={(value) => {
                          const updated = [...customerMappings]
                          updated[index] = { ...updated[index], shopifyCode: value }
                          setCustomerMappings(updated)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select Shopify field..." />
                        </SelectTrigger>
                        <SelectContent>
                          {commonCustomerFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : mapping.mappingType === 'Fixed' && customerFieldsWithDropdowns.includes(mapping.netsuiteId) ? (
                      <Select
                        value={extractIdFromShopifyValue(mapping.shopifyValue) || undefined}
                        onValueChange={(value) => {
                          const listItems = netsuiteListCache[mapping.netsuiteId] || []
                          const selectedItem = listItems.find(item => item.id === value)
                          if (selectedItem) {
                            const updated = [...customerMappings]
                            updated[index] = {
                              ...updated[index],
                              shopifyValue: `${selectedItem.name} (IID: ${selectedItem.id})`,
                            }
                            setCustomerMappings(updated)
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
                              if (mapping.shopifyValue) {
                                const selectedId = extractIdFromShopifyValue(mapping.shopifyValue)
                                if (selectedId && netsuiteListCache[mapping.netsuiteId]) {
                                  const selectedItem = netsuiteListCache[mapping.netsuiteId].find(item => item.id === selectedId)
                                  return selectedItem ? selectedItem.name : mapping.shopifyValue || "Select value..."
                                }
                                return mapping.shopifyValue || "Select value..."
                              }
                              return "Select value..."
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
                      <Input
                        value={mapping.shopifyValue || ''}
                        onChange={(e) => {
                          const updated = [...customerMappings]
                          updated[index] = { ...updated[index], shopifyValue: e.target.value }
                          setCustomerMappings(updated)
                        }}
                        placeholder="Enter fixed value..."
                        className="w-full"
                      />
                    ) : (
                      <div className="text-slate-400 italic text-sm p-2 w-full">
                        Custom field
                </div>
                    )}
                </div>
                  <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">→</span>
                      <Select
                        value={mapping.netsuiteId}
                        onValueChange={(value) => {
                          const updated = [...customerMappings]
                          updated[index] = { ...updated[index], netsuiteId: value }
                          setCustomerMappings(updated)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {standardCustomerFields.find(f => f.value === mapping.netsuiteId)?.label || mapping.netsuiteId}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {standardCustomerFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                </div>
                    {mapping.mappingType === 'Custom' && (
                      <div className="flex items-center space-x-2 ml-6">
                        <span className="text-sm text-slate-600">Custom field ID:</span>
                        <Input 
                          placeholder="e.g., custentity_custom_field"
                          value={mapping.customFieldId || mapping.netsuiteId || ''}
                          onChange={(e) => {
                            const updated = [...customerMappings]
                            updated[index] = { 
                              ...updated[index], 
                              netsuiteId: e.target.value,
                              customFieldId: e.target.value,
                            }
                            setCustomerMappings(updated)
                          }}
                          className="w-full"
                        />
                      </div>
                    )}
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
              <Button variant="outline" onClick={() => setIsAddCustomerNetSuiteMappingDialogOpen(true)}>
              <Database className="h-4 w-4 mr-2" /> Add row
            </Button>
          </div>
        </CardContent>
            </Card>
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

      {/* Add Order Item NetSuite Mapping Dialog */}
      <Dialog open={isAddOrderItemNetSuiteMappingDialogOpen} onOpenChange={setIsAddOrderItemNetSuiteMappingDialogOpen}>
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
                value={selectedOrderItemNetSuiteField} 
                onValueChange={(value) => {
                  setSelectedOrderItemNetSuiteField(value)
                  setCustomOrderItemNetSuiteFieldName('')
                  setSelectedOrderItemNetSuiteValue('')
                  // Don't auto-close if field has dropdown options - user needs to select a value
                  if (value && value !== 'Custom field' && !orderItemFieldsWithDropdowns.includes(value)) {
                    // Only auto-close for fields without dropdowns
                    const netsuiteId = value
                    const newMapping: OrderItemFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Fixed',
                      shopifyValue: '',
                      netsuiteId: netsuiteId,
                      applyToAllAccounts: true,
                      isActive: true,
                    }
                    setOrderItemMappings([...orderItemMappings, newMapping])
                    setIsAddOrderItemNetSuiteMappingDialogOpen(false)
                    setSelectedOrderItemNetSuiteField('')
                    setSelectedOrderItemNetSuiteValue('')
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a NetSuite field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Custom field">Custom field</SelectItem>
                  <SelectItem value="class">Class</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="priceLevel">Price Level</SelectItem>
                  <SelectItem value="purchaseOrderVendor">Purchase Order Vendor</SelectItem>
                  <SelectItem value="unitsOfMeasure">Units Of Measure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Show custom field input when "Custom field" is selected */}
            {selectedOrderItemNetSuiteField === 'Custom field' && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Custom Field Name
                </label>
                <Input
                  placeholder="e.g., custcol_custom_field"
                  value={customOrderItemNetSuiteFieldName}
                  onChange={(e) => setCustomOrderItemNetSuiteFieldName(e.target.value)}
                />
              </div>
            )}
            
            {/* Show value dropdown for fields that require lookups */}
            {selectedOrderItemNetSuiteField && selectedOrderItemNetSuiteField !== 'Custom field' && orderItemFieldsWithDropdowns.includes(selectedOrderItemNetSuiteField) && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  {selectedOrderItemNetSuiteField === 'priceLevel' ? 'Price Level' :
                   selectedOrderItemNetSuiteField === 'purchaseOrderVendor' ? 'Purchase Order Vendor' :
                   selectedOrderItemNetSuiteField === 'unitsOfMeasure' ? 'Units Of Measure' :
                   selectedOrderItemNetSuiteField.charAt(0).toUpperCase() + selectedOrderItemNetSuiteField.slice(1)} Value
                </label>
                {isLoadingOrderItemNetSuiteList ? (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    Loading {selectedOrderItemNetSuiteField} options...
                  </div>
                ) : orderItemNetSuiteListItems.length > 0 ? (
                  <Select value={selectedOrderItemNetSuiteValue} onValueChange={setSelectedOrderItemNetSuiteValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select a ${selectedOrderItemNetSuiteField}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {orderItemNetSuiteListItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (IID: {item.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    No {selectedOrderItemNetSuiteField} options available
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddOrderItemNetSuiteMappingDialogOpen(false)
                  setSelectedOrderItemNetSuiteField('')
                  setCustomOrderItemNetSuiteFieldName('')
                  setSelectedOrderItemNetSuiteValue('')
                  setOrderItemNetSuiteListItems([])
                }}
              >
                Cancel
              </Button>
              {selectedOrderItemNetSuiteField === 'Custom field' ? (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (!customOrderItemNetSuiteFieldName.trim()) {
                      alert('Please enter a custom field name')
                      return
                    }
                    
                    const newMapping: OrderItemFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Custom',
                      netsuiteId: customOrderItemNetSuiteFieldName.trim(),
                      applyToAllAccounts: true,
                      isActive: true,
                      customFieldId: customOrderItemNetSuiteFieldName.trim(),
                    }
                    setOrderItemMappings([...orderItemMappings, newMapping])
                    setIsAddOrderItemNetSuiteMappingDialogOpen(false)
                    setSelectedOrderItemNetSuiteField('')
                    setCustomOrderItemNetSuiteFieldName('')
                    setSelectedOrderItemNetSuiteValue('')
                  }}
                  disabled={!customOrderItemNetSuiteFieldName.trim()}
                >
                  Add Mapping
                </Button>
              ) : selectedOrderItemNetSuiteField && orderItemFieldsWithDropdowns.includes(selectedOrderItemNetSuiteField) ? (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (!selectedOrderItemNetSuiteValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }
                    
                    // Find the selected item to get the display name
                    const selectedItem = orderItemNetSuiteListItems.find(item => item.id === selectedOrderItemNetSuiteValue)
                    const displayValue = selectedItem ? `${selectedItem.name} (IID: ${selectedItem.id})` : selectedOrderItemNetSuiteValue
                    
                    const newMapping: OrderItemFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Fixed',
                      shopifyValue: displayValue,
                      netsuiteId: selectedOrderItemNetSuiteField,
                      applyToAllAccounts: true,
                      isActive: true,
                    }
                    setOrderItemMappings([...orderItemMappings, newMapping])
                    setIsAddOrderItemNetSuiteMappingDialogOpen(false)
                    setSelectedOrderItemNetSuiteField('')
                    setSelectedOrderItemNetSuiteValue('')
                    setOrderItemNetSuiteListItems([])
                  }}
                  disabled={!selectedOrderItemNetSuiteValue}
                >
                  Add Mapping
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Customer NetSuite Mapping Dialog */}
      <Dialog open={isAddCustomerNetSuiteMappingDialogOpen} onOpenChange={setIsAddCustomerNetSuiteMappingDialogOpen}>
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
                value={selectedCustomerNetSuiteField} 
                onValueChange={(value) => {
                  setSelectedCustomerNetSuiteField(value)
                  setCustomCustomerNetSuiteFieldName('')
                  setSelectedCustomerNetSuiteValue('')
                  // Don't auto-close if field has dropdown options - user needs to select a value
                  if (value && value !== 'Custom field' && !customerFieldsWithDropdowns.includes(value)) {
                    // Only auto-close for fields without dropdowns
                    const netsuiteId = value
                    const newMapping: CustomerFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Fixed',
                      shopifyValue: '',
                      netsuiteId: netsuiteId,
                      applyToAllAccounts: true,
                      isActive: true,
                    }
                    setCustomerMappings([...customerMappings, newMapping])
                    setIsAddCustomerNetSuiteMappingDialogOpen(false)
                    setSelectedCustomerNetSuiteField('')
                    setSelectedCustomerNetSuiteValue('')
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a NetSuite field..." />
                </SelectTrigger>
                <SelectContent>
                  {standardCustomerFields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Show custom field input when "Custom field" is selected */}
            {selectedCustomerNetSuiteField === 'Custom field' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Custom Field Name
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., custentity_customer_sales_channel"
                      value={customCustomerNetSuiteFieldName}
                      onChange={(e) => {
                        setCustomCustomerNetSuiteFieldName(e.target.value)
                        setCustomerCustomFieldInfo(null)
                        setCustomerCustomFieldValue('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customCustomerNetSuiteFieldName.trim()) {
                          handleFetchCustomerCustomFieldInfo()
                        }
                      }}
                    />
                    <Button
                      onClick={handleFetchCustomerCustomFieldInfo}
                      disabled={!customCustomerNetSuiteFieldName.trim() || isLoadingCustomerCustomFieldInfo}
                    >
                      {isLoadingCustomerCustomFieldInfo ? 'Loading...' : 'Query'}
                    </Button>
                  </div>
                </div>
                
                {/* Show field info and value input based on field type */}
                {isLoadingCustomerCustomFieldInfo ? (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    Loading field information...
                  </div>
                ) : customerCustomFieldInfo ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <div className="text-sm text-slate-600">
                        <span className="font-medium">Field Type:</span> {customerCustomFieldInfo.fieldType}
                        {customerCustomFieldInfo.listItems.length > 0 && (
                          <span className="ml-2">
                            ({customerCustomFieldInfo.listItems.length} options)
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Show dropdown for select fields */}
                    {customerCustomFieldInfo.fieldType === 'select' && customerCustomFieldInfo.listItems.length > 0 ? (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Select Value
                        </label>
                        <Select value={customerCustomFieldValue} onValueChange={setCustomerCustomFieldValue}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a value..." />
                          </SelectTrigger>
                          <SelectContent>
                            {customerCustomFieldInfo.listItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.text} (Value: {item.value})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : customerCustomFieldInfo.fieldType === 'checkbox' ? (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Checkbox Value
                        </label>
                        <Select value={customerCustomFieldValue} onValueChange={setCustomerCustomFieldValue}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="T">True</SelectItem>
                            <SelectItem value="F">False</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : customerCustomFieldInfo.fieldType === 'date' ? (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Date Value
                        </label>
                        <Input
                          type="date"
                          value={customerCustomFieldValue}
                          onChange={(e) => setCustomerCustomFieldValue(e.target.value)}
                        />
                      </div>
                    ) : customerCustomFieldInfo.fieldType === 'text' || customerCustomFieldInfo.fieldType === 'integer' || customerCustomFieldInfo.fieldType === 'currency' || customerCustomFieldInfo.fieldType === 'percent' ? (
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          {customerCustomFieldInfo.fieldType === 'integer' ? 'Integer Value' :
                           customerCustomFieldInfo.fieldType === 'currency' ? 'Currency Value' :
                           customerCustomFieldInfo.fieldType === 'percent' ? 'Percent Value' :
                           'Text Value'}
                        </label>
                        <Input
                          type={customerCustomFieldInfo.fieldType === 'integer' ? 'number' : customerCustomFieldInfo.fieldType === 'currency' || customerCustomFieldInfo.fieldType === 'percent' ? 'number' : 'text'}
                          value={customerCustomFieldValue}
                          onChange={(e) => setCustomerCustomFieldValue(e.target.value)}
                          placeholder={`Enter ${customerCustomFieldInfo.fieldType} value...`}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : customCustomerNetSuiteFieldName.trim() ? (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    Enter a field name and click "Query" to load field information.
                  </div>
                ) : null}
              </div>
            )}
            
            {/* Show value dropdown for fields that require lookups */}
            {selectedCustomerNetSuiteField && selectedCustomerNetSuiteField !== 'Custom field' && customerFieldsWithDropdowns.includes(selectedCustomerNetSuiteField) && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  {selectedCustomerNetSuiteField === 'priceLevel' ? 'Price Level' :
                   selectedCustomerNetSuiteField === 'purchaseOrderVendor' ? 'Purchase Order Vendor' :
                   selectedCustomerNetSuiteField === 'unitsOfMeasure' ? 'Units Of Measure' :
                   selectedCustomerNetSuiteField.charAt(0).toUpperCase() + selectedCustomerNetSuiteField.slice(1)} Value
                </label>
                {isLoadingCustomerNetSuiteList ? (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    Loading {selectedCustomerNetSuiteField} options...
                  </div>
                ) : customerNetSuiteListItems.length > 0 ? (
                  <Select value={selectedCustomerNetSuiteValue} onValueChange={setSelectedCustomerNetSuiteValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select a ${selectedCustomerNetSuiteField}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {customerNetSuiteListItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (IID: {item.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 border rounded-lg text-center text-slate-500">
                    No {selectedCustomerNetSuiteField} options available
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddCustomerNetSuiteMappingDialogOpen(false)
                  setSelectedCustomerNetSuiteField('')
                  setCustomCustomerNetSuiteFieldName('')
                  setSelectedCustomerNetSuiteValue('')
                  setCustomerNetSuiteListItems([])
                  setCustomerCustomFieldInfo(null)
                  setCustomerCustomFieldValue('')
                }}
              >
                Cancel
              </Button>
              {selectedCustomerNetSuiteField === 'Custom field' ? (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (!customCustomerNetSuiteFieldName.trim()) {
                      alert('Please enter a custom field name')
                      return
                    }
                    
                    // For select fields, require a value to be selected
                    if (customerCustomFieldInfo?.fieldType === 'select' && !customerCustomFieldValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }
                    
                    // For checkbox, date, and other fields, require a value
                    if (customerCustomFieldInfo && customerCustomFieldInfo.fieldType !== 'text' && !customerCustomFieldValue) {
                      alert(`Please enter a ${customerCustomFieldInfo.fieldType} value`)
                      return
                    }
                    
                    // Determine the mapping type and shopifyValue
                    let mappingType: 'Fixed' | 'Custom' = 'Custom'
                    let shopifyValue: string | undefined = undefined
                    
                    if (customerCustomFieldInfo?.fieldType === 'select' && customerCustomFieldValue) {
                      // For select fields, store the selected value
                      const selectedItem = customerCustomFieldInfo.listItems.find(item => item.value === customerCustomFieldValue)
                      shopifyValue = selectedItem ? `${selectedItem.text} (Value: ${selectedItem.value})` : customerCustomFieldValue
                      mappingType = 'Fixed'
                    } else if (customerCustomFieldValue) {
                      // For other field types, store the value
                      shopifyValue = customerCustomFieldValue
                      mappingType = 'Fixed'
                    }
                    
                    const newMapping: CustomerFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: mappingType,
                      shopifyValue: shopifyValue,
                      netsuiteId: customCustomerNetSuiteFieldName.trim(),
                      applyToAllAccounts: true,
                      isActive: true,
                      customFieldId: customCustomerNetSuiteFieldName.trim(),
                    }
                    setCustomerMappings([...customerMappings, newMapping])
                    setIsAddCustomerNetSuiteMappingDialogOpen(false)
                    setSelectedCustomerNetSuiteField('')
                    setCustomCustomerNetSuiteFieldName('')
                    setSelectedCustomerNetSuiteValue('')
                    setCustomerCustomFieldInfo(null)
                    setCustomerCustomFieldValue('')
                  }}
                  disabled={!customCustomerNetSuiteFieldName.trim() || (customerCustomFieldInfo && !customerCustomFieldValue)}
                >
                  Add Mapping
                </Button>
              ) : selectedCustomerNetSuiteField && customerFieldsWithDropdowns.includes(selectedCustomerNetSuiteField) ? (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    if (!selectedCustomerNetSuiteValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }
                    
                    // Find the selected item to get the display name
                    const selectedItem = customerNetSuiteListItems.find(item => item.id === selectedCustomerNetSuiteValue)
                    const displayValue = selectedItem ? `${selectedItem.name} (IID: ${selectedItem.id})` : selectedCustomerNetSuiteValue
                    
                    const newMapping: CustomerFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Fixed',
                      shopifyValue: displayValue,
                      netsuiteId: selectedCustomerNetSuiteField,
                      applyToAllAccounts: true,
                      isActive: true,
                    }
                    setCustomerMappings([...customerMappings, newMapping])
                    setIsAddCustomerNetSuiteMappingDialogOpen(false)
                    setSelectedCustomerNetSuiteField('')
                    setSelectedCustomerNetSuiteValue('')
                    setCustomerNetSuiteListItems([])
                  }}
                  disabled={!selectedCustomerNetSuiteValue}
                >
                  Add Mapping
                </Button>
              ) : null}
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
                          
                          // Check if we came from the translation dialog
                          const cameFromTranslationDialog = translationMappingIndex !== null && translationMappingIndex === editingMappingIndex
                          
                          setIsCustomShopifyFieldDialogOpen(false)
                          setCustomShopifyOrderId('')
                          setCustomShopifyOrderData(null)
                          setEditingMappingIndex(null)
                          
                          // If we came from translation dialog, reopen it and load available values
                          if (cameFromTranslationDialog) {
                            setIsTranslationDialogOpen(true)
                            loadAvailableShopifyValues(field)
                          }
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

      {/* Custom Line Item Field Selector Dialog */}
      <Dialog open={isCustomLineItemFieldDialogOpen} onOpenChange={setIsCustomLineItemFieldDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map Custom Line Item Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Order Id</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="#42395"
                    value={customLineItemOrderId}
                    onChange={(e) => setCustomLineItemOrderId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customLineItemOrderId.trim()) {
                        handleFetchCustomLineItemOrder()
                      }
                    }}
                  />
                  <Button
                    onClick={handleFetchCustomLineItemOrder}
                    disabled={!customLineItemOrderId.trim() || isLoadingCustomLineItemOrder}
                  >
                    {isLoadingCustomLineItemOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
                  </Button>
    </div>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Below are the fields from the first line item of this order. Select a field to map it to your NetSuite field.
            </p>

            {customLineItemOrderData && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 p-2 border-b flex justify-between items-center">
                  <span className="text-sm font-medium">Field</span>
                  <span className="text-sm font-medium">Value</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {Object.entries(flattenLineItems(customLineItemOrderData)).map(([field, value]) => (
                    <div
                      key={field}
                      className="grid grid-cols-2 gap-4 p-2 border-b hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        if (editingOrderItemMappingIndex !== null && editingOrderItemMappingIndex >= 0 && editingOrderItemMappingIndex < orderItemMappings.length) {
                          const updated = [...orderItemMappings]
                          updated[editingOrderItemMappingIndex] = {
                            ...updated[editingOrderItemMappingIndex],
                            shopifyCode: `Custom: ${field}`,
                            shopifyValue: undefined,
                          }
                          setOrderItemMappings(updated)
                          setIsCustomLineItemFieldDialogOpen(false)
                          setCustomLineItemOrderId('')
                          setCustomLineItemOrderData(null)
                          setEditingOrderItemMappingIndex(null)
                        }
                      }}
                    >
                      <div className="font-mono text-sm">Custom: {field}</div>
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
                  setIsCustomLineItemFieldDialogOpen(false)
                  setCustomLineItemOrderId('')
                  setCustomLineItemOrderData(null)
                  setEditingOrderItemMappingIndex(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Header Configuration Dialog */}
      <Dialog open={isOrderHeaderConfigDialogOpen} onOpenChange={(open) => {
        setIsOrderHeaderConfigDialogOpen(open)
        if (!open) {
          setEditingOrderHeaderIndex(null)
          setOrderHeaderOrderId('')
          setOrderHeaderOrderData(null)
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Order Header Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingOrderHeaderIndex !== null && orderMappings[editingOrderHeaderIndex] && (
              <>
                {/* Optional: Load Order to View JSON */}
                <div className="border rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700">
                      Optional: Load Order to View JSON Structure
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#42395 or 42395 (optional)"
                      value={orderHeaderOrderId}
                      onChange={(e) => setOrderHeaderOrderId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && orderHeaderOrderId.trim()) {
                          handleFetchOrderHeaderOrder()
                        }
                      }}
                    />
                    <Button
                      onClick={handleFetchOrderHeaderOrder}
                      disabled={!orderHeaderOrderId.trim() || isLoadingOrderHeaderOrder}
                      variant="outline"
                    >
                      {isLoadingOrderHeaderOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load Order'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter an order ID or order number to view its JSON structure and explore available fields
                  </p>
                </div>

                {/* JSON Viewer Section */}
                {orderHeaderOrderData && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-50 p-3 border-b flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Order JSON</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(orderHeaderOrderData, null, 2))
                          alert('JSON copied to clipboard!')
                        }}
                      >
                        Copy JSON
                      </Button>
                    </div>
                    <div className="bg-white p-4 overflow-x-auto max-h-96 overflow-y-auto">
                      <JsonView
                        value={orderHeaderOrderData}
                        style={{
                          backgroundColor: 'transparent',
                          fontSize: '12px',
                        }}
                        theme="light"
                        collapsed={2}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        enableClipboard={true}
                      />
                    </div>
                  </div>
                )}

                {/* Flattened Fields Table */}
                {orderHeaderOrderData && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      Available Fields from Loaded Order (click to select)
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-slate-50 p-2 border-b flex justify-between items-center">
                        <span className="text-sm font-medium">Field Code</span>
                        <span className="text-sm font-medium">Value</span>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {Object.entries(flattenObject(orderHeaderOrderData)).map(([field, value]) => (
                          <div
                            key={field}
                            className="grid grid-cols-2 gap-4 p-2 border-b hover:bg-slate-50 cursor-pointer"
                            onClick={() => {
                              const updated = [...orderMappings]
                              updated[editingOrderHeaderIndex] = {
                                ...updated[editingOrderHeaderIndex],
                                shopifyCode: field,
                                shopifyValue: undefined,
                              }
                              setOrderMappings(updated)
                              setIsOrderHeaderConfigDialogOpen(false)
                              setOrderHeaderOrderId('')
                              setOrderHeaderOrderData(null)
                              setEditingOrderHeaderIndex(null)
                            }}
                          >
                            <div className="font-mono text-sm text-blue-600">{field}</div>
                            <div className="text-sm text-slate-600 truncate">{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Field Selector */}
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Select Shopify Field
                  </label>
                  <Select
                    value={orderMappings[editingOrderHeaderIndex].shopifyCode || ''}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        // Open custom Shopify field selector
                        setEditingMappingIndex(editingOrderHeaderIndex)
                        setIsCustomShopifyFieldDialogOpen(true)
                        setIsOrderHeaderConfigDialogOpen(false)
                      } else {
                        const updated = [...orderMappings]
                        updated[editingOrderHeaderIndex] = {
                          ...updated[editingOrderHeaderIndex],
                          shopifyCode: value,
                          shopifyValue: undefined,
                        }
                        setOrderMappings(updated)
                        setIsOrderHeaderConfigDialogOpen(false)
                        setEditingOrderHeaderIndex(null)
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
                </div>

                {/* Current Selection Display */}
                {orderMappings[editingOrderHeaderIndex].shopifyCode && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Selected Field:</strong> <span className="font-mono">{orderMappings[editingOrderHeaderIndex].shopifyCode}</span>
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsOrderHeaderConfigDialogOpen(false)
                  setEditingOrderHeaderIndex(null)
                  setOrderHeaderOrderId('')
                  setOrderHeaderOrderData(null)
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Translation Mapping Dialog */}
      <Dialog open={isTranslationDialogOpen} onOpenChange={(open) => {
        setIsTranslationDialogOpen(open)
        if (!open) {
          setTranslationMappingIndex(null)
          setTranslationMappings([])
          setTranslationDefaultValue('')
          setTranslationOrderId('')
          setTranslationOrderData(null)
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Translation Mappings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {translationMappingIndex !== null && orderMappings[translationMappingIndex] && (
              <>
                {/* Shopify Field Selector - First Thing */}
                <div className="border rounded-lg p-4 bg-slate-50">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Select Shopify Field Code
                  </label>
                  <Select
                    value={orderMappings[translationMappingIndex].shopifyCode || ''}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        // Open custom Shopify field selector
                        setEditingMappingIndex(translationMappingIndex)
                        setIsCustomShopifyFieldDialogOpen(true)
                        setIsTranslationDialogOpen(false)
                      } else {
                        const updated = [...orderMappings]
                        updated[translationMappingIndex] = {
                          ...updated[translationMappingIndex],
                          shopifyCode: value,
                          shopifyValue: undefined,
                        }
                        setOrderMappings(updated)
                        // Load available Shopify values for the selected field
                        loadAvailableShopifyValues(value)
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
                      <SelectItem value="referring_site">Referring Site</SelectItem>
                      <SelectItem value="custom">Custom Field...</SelectItem>
                    </SelectContent>
                  </Select>
                  {orderMappings[translationMappingIndex].shopifyCode && (
                    <div className="mt-2 text-sm text-slate-600">
                      <strong>Selected:</strong> <span className="font-mono">{orderMappings[translationMappingIndex].shopifyCode}</span>
                    </div>
                  )}
                </div>

                {/* Optional: Load Order to View JSON */}
                <div className="border rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700">
                      Optional: Load Order to View JSON Structure
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#42395 or 42395 (optional)"
                      value={translationOrderId}
                      onChange={(e) => setTranslationOrderId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && translationOrderId.trim()) {
                          handleFetchTranslationOrder()
                        }
                      }}
                    />
                    <Button
                      onClick={handleFetchTranslationOrder}
                      disabled={!translationOrderId.trim() || isLoadingTranslationOrder}
                      variant="outline"
                    >
                      {isLoadingTranslationOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load Order'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter an order ID or order number to view its JSON structure and explore available fields
                  </p>
                </div>

                {/* JSON Viewer Section */}
                {translationOrderData && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-50 p-3 border-b flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Order JSON</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(translationOrderData, null, 2))
                          alert('JSON copied to clipboard!')
                        }}
                      >
                        Copy JSON
                      </Button>
                    </div>
                    <div className="bg-white p-4 overflow-x-auto max-h-96 overflow-y-auto">
                      <JsonView
                        value={translationOrderData}
                        style={{
                          backgroundColor: 'transparent',
                          fontSize: '12px',
                        }}
                        theme="light"
                        collapsed={2}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        enableClipboard={true}
                      />
                    </div>
                  </div>
                )}

                {/* Flattened Fields Table */}
                {translationOrderData && (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      Available Fields from Loaded Order (click to select)
                    </h3>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-slate-50 p-2 border-b flex justify-between items-center">
                        <span className="text-sm font-medium">Field Code</span>
                        <span className="text-sm font-medium">Value</span>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {Object.entries(flattenObject(translationOrderData)).map(([field, value]) => (
                          <div
                            key={field}
                            className="grid grid-cols-2 gap-4 p-2 border-b hover:bg-slate-50 cursor-pointer"
                            onClick={() => {
                              if (translationMappingIndex !== null) {
                                const updated = [...orderMappings]
                                updated[translationMappingIndex] = {
                                  ...updated[translationMappingIndex],
                                  shopifyCode: field,
                                  shopifyValue: undefined,
                                }
                                setOrderMappings(updated)
                                // Reload available Shopify values for the new field
                                loadAvailableShopifyValues(field)
                              }
                            }}
                          >
                            <div className="font-mono text-sm text-blue-600">{field}</div>
                            <div className="text-sm text-slate-600 truncate">{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* NetSuite Field Display */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>NetSuite Field:</strong> <span className="font-mono">{orderMappings[translationMappingIndex].netsuiteId}</span>
                  </p>
                </div>

                {orderMappings[translationMappingIndex].shopifyCode && (
                  <div className="text-sm text-slate-600 italic border-t pt-4">
                    Map Shopify values from <span className="font-mono font-semibold">{orderMappings[translationMappingIndex].shopifyCode}</span> to NetSuite values. Add rows below to create your translation mappings.
                  </div>
                )}

                {/* Translation Mappings Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-50 p-2 border-b grid grid-cols-12 gap-2 text-sm font-medium">
                    <div className="col-span-1"></div>
                    <div className="col-span-5">Shopify value</div>
                    <div className="col-span-1 text-center">→</div>
                    <div className="col-span-5">NetSuite value</div>
                    <div className="col-span-1"></div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {translationMappings.map((tm, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 p-2 border-b items-center">
                        <div className="col-span-1 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={tm.isActive}
                            onChange={(e) => {
                              const updated = [...translationMappings]
                              updated[idx] = { ...updated[idx], isActive: e.target.checked }
                              setTranslationMappings(updated)
                            }}
                            className="w-4 h-4"
                          />
                        </div>
                        <div className="col-span-5">
                          <Input
                            value={tm.shopifyValue}
                            onChange={(e) => {
                              const updated = [...translationMappings]
                              updated[idx] = { ...updated[idx], shopifyValue: e.target.value }
                              setTranslationMappings(updated)
                            }}
                            placeholder="Shopify value"
                            className="w-full"
                          />
                        </div>
                        <div className="col-span-1 text-center text-slate-400">→</div>
                        <div className="col-span-5">
                          {isLoadingTranslationNetSuiteFieldInfo ? (
                            <div className="p-2 border rounded text-sm text-slate-500 text-center">
                              Loading options...
                            </div>
                          ) : translationNetSuiteFieldInfo && 
                           translationNetSuiteFieldInfo.listItems && 
                           translationNetSuiteFieldInfo.listItems.length > 0 ? (
                            <Select
                              value={tm.netsuiteValue}
                              onValueChange={(value) => {
                                const updated = [...translationMappings]
                                updated[idx] = { ...updated[idx], netsuiteValue: value }
                                setTranslationMappings(updated)
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select NetSuite value..." />
                              </SelectTrigger>
                              <SelectContent>
                                {translationNetSuiteFieldInfo.listItems.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name} (IID: {item.id})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={tm.netsuiteValue}
                              onChange={(e) => {
                                const updated = [...translationMappings]
                                updated[idx] = { ...updated[idx], netsuiteValue: e.target.value }
                                setTranslationMappings(updated)
                              }}
                              placeholder="NetSuite value"
                              className="w-full"
                            />
                          )}
                        </div>
                        <div className="col-span-1 flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = translationMappings.filter((_, i) => i !== idx)
                              setTranslationMappings(updated)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Row Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setTranslationMappings([
                      ...translationMappings,
                      { shopifyValue: '', netsuiteValue: '', isActive: true },
                    ])
                  }}
                  className="w-full"
                >
                  Add row
                </Button>

                {/* Default Value */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Default value
                  </label>
                  {isLoadingTranslationNetSuiteFieldInfo ? (
                    <div className="p-2 border rounded text-sm text-slate-500 text-center">
                      Loading options...
                    </div>
                  ) : translationNetSuiteFieldInfo && 
                   translationNetSuiteFieldInfo.listItems && 
                   translationNetSuiteFieldInfo.listItems.length > 0 ? (
                    <Select
                      value={translationDefaultValue}
                      onValueChange={(value) => setTranslationDefaultValue(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select default NetSuite value..." />
                      </SelectTrigger>
                      <SelectContent>
                        {translationNetSuiteFieldInfo.listItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} (IID: {item.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={translationDefaultValue}
                      onChange={(e) => setTranslationDefaultValue(e.target.value)}
                      placeholder="Default NetSuite value when no match found"
                      className="w-full"
                    />
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  // Save translation mappings to the mapping object in state before closing
                  if (translationMappingIndex !== null) {
                    const updated = [...orderMappings]
                    const filteredTranslations = translationMappings.filter(
                      (tm) => tm.shopifyValue && tm.netsuiteValue
                    )
                    updated[translationMappingIndex] = {
                      ...updated[translationMappingIndex],
                      translationMappings: filteredTranslations,
                      translationDefaultValue: translationDefaultValue || undefined,
                    }
                    setOrderMappings(updated)
                  }
                  
                  setIsTranslationDialogOpen(false)
                  setTranslationMappingIndex(null)
                  setTranslationMappings([])
                  setTranslationDefaultValue('')
                  setTranslationOrderId('')
                  setTranslationOrderData(null)
                  setTranslationNetSuiteFieldInfo(null)
                }}
              >
                Close
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  if (translationMappingIndex === null) return

                  const mapping = orderMappings[translationMappingIndex]
                  // Check if mapping has a valid database ID (not a temporary ID)
                  if (!mapping.id || mapping.id.toString().startsWith('temp-')) {
                    alert('Please save the mapping first before configuring translations. Click "Save" on the main page to save the mapping, then configure translations.')
                    setIsTranslationDialogOpen(false)
                    return
                  }

                  try {
                    // Save translation mappings
                    const response = await fetch('/api/mappings/order-fields/translation', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        orderFieldMappingId: mapping.id,
                        translationMappings: translationMappings.filter(
                          (tm) => tm.shopifyValue && tm.netsuiteValue
                        ),
                        defaultValue: translationDefaultValue || null,
                      }),
                    })

                  const result = await response.json()
                  if (result.success) {
                    // Update local state - store translations in the mapping object itself
                    const updated = [...orderMappings]
                    const filteredTranslations = translationMappings.filter(
                      (tm) => tm.shopifyValue && tm.netsuiteValue
                    )
                    updated[translationMappingIndex] = {
                      ...updated[translationMappingIndex],
                      translationMappings: filteredTranslations,
                      translationDefaultValue: translationDefaultValue || undefined,
                    }
                    setOrderMappings(updated)

                    alert('✅ Translation mappings saved successfully!')
                    setIsTranslationDialogOpen(false)
                    // Keep the translation data in the mapping, but clear dialog state
                    setTranslationMappingIndex(null)
                    setTranslationMappings([])
                    setTranslationDefaultValue('')
                    setTranslationOrderId('')
                    setTranslationOrderData(null)
                  } else {
                    console.error('Translation save error:', result)
                    alert(`❌ Failed to save translations: ${result.error || 'Unknown error'}. Please check the console for details.`)
                  }
                } catch (error) {
                  console.error('Error saving translation mappings:', error)
                  alert(`❌ Error saving translations: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    alert(`❌ Error saving translations: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}







