'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Database, Trash2, Loader2, HelpCircle, MapPin } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import {
  type PaymentMethodMapping,
  type ShipmentMethodMapping,
  type OrderFieldMapping,
  type OrderItemFieldMapping,
  type CustomerFieldMapping,
  type OrderFieldTranslationMapping
} from '@/lib/mappingUtils'
import ProductFieldMappings from '@/components/product-sync'

interface MappingsSectionProps {
  activeSubSection: string
}

export function MappingsSection({ activeSubSection }: MappingsSectionProps) {
  // ============================================================
  // STATE
  // ============================================================

  // Mapping tab state (within Orders sub-section)
  const [activeMappingTab, setActiveMappingTab] = useState('Payment')

  // Custom fields state
  const [customFields, setCustomFields] = useState<{[key: string]: string}>({})

  // Mapping data state
  const [paymentMappings, setPaymentMappings] = useState<PaymentMethodMapping[]>([])
  const [paymentMethodNetSuiteList, setPaymentMethodNetSuiteList] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false)
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<string>('')
  const [isLoadingDefaultPaymentMethod, setIsLoadingDefaultPaymentMethod] = useState(false)

  const [defaultDiscountItem, setDefaultDiscountItem] = useState<string>('')
  const [isLoadingDefaultDiscountItem, setIsLoadingDefaultDiscountItem] = useState(false)
  const [discountItemNetSuiteList, setDiscountItemNetSuiteList] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingDiscountItems, setIsLoadingDiscountItems] = useState(false)

  const [shipmentMappings, setShipmentMappings] = useState<ShipmentMethodMapping[]>([])
  const [unmappedShippingMethods, setUnmappedShippingMethods] = useState<{ code: string; title: string | null; exampleOrder: string | null }[]>([])
  const [newShipmentShopifyCode, setNewShipmentShopifyCode] = useState('')
  const [newShipmentNetsuiteId, setNewShipmentNetsuiteId] = useState('')

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

  // Unmapped methods
  const [unmappedPaymentMethods, setUnmappedPaymentMethods] = useState<string[]>([])

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
  const customerFieldsWithDropdowns = ['account', 'currency', 'partner', 'priceLevel', 'subsidiary', 'taxCode', 'terms']

  // Standard NetSuite Customer fields
  const standardCustomerFields = [
    { value: 'Custom field', label: 'Custom field' },
    { value: 'account', label: 'Account' },
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
    { value: 'partner', label: 'Partner (Rep Group)' },
    { value: 'priceLevel', label: 'Price Level' },
    { value: 'resaleNumber', label: 'Resale Number' },
    { value: 'salesRep', label: 'Sales Rep' },
    { value: 'shipComplete', label: 'Ship Complete' },
    { value: 'subsidiary', label: 'Subsidiary' },
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

  // Common Order Line fields
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

  // Cache for custom field info by field ID
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

  // NetSuite field info for translation dialog
  const [translationNetSuiteFieldInfo, setTranslationNetSuiteFieldInfo] = useState<{
    listItems: Array<{ id: string; name: string }>
  } | null>(null)
  const [isLoadingTranslationNetSuiteFieldInfo, setIsLoadingTranslationNetSuiteFieldInfo] = useState(false)

  // Store NetSuite list items per field for dropdowns in table rows
  const [netsuiteListCache, setNetsuiteListCache] = useState<Record<string, Array<{ id: string; name: string; [key: string]: any }>>>({})
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())

  // Fields that require dropdown lookups
  const fieldsWithDropdowns = ['class', 'location', 'partner', 'subsidiary', 'currency', 'terms', 'department', 'account', 'shipMethod', 'taxCode', 'priceLevel', 'units', 'discountItem']

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

  // Auto-assign rules state
  const [autoAssignRules, setAutoAssignRules] = useState<Array<{
    id: number
    name: string
    conditionType: string | null
    conditionAdjustmentReason: string | null
    conditionSourceName: string | null
    targetField: string
    targetMappingId: number
    targetMappingDescription: string
    priority: number
    isActive: boolean
  }>>([])
  const [autoAssignEditDialog, setAutoAssignEditDialog] = useState<{
    isOpen: boolean
    rule: {
      id?: number
      name: string
      conditionType: string
      conditionAdjustmentReason: string
      conditionSourceName: string
      targetField: string
      targetMappingId: string
      priority: number
      isActive: boolean
    } | null
  }>({ isOpen: false, rule: null })
  const [conditionOptions, setConditionOptions] = useState<{
    types: string[]
    adjustmentReasons: string[]
    sourceNames: string[]
  }>({ types: [], adjustmentReasons: [], sourceNames: [] })

  // Local delete confirm dialog
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{isOpen: boolean, itemType: string, itemName: string, itemId: string}>({
    isOpen: false,
    itemType: '',
    itemName: '',
    itemId: ''
  })

  // Order source mappings state
  const [orderSourceMappings, setOrderSourceMappings] = useState<Array<{
    id: number
    appId: number | null
    sourceName: string | null
    isTaxable: boolean
    friendlyName: string
    isActive: boolean
  }>>([])

  const [orderSourceMappingEditDialog, setOrderSourceMappingEditDialog] = useState<{
    isOpen: boolean
    mapping: {
      id: number
      appId: number | null
      sourceName: string | null
      friendlyName: string
      isTaxable: boolean
      isActive: boolean
    } | null
  }>({
    isOpen: false,
    mapping: null
  })

  // Tax helper dialog state
  const [taxHelperDialogOpen, setTaxHelperDialogOpen] = useState(false)

  // Marketplace tax config state
  const [marketplaceNonTaxableTaxCode, setMarketplaceNonTaxableTaxCode] = useState<string>('')
  const [marketplaceTaxItem, setMarketplaceTaxItem] = useState<string>('')
  const [salestaxitemList, setSalestaxitemList] = useState<Array<{ id: string; name: string }>>([])
  const [nonInventoryItemList, setNonInventoryItemList] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingSalestaxitems, setIsLoadingSalestaxitems] = useState(false)
  const [isLoadingNonInventoryItems, setIsLoadingNonInventoryItems] = useState(false)

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

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

    const lineItems = orderData?.line_items || orderData?.order?.line_items || []

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      const firstLineItem = lineItems[0]

      // Collect properties from ALL line items
      lineItems.forEach((item: any) => {
        if (item.properties && Array.isArray(item.properties) && item.properties.length > 0) {
          item.properties.forEach((prop: any) => {
            if (prop.name) {
              const key = `properties.${prop.name}`
              flattened[key] = prop.value || ''
            }
          })
        }
      })

      const lineItemWithoutProperties = { ...firstLineItem }
      delete lineItemWithoutProperties.properties
      Object.assign(flattened, flattenObject(lineItemWithoutProperties, ''))
    }
    return flattened
  }

  // Extract ID from shopifyValue format "Name (IID: id)"
  const extractIdFromShopifyValue = (shopifyValue?: string): string => {
    if (!shopifyValue) return ''
    const match = shopifyValue.match(/\(IID:\s*(\d+)\)/)
    return match ? match[1] : ''
  }

  // Get display text for a custom field value
  const getCustomFieldDisplayText = (mapping: OrderFieldMapping): string => {
    if (mapping.mappingType !== 'Custom' || !mapping.shopifyValue) {
      return mapping.shopifyValue || mapping.shopifyCode || ''
    }

    const fieldId = mapping.customFieldId || mapping.netsuiteId
    const fieldInfo = customFieldInfoCache[fieldId]

    if (fieldInfo && fieldInfo.listItems && fieldInfo.listItems.length > 0) {
      const item = fieldInfo.listItems.find(item => item.value === mapping.shopifyValue)
      if (item) {
        return `${item.text} (${mapping.shopifyValue})`
      }
    }

    return mapping.shopifyValue
  }

  // Handle custom field input changes
  const handleCustomFieldChange = (rowId: string, value: string) => {
    setCustomFields(prev => ({
      ...prev,
      [rowId]: value
    }))
  }

  // ============================================================
  // DELETE CONFIRM DIALOG
  // ============================================================

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

  const confirmDelete = async () => {
    const { itemType, itemName, itemId } = deleteConfirmDialog
    console.log(`Deleting ${itemType}: ${itemName}`)

    try {
      let apiEndpoint = ''

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
          return
        case 'Order Source Mapping':
          await handleDeleteOrderSourceMapping(parseInt(itemId))
          return
        default:
          console.log(`Unknown item type: ${itemType}`)
          return
      }

      const response = await fetch(apiEndpoint, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
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
        console.log(`Successfully deleted ${itemType}: ${itemName}`)
      } else {
        console.error(`Failed to delete ${itemType}: ${itemName}`, result.error)
      }
    } catch (error) {
      console.error(`Error deleting ${itemType}: ${itemName}`, error)
    }

    closeDeleteConfirmDialog()
  }

  // ============================================================
  // FETCH FUNCTIONS
  // ============================================================

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

  const fetchPaymentMethodNetSuiteList = async () => {
    if (paymentMethodNetSuiteList.length > 0) return

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

  const fetchDiscountItemNetSuiteList = async () => {
    if (discountItemNetSuiteList.length > 0) return

    setIsLoadingDiscountItems(true)
    try {
      const response = await fetch('/api/netsuite/lists?field=discountItem')
      const result = await response.json()
      if (result.success && result.items) {
        setDiscountItemNetSuiteList(result.items)
      }
    } catch (error) {
      console.error('Error fetching NetSuite discount items:', error)
    } finally {
      setIsLoadingDiscountItems(false)
    }
  }

  const fetchDefaultDiscountItem = async () => {
    setIsLoadingDefaultDiscountItem(true)
    try {
      const response = await fetch('/api/mappings/defaults?key=default_discount_item')
      const result = await response.json()
      if (result.success && result.value) {
        setDefaultDiscountItem(result.value)
      }
    } catch (error) {
      console.error('Error fetching default discount item:', error)
    } finally {
      setIsLoadingDefaultDiscountItem(false)
    }
  }

  const saveDefaultDiscountItem = async (value: string) => {
    try {
      const response = await fetch('/api/mappings/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'default_discount_item',
          value,
          description: 'NetSuite Discount Item to post per-line discounts',
        }),
      })
      const result = await response.json()
      if (result.success) {
        setDefaultDiscountItem(value)
        return true
      }
      return false
    } catch (error) {
      console.error('Error saving default discount item:', error)
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

  const fetchUnmappedShippingMethods = async () => {
    try {
      const response = await fetch('/api/mappings/shipment-methods/unmapped')
      const result = await response.json()
      if (result.success) {
        setUnmappedShippingMethods(result.unmapped || [])
      }
    } catch (error) {
      console.error('Error fetching unmapped shipping methods:', error)
    }
  }

  const fetchOrderMappings = async () => {
    try {
      const response = await fetch('/api/mappings/order-fields')
      const result = await response.json()
      if (result.success) {
        setOrderMappings(result.data)
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

  const fetchPayoutMappings = async () => {
    try {
      const response = await fetch('/api/mappings/payout-mappings')
      const result = await response.json()
      if (result.success && result.data) {
        setPayoutMappings(result.data)
      }
    } catch (error) {
      console.error('Error fetching payout mappings:', error)
    }
  }

  const fetchAutoAssignRules = async () => {
    try {
      const response = await fetch('/api/mappings/auto-assign-rules')
      const result = await response.json()
      if (result.success && result.data) {
        setAutoAssignRules(result.data)
        if (result.conditionOptions) {
          setConditionOptions(result.conditionOptions)
        }
      }
    } catch (error) {
      console.error('Error fetching auto-assign rules:', error)
    }
  }

  // Fetch field info for a custom field if not cached
  const ensureCustomFieldInfoLoaded = async (fieldId: string) => {
    if (customFieldInfoCache[fieldId]) {
      return
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
    }
  }

  // Fetch NetSuite list for a field and cache it
  const fetchNetSuiteListForField = async (field: string) => {
    if (!fieldsWithDropdowns.includes(field) || netsuiteListCache[field]) {
      return
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

  // ============================================================
  // HANDLER FUNCTIONS
  // ============================================================

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
        console.log(`Added payment method mapping: ${shopifyCode} -> ${netsuiteId}`)
        await fetchPaymentMappings()
        await fetchUnmappedPaymentMethods()
        return true
      } else {
        console.error(`Failed to add payment method mapping:`, result.error)
        return false
      }
    } catch (error) {
      console.error(`Error adding payment method mapping:`, error)
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
        console.log(`Added shipment method mapping: ${shopifyCode} -> ${netsuiteId}`)
        setShipmentMappings(prev => [...prev, result.data])
        setUnmappedShippingMethods(prev => prev.filter(m => m.code !== shopifyCode))
        return true
      } else {
        console.error(`Failed to add shipment method mapping:`, result.error)
        return false
      }
    } catch (error) {
      console.error(`Error adding shipment method mapping:`, error)
      return false
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
        alert(`Successfully saved ${result.results?.length || customerMappings.length} customer mapping(s) to database!`)
        await fetchCustomerMappings()
      } else {
        alert(`Failed to save customer mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
        console.error('Save customer mappings error:', result)
      }
    } catch (error) {
      console.error('Error saving customer mappings:', error)
      alert(`Error saving customer mappings: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
        console.log(`Customer custom field info loaded:`, fieldInfo)
      } else {
        console.error('Failed to fetch customer custom field info:', result.error)
        setCustomerCustomFieldInfo(null)
      }
    } catch (error) {
      console.error('Error fetching customer custom field info:', error)
      setCustomerCustomFieldInfo(null)
    } finally {
      setIsLoadingCustomerCustomFieldInfo(false)
    }
  }

  // Payout mapping handlers
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

  // Fetch Shopify order for custom line item field selector
  const handleFetchCustomLineItemOrder = async () => {
    if (!customLineItemOrderId.trim()) return

    setIsLoadingCustomLineItemOrder(true)
    try {
      const orderId = customLineItemOrderId.replace(/^#/, '')
      const response = await fetch(`/api/shopify/orders/by-name/${encodeURIComponent(orderId)}`)
      const data = await response.json()

      if (data.order) {
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

  // Load NetSuite field info for translation dialog
  const loadTranslationNetSuiteFieldInfo = async (netsuiteFieldId: string) => {
    if (!netsuiteFieldId) {
      setTranslationNetSuiteFieldInfo(null)
      return
    }

    if (!fieldsWithDropdowns.includes(netsuiteFieldId)) {
      setTranslationNetSuiteFieldInfo(null)
      return
    }

    setIsLoadingTranslationNetSuiteFieldInfo(true)
    try {
      const response = await fetch(`/api/netsuite/lists?field=${netsuiteFieldId}`)
      const result = await response.json()

      if (result.success && result.items) {
        setTranslationNetSuiteFieldInfo({
          listItems: result.items || [],
        })
      } else {
        console.error('Error loading NetSuite list:', result.error)
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

  // ============================================================
  // EFFECTS
  // ============================================================

  // ============================================================
  // MARKETPLACE TAX CONFIG FUNCTIONS
  // ============================================================

  const fetchSalestaxitemList = async () => {
    if (salestaxitemList.length > 0) return
    setIsLoadingSalestaxitems(true)
    try {
      const response = await fetch('/api/netsuite/lists?field=salestaxitem')
      const result = await response.json()
      if (result.success && result.items) {
        setSalestaxitemList(result.items)
      }
    } catch (error) {
      console.error('Error fetching sales tax items:', error)
    } finally {
      setIsLoadingSalestaxitems(false)
    }
  }

  const fetchNonInventoryItemList = async () => {
    if (nonInventoryItemList.length > 0) return
    setIsLoadingNonInventoryItems(true)
    try {
      const response = await fetch('/api/netsuite/lists?field=nonInventoryItem')
      const result = await response.json()
      if (result.success && result.items) {
        setNonInventoryItemList(result.items)
      }
    } catch (error) {
      console.error('Error fetching non-inventory items:', error)
    } finally {
      setIsLoadingNonInventoryItems(false)
    }
  }

  const fetchMarketplaceNonTaxableTaxCode = async () => {
    try {
      const response = await fetch('/api/mappings/defaults?key=marketplace_nontaxable_taxcode')
      const result = await response.json()
      if (result.success && result.value) {
        setMarketplaceNonTaxableTaxCode(result.value)
      }
    } catch (error) {
      console.error('Error fetching marketplace non-taxable tax code:', error)
    }
  }

  const fetchMarketplaceTaxItem = async () => {
    try {
      const response = await fetch('/api/mappings/defaults?key=marketplace_tax_item')
      const result = await response.json()
      if (result.success && result.value) {
        setMarketplaceTaxItem(result.value)
      }
    } catch (error) {
      console.error('Error fetching marketplace tax item:', error)
    }
  }

  const saveMarketplaceNonTaxableTaxCode = async (value: string) => {
    try {
      const response = await fetch('/api/mappings/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'marketplace_nontaxable_taxcode',
          value,
          description: 'Tax code applied to Sales Orders for marketplace sources (typically "None")',
        }),
      })
      const result = await response.json()
      if (result.success) {
        setMarketplaceNonTaxableTaxCode(value)
      }
    } catch (error) {
      console.error('Error saving marketplace non-taxable tax code:', error)
    }
  }

  const saveMarketplaceTaxItem = async (value: string) => {
    try {
      const response = await fetch('/api/mappings/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'marketplace_tax_item',
          value,
          description: 'Non-inventory item that posts marketplace-collected tax to a pass-through GL account',
        }),
      })
      const result = await response.json()
      if (result.success) {
        setMarketplaceTaxItem(value)
      }
    } catch (error) {
      console.error('Error saving marketplace tax item:', error)
    }
  }

  // ============================================================
  // ORDER SOURCE MAPPING FUNCTIONS
  // ============================================================

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
        isTaxable: true,
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
    isTaxable: boolean
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
    isTaxable: boolean
    isActive: boolean
  }) => {
    try {
      if (mapping.id === 0) {
        const response = await fetch('/api/mappings/order-source-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isTaxable: mapping.isTaxable,
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
        const response = await fetch(`/api/mappings/order-source-mappings/${mapping.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appId: mapping.appId,
            sourceName: mapping.sourceName,
            friendlyName: mapping.friendlyName,
            isTaxable: mapping.isTaxable,
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

  // Load all mappings on mount
  useEffect(() => {
    fetchPaymentMappings()
    fetchShipmentMappings()
    fetchOrderMappings()
    fetchOrderItemMappings()
    fetchCustomerMappings()
    fetchPayoutMappings()
    fetchAutoAssignRules()
    fetchOrderSourceMappings()
  }, [])

  // Load payment method data when Payment tab is active
  useEffect(() => {
    if (activeMappingTab === 'Payment') {
      fetchPaymentMappings()
      fetchUnmappedPaymentMethods()
      fetchPaymentMethodNetSuiteList()
      fetchDefaultPaymentMethod()
    }
    if (activeMappingTab === 'Shipment') {
      fetchShipmentMappings()
      fetchUnmappedShippingMethods()
      fetchNetSuiteListForField('shipMethod')
    }
    if (activeMappingTab === 'Order') {
      fetchDefaultDiscountItem()
      fetchDiscountItemNetSuiteList()
    }
    if (activeMappingTab === 'Source') {
      fetchSalestaxitemList()
      fetchNonInventoryItemList()
      fetchMarketplaceNonTaxableTaxCode()
      fetchMarketplaceTaxItem()
    }
  }, [activeMappingTab])

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
      setSelectedOrderItemNetSuiteValue('')
      setOrderItemNetSuiteListItems([])
    }
  }, [selectedOrderItemNetSuiteField, isAddOrderItemNetSuiteMappingDialogOpen])

  // ============================================================
  // RENDER
  // ============================================================

  // Helper function to format mapping type for display
  const formatMappingType = (mappingType: string): string => {
    return mappingType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const renderOrdersContent = () => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Order Mappings</h2>
          <p className="text-slate-600">Configure how Shopify orders map to NetSuite transactions.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-b">
          {['Payment', 'Shipment', 'Order', 'Order Item', 'Source'].map((tab) => (
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
                        <span className="text-slate-400">&rarr;</span>
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
                        <span>Unmapped Payment Methods</span>
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
                          <span className="text-slate-400">&rarr;</span>
                          <Select
                            onValueChange={async (value) => {
                              await addPaymentMethodMapping(paymentMethod, value)
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
              <p className="text-sm text-slate-500">Map Shopify shipping method codes to NetSuite shipment method IDs. The Shopify code must match exactly (e.g. &quot;Flat Rate&quot;, &quot;Free Shipping&quot;).</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-t pt-4">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 p-3 bg-slate-50 rounded-lg mb-3 items-center">
                    <div className="font-medium text-slate-700 text-sm">Shopify Shipping Code</div>
                    <div></div>
                    <div className="font-medium text-slate-700 text-sm">NetSuite Ship Method ID</div>
                    <div></div>
                  </div>

                  {/* Unmapped shipping methods from orders */}
                  {unmappedShippingMethods.map((item) => (
                    <div key={item.code} className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 p-3 border border-red-200 rounded-lg mb-2 items-center bg-red-50/30">
                      <div>
                        <div className="text-red-700 font-medium text-sm">
                          {item.code}
                          {item.title && <span className="text-slate-500 font-normal"> — {item.title}</span>}
                        </div>
                        {item.exampleOrder && (
                          <div className="text-xs text-slate-400 mt-0.5">e.g. {item.exampleOrder}</div>
                        )}
                      </div>
                      <span className="text-slate-400">&rarr;</span>
                      <Select
                        onValueChange={async (value) => {
                          await addShipmentMethodMapping(item.code, value)
                          await fetchShipmentMappings()
                        }}
                        onOpenChange={(open) => {
                          if (open && !netsuiteListCache['shipMethod']) {
                            fetchNetSuiteListForField('shipMethod')
                          }
                        }}
                      >
                        <SelectTrigger className="w-full text-sm">
                          <SelectValue placeholder={loadingFields.has('shipMethod') ? 'Loading...' : 'Select ship method...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {loadingFields.has('shipMethod') ? (
                            <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                          ) : netsuiteListCache['shipMethod']?.length > 0 ? (
                            netsuiteListCache['shipMethod'].map((nsItem) => (
                              <SelectItem key={nsItem.id} value={nsItem.id}>
                                {nsItem.name} ({nsItem.id})
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-2 py-1.5 text-sm text-slate-500">No ship methods available</div>
                          )}
                        </SelectContent>
                      </Select>
                      <div className="w-8" />
                    </div>
                  ))}

                  {/* Existing mappings */}
                  {shipmentMappings.map((mapping) => {
                    const cachedItems = netsuiteListCache['shipMethod'] || []
                    const matchedItem = cachedItems.find(item => item.id === mapping.netsuiteId)
                    return (
                      <div key={mapping.id} className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 p-3 border rounded-lg mb-2 items-center">
                        <div className="text-slate-700 font-mono text-sm">{mapping.shopifyCode}</div>
                        <span className="text-slate-400">&rarr;</span>
                        <div className="text-slate-600 text-sm">
                          {matchedItem ? `${matchedItem.name} (${mapping.netsuiteId})` : mapping.netsuiteId}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmDialog('Shipment Method', mapping.shopifyCode, mapping.id.toString())}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )
                  })}

                  {shipmentMappings.length === 0 && unmappedShippingMethods.length === 0 && (
                    <div className="text-center py-6 text-sm text-slate-400 border rounded-lg mb-2">
                      No shipment method mappings found. Import orders to see shipping methods that need mapping.
                    </div>
                  )}

                  {/* Add new mapping row */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 p-3 border-2 border-dashed border-blue-200 rounded-lg items-center bg-blue-50/30">
                    <Input
                      placeholder='e.g. "Flat Rate"'
                      value={newShipmentShopifyCode}
                      onChange={(e) => setNewShipmentShopifyCode(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <span className="text-slate-400">&rarr;</span>
                    <Select
                      value={newShipmentNetsuiteId}
                      onValueChange={setNewShipmentNetsuiteId}
                      onOpenChange={(open) => {
                        if (open && !netsuiteListCache['shipMethod']) {
                          fetchNetSuiteListForField('shipMethod')
                        }
                      }}
                    >
                      <SelectTrigger className="w-full text-sm">
                        <SelectValue placeholder={loadingFields.has('shipMethod') ? 'Loading...' : 'Select ship method...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingFields.has('shipMethod') ? (
                          <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                        ) : netsuiteListCache['shipMethod']?.length > 0 ? (
                          netsuiteListCache['shipMethod'].map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.id})
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-slate-500">Click to load ship methods...</div>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!newShipmentShopifyCode.trim() || !newShipmentNetsuiteId.trim()}
                      onClick={async () => {
                        const success = await addShipmentMethodMapping(
                          newShipmentShopifyCode.trim(),
                          newShipmentNetsuiteId.trim()
                        )
                        if (success) {
                          setNewShipmentShopifyCode('')
                          setNewShipmentNetsuiteId('')
                          await fetchShipmentMappings()
                        } else {
                          alert('Failed to add shipment method mapping')
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Add
                    </Button>
                  </div>
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
                  const mappingsToSave = orderMappings.map((mapping, index) => {
                    if (mapping.translationMappings && Array.isArray(mapping.translationMappings) && mapping.translationMappings.length > 0) {
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

                    if (translationMappingIndex !== null) {
                      const dialogMapping = orderMappings[translationMappingIndex]
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

                  const response = await fetch('/api/mappings/order-fields', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mappings: mappingsToSave }),
                  })

                  const result = await response.json()

                  if (result.success) {
                    alert(`Successfully saved ${result.results?.length || orderMappings.length} mapping(s) to database!`)
                    if (translationMappingIndex !== null) {
                      setTranslationMappings([])
                      setTranslationDefaultValue('')
                      setTranslationMappingIndex(null)
                    }
                    await fetchOrderMappings()
                  } else {
                    alert(`Failed to save mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
                    console.error('Save error:', result)
                  }
                } catch (error) {
                  console.error('Error saving mappings:', error)
                  alert(`Error saving mappings: ${error instanceof Error ? error.message : 'Unknown error'}`)
                }
              }}
            >
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
                {/* Discount Item Setting */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Discount Item (posted as line item for each discounted product)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Select
                      value={defaultDiscountItem || 'none'}
                      onValueChange={async (value) => {
                        await saveDefaultDiscountItem(value === 'none' ? '' : value)
                      }}
                      onOpenChange={(open) => {
                        if (open && discountItemNetSuiteList.length === 0) {
                          fetchDiscountItemNetSuiteList()
                        }
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder={isLoadingDefaultDiscountItem ? "Loading..." : "Select discount item..."}>
                          {defaultDiscountItem && defaultDiscountItem !== '' && discountItemNetSuiteList.length > 0
                            ? discountItemNetSuiteList.find(di => di.id === defaultDiscountItem)?.name || `ID: ${defaultDiscountItem}`
                            : defaultDiscountItem === '' || !defaultDiscountItem ? "Do Not Post" : "Select discount item..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Do Not Post</SelectItem>
                        {isLoadingDiscountItems ? (
                          <div className="px-2 py-1.5 text-sm text-slate-500">Loading...</div>
                        ) : discountItemNetSuiteList.length > 0 ? (
                          discountItemNetSuiteList.map((di) => (
                            <SelectItem key={di.id} value={di.id}>
                              {di.name} (IID: {di.id})
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-slate-500">No discount items available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

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
                             {mapping.mappingType === 'Fixed' && mapping.netsuiteId === 'orderStatus' ? (
                               <Select
                                 value={mapping.shopifyValue || undefined}
                                 onValueChange={(value) => {
                                   const updated = [...orderMappings]
                                   updated[index] = { ...updated[index], shopifyValue: value }
                                   setOrderMappings(updated)
                                 }}
                               >
                                 <SelectTrigger className="w-full">
                                   <SelectValue placeholder="Select order status...">
                                     {mapping.shopifyValue === 'A' ? 'Pending Approval' :
                                      mapping.shopifyValue === 'B' ? 'Pending Fulfillment' :
                                      mapping.shopifyValue === 'C' ? 'Partially Fulfilled' :
                                      mapping.shopifyValue === 'E' ? 'Pending Billing/Partially Fulfilled' :
                                      mapping.shopifyValue === 'F' ? 'Pending Billing' :
                                      mapping.shopifyValue === 'G' ? 'Billed' :
                                      mapping.shopifyValue === 'H' ? 'Closed' :
                                      mapping.shopifyValue || 'Select order status...'}
                                   </SelectValue>
                                 </SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="A">Pending Approval</SelectItem>
                                   <SelectItem value="B">Pending Fulfillment</SelectItem>
                                   <SelectItem value="C">Partially Fulfilled</SelectItem>
                                   <SelectItem value="E">Pending Billing/Partially Fulfilled</SelectItem>
                                   <SelectItem value="F">Pending Billing</SelectItem>
                                   <SelectItem value="G">Billed</SelectItem>
                                   <SelectItem value="H">Closed</SelectItem>
                                 </SelectContent>
                               </Select>
                             ) : mapping.mappingType === 'Fixed' && fieldsWithDropdowns.includes(mapping.netsuiteId) ? (
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
                               <div className="text-slate-700 text-sm p-2 border rounded bg-slate-50 w-full">
                                 {getCustomFieldDisplayText(mapping)}
                               </div>
                             ) : mapping.mappingType === 'Order Header' ? (
                               <div className="w-full">
                               <Select
                                 value={mapping.shopifyCode || ''}
                                 onValueChange={(value) => {
                                   if (value === 'custom') {
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
                                    if (mapping.shopifyCode) {
                                      loadAvailableShopifyValues(mapping.shopifyCode)
                                    }
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
                               <span className="text-slate-400">&rarr;</span>
                               <div className="flex items-center space-x-2 w-full">
                                 {mapping.netsuiteId ? (
                                   <div className="text-slate-700 font-mono text-sm p-2 border rounded bg-slate-50 w-full">
                                     {mapping.netsuiteId}
                                   </div>
                                 ) : (
                                  <div className="text-slate-400 italic text-sm p-2 w-full">
                                    Click &quot;Add row&quot; to set NetSuite field
                                  </div>
                                 )}
                               </div>
                             </div>
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
                  const mappingsToSave = orderItemMappings.map((mapping) => ({
                    ...mapping,
                  }))

                  const response = await fetch('/api/mappings/order-item-fields', {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ mappings: mappingsToSave }),
                  })

                  const result = await response.json()

                  if (result.success) {
                    alert(`Successfully saved ${result.results?.length || orderItemMappings.length} mapping(s) to database!`)
                    await fetchOrderItemMappings()
                  } else {
                    alert(`Failed to save mappings: ${result.error || 'Unknown error'}${result.details ? `\n\nDetails: ${result.details}` : ''}`)
                    console.error('Save error:', result)
                  }
                } catch (error) {
                  console.error('Error saving order item mappings:', error)
                  alert(`Error saving mappings: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
                          .filter((code, idx, arr) => arr.indexOf(code) === idx)
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
                    <span className="text-slate-400">&rarr;</span>
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

        {/* Source Mappings Tab */}
        {activeMappingTab === 'Source' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Order Source Mappings
                </CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Map Shopify order sources to display names and tax settings. Orders from unmapped sources cannot be pushed to NetSuite.
                </p>
              </div>
              <Button onClick={handleAddOrderSourceMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
                Add Mapping
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Tax info banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">How &quot;Taxable in NS&quot; affects order pushing</h4>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc pl-4">
                    <li><strong>Taxable = Yes</strong> (e.g., your Shopify store): NetSuite calculates tax on the cash sale. You collect and remit the tax.</li>
                    <li><strong>Taxable = No</strong> (e.g., Shop App, Facebook, TikTok): The cash sale pushes as non-taxable with a &quot;Marketplace Tax&quot; line item. Shopify/marketplace collects and remits the tax. Tax deductions appear as tax_adjustment debits in the payout.</li>
                  </ul>
                  <p className="text-xs text-amber-700 mt-2">
                    See the Payout Mappings tax helper for details on how tax adjustments flow through the GL.
                  </p>
                </div>

                {/* Marketplace Tax Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border rounded-lg p-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Non-Taxable Tax Code</label>
                    <p className="text-xs text-slate-500 mb-2">Tax code applied to Sales Orders for marketplace sources (typically &quot;None&quot;)</p>
                    <Select
                      value={marketplaceNonTaxableTaxCode}
                      onValueChange={(value) => saveMarketplaceNonTaxableTaxCode(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={isLoadingSalestaxitems ? 'Loading...' : 'Select tax code'} />
                      </SelectTrigger>
                      <SelectContent>
                        {salestaxitemList.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} (ID: {item.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="bg-white border rounded-lg p-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Marketplace Tax Item</label>
                    <p className="text-xs text-slate-500 mb-2">Non-inventory item that posts marketplace-collected tax to a pass-through GL account</p>
                    <Select
                      value={marketplaceTaxItem}
                      onValueChange={(value) => saveMarketplaceTaxItem(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={isLoadingNonInventoryItems ? 'Loading...' : 'Select item'} />
                      </SelectTrigger>
                      <SelectContent>
                        {nonInventoryItemList.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} (ID: {item.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Order Source Mappings Table */}
                <div className="border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">App ID</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Source Name</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Friendly Name</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Taxable in NS</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-700">Active</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {orderSourceMappings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                            No order source mappings found. Click &quot;Add Mapping&quot; to create one.
                          </td>
                        </tr>
                      ) : (
                        orderSourceMappings.map((mapping) => (
                          <tr key={mapping.id}>
                            <td className="px-4 py-3 text-sm text-slate-900 font-mono">
                              {mapping.appId ?? '\u2014'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {mapping.sourceName ?? '\u2014'}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {mapping.friendlyName}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                mapping.isTaxable
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-orange-100 text-orange-800'
                              }`}>
                                {mapping.isTaxable ? 'Yes' : 'No'}
                              </span>
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
                    Shopify source_name (e.g., &apos;web&apos;, &apos;checkout&apos;). Either App ID or Source Name must be provided.
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
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={orderSourceMappingEditDialog.mapping.isTaxable}
                      onChange={(e) => setOrderSourceMappingEditDialog({
                        ...orderSourceMappingEditDialog,
                        mapping: {
                          ...orderSourceMappingEditDialog.mapping!,
                          isTaxable: e.target.checked
                        }
                      })}
                      className="w-4 h-4"
                    />
                    <label className="text-sm font-medium text-slate-700">
                      Taxable in NetSuite
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 pl-6">
                    {orderSourceMappingEditDialog.mapping.isTaxable
                      ? 'NetSuite will calculate tax on the cash sale. Use for direct sales (your Shopify store).'
                      : 'NetSuite will NOT calculate tax. A "Marketplace Tax" line item will be added instead. Use for marketplace orders where Shopify collects and remits tax (Shop App, Facebook, TikTok).'}
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
  }

  const renderCustomersContent = () => {
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
                  <span className="text-slate-400">&rarr;</span>
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

  const renderProductsContent = () => (
    <ProductFieldMappings />
  )

  const renderFulfillmentsContent = () => (
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

  const renderPayoutsContent = () => {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Payout Mappings</h2>
          <p className="text-slate-600">Configure how Shopify payouts map to NetSuite deposits.</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payout Mappings</CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={() => setTaxHelperDialogOpen(true)} variant="outline" className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                Tax Helper
              </Button>
              <Button onClick={handleAddPayoutMapping} className="bg-blue-600 hover:bg-blue-700 text-white">
                Add Mapping
              </Button>
            </div>
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
                          <td className="px-4 py-3 text-sm text-slate-600">{mapping.netsuiteId || '\u2014'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{mapping.description || '\u2014'}</td>
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

        {/* Auto-Assign Rules Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Auto-Assign Rules</CardTitle>
            <Button onClick={() => setAutoAssignEditDialog({
              isOpen: true,
              rule: { name: '', conditionType: '', conditionAdjustmentReason: '', conditionSourceName: '', targetField: 'otherFeesDescription', targetMappingId: '', priority: 0, isActive: true }
            })}>
              + Add Rule
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              Rules auto-assign dropdown mappings to transactions when a payout is imported. First matching rule wins (by priority).
            </p>
            {autoAssignRules.length === 0 ? (
              <p className="text-center text-slate-400 py-4">No auto-assign rules configured yet.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Priority</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Conditions</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Target</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Active</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {autoAssignRules.map(rule => (
                      <tr key={rule.id} className={rule.isActive ? '' : 'opacity-50'}>
                        <td className="px-3 py-2">{rule.priority}</td>
                        <td className="px-3 py-2 font-medium">{rule.name}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {[
                            rule.conditionType && `type=${rule.conditionType}`,
                            rule.conditionAdjustmentReason && `reason=${rule.conditionAdjustmentReason}`,
                            rule.conditionSourceName && `source=${rule.conditionSourceName}`,
                          ].filter(Boolean).join(', ') || 'Any'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                            {rule.targetField === 'amountDescription' ? 'Amount' : rule.targetField === 'feeDescription' ? 'Fee' : 'Other Fees'}
                          </span>
                          {' → '}
                          {rule.targetMappingDescription}
                        </td>
                        <td className="px-3 py-2">{rule.isActive ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setAutoAssignEditDialog({
                            isOpen: true,
                            rule: {
                              id: rule.id,
                              name: rule.name,
                              conditionType: rule.conditionType || '',
                              conditionAdjustmentReason: rule.conditionAdjustmentReason || '',
                              conditionSourceName: rule.conditionSourceName || '',
                              targetField: rule.targetField,
                              targetMappingId: String(rule.targetMappingId),
                              priority: rule.priority,
                              isActive: rule.isActive,
                            }
                          })}>Edit</Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={async () => {
                            if (!confirm('Delete this rule?')) return
                            await fetch(`/api/mappings/auto-assign-rules/${rule.id}`, { method: 'DELETE' })
                            fetchAutoAssignRules()
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto-Assign Rule Edit Dialog */}
        <Dialog open={autoAssignEditDialog.isOpen} onOpenChange={(open) => {
          if (!open) setAutoAssignEditDialog({ isOpen: false, rule: null })
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{autoAssignEditDialog.rule?.id ? 'Edit' : 'Add'} Auto-Assign Rule</DialogTitle>
            </DialogHeader>
            {autoAssignEditDialog.rule && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <Input
                    value={autoAssignEditDialog.rule.name}
                    onChange={(e) => setAutoAssignEditDialog(prev => ({
                      ...prev,
                      rule: prev.rule ? { ...prev.rule, name: e.target.value } : null
                    }))}
                    placeholder="e.g. Tax Adjustments → E-Com Tax Offset"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Type</label>
                    <Select
                      value={autoAssignEditDialog.rule.conditionType || '__any__'}
                      onValueChange={(val) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, conditionType: val === '__any__' ? '' : val } : null
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any</SelectItem>
                        {conditionOptions.types.map(t => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Adjustment Reason</label>
                    <Select
                      value={autoAssignEditDialog.rule.conditionAdjustmentReason || '__any__'}
                      onValueChange={(val) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, conditionAdjustmentReason: val === '__any__' ? '' : val } : null
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any</SelectItem>
                        {conditionOptions.adjustmentReasons.map(r => (
                          <SelectItem key={r} value={r}>
                            {r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Order Source</label>
                    <Select
                      value={autoAssignEditDialog.rule.conditionSourceName || '__any__'}
                      onValueChange={(val) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, conditionSourceName: val === '__any__' ? '' : val } : null
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any</SelectItem>
                        {orderSourceMappings.filter(m => m.isActive).map(m => (
                          <SelectItem key={m.id} value={m.friendlyName}>{m.friendlyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Target Field</label>
                    <Select
                      value={autoAssignEditDialog.rule.targetField}
                      onValueChange={(val) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, targetField: val } : null
                      }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amountDescription">Amount Description</SelectItem>
                        <SelectItem value="feeDescription">Fee Description</SelectItem>
                        <SelectItem value="otherFeesDescription">Other Fees Description</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Target Mapping</label>
                    <Select
                      value={autoAssignEditDialog.rule.targetMappingId}
                      onValueChange={(val) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, targetMappingId: val } : null
                      }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select mapping" /></SelectTrigger>
                      <SelectContent>
                        {payoutMappings
                          .filter(m => m.isActive)
                          .map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.description || m.netsuiteId}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Priority (lower = first)</label>
                    <Input
                      type="number"
                      value={autoAssignEditDialog.rule.priority}
                      onChange={(e) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, priority: parseInt(e.target.value) || 0 } : null
                      }))}
                    />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Checkbox
                      checked={autoAssignEditDialog.rule.isActive}
                      onCheckedChange={(checked) => setAutoAssignEditDialog(prev => ({
                        ...prev,
                        rule: prev.rule ? { ...prev.rule, isActive: !!checked } : null
                      }))}
                    />
                    <label className="text-sm font-medium text-slate-700">Active</label>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={() => setAutoAssignEditDialog({ isOpen: false, rule: null })}>Cancel</Button>
                  <Button onClick={async () => {
                    const rule = autoAssignEditDialog.rule
                    if (!rule || !rule.name || !rule.targetMappingId) return
                    const body = {
                      name: rule.name,
                      conditionType: rule.conditionType || null,
                      conditionAdjustmentReason: rule.conditionAdjustmentReason || null,
                      conditionSourceName: rule.conditionSourceName || null,
                      targetField: rule.targetField,
                      targetMappingId: rule.targetMappingId,
                      priority: rule.priority,
                      isActive: rule.isActive,
                    }
                    if (rule.id) {
                      await fetch(`/api/mappings/auto-assign-rules/${rule.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      })
                    } else {
                      await fetch('/api/mappings/auto-assign-rules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      })
                    }
                    setAutoAssignEditDialog({ isOpen: false, rule: null })
                    fetchAutoAssignRules()
                  }}>Save</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Tax Helper Dialog */}
        <Dialog open={taxHelperDialogOpen} onOpenChange={setTaxHelperDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-600" />
                Marketplace Tax &mdash; How It Works
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">The Problem</h4>
                <p className="text-blue-800">
                  Marketplace channels (Shop App, Facebook, TikTok) charge sales tax to the customer and remit it directly to the state.
                  Shopify then deducts this tax from your payout as a <strong>tax_adjustment</strong> debit. You never touch this money.
                </p>
                <p className="text-blue-800 mt-2">
                  If NetSuite also calculates tax on these orders, the tax goes to your state-specific Sales Tax Payable accounts
                  (NC, FL, SC, etc.) &mdash; creating phantom liabilities you don&apos;t actually owe. The tax adjustments in the payout
                  can&apos;t offset them because they don&apos;t have state-level info.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">The Solution: Non-Taxable + Line Item Pass-Through</h4>
                <ol className="list-decimal list-inside space-y-2 text-green-800">
                  <li>Marketplace orders push to NS as <strong>non-taxable</strong> (no NS tax calculation)</li>
                  <li>A &quot;Marketplace Tax&quot; line item is added for the exact Shopify tax amount &rarr; <strong>credits</strong> the Pass-Through GL</li>
                  <li>The cash sale total matches what the customer paid (subtotal + tax)</li>
                  <li>In the payout deposit, the tax_adjustment &rarr; <strong>debits</strong> the same Pass-Through GL</li>
                  <li>Pass-Through GL nets to <strong>$0</strong> over time</li>
                </ol>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-900 mb-2">Which Payout Mapping to Use for Tax Adjustments</h4>
                <p className="text-amber-800">
                  Your tax_adjustment transactions should use a payout mapping that points to the
                  <strong> Marketplace Tax Pass-Through</strong> GL account. This is the same account that the
                  &quot;Marketplace Tax&quot; line item on the cash sale posts to.
                </p>
                <p className="text-amber-800 mt-2">
                  <strong>Current setup:</strong> &quot;E-Com Tax Offset&quot; (account 1019) is used for tax adjustments.
                  Make sure this account matches the GL that the &quot;Marketplace Tax&quot; NS item posts to.
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-2">Example: Order #76975 (Shop App, shipping to MI)</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-medium mb-1">Cash Sale (non-taxable):</p>
                    <ul className="space-y-1 text-slate-600">
                      <li>Product lines: $134.75 &rarr; Revenue</li>
                      <li>&quot;Marketplace Tax&quot; line: $8.10 &rarr; Pass-Through GL</li>
                      <li>CS total: $142.85</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Payout Deposit:</p>
                    <ul className="space-y-1 text-slate-600">
                      <li>Charge: $137.91 ($142.85 - $4.94 fee)</li>
                      <li>Tax adjustment: -$8.10 &rarr; Pass-Through GL</li>
                      <li>Net GL: +$8.10 - $8.10 = $0</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2">Important: Tax Adjustments May Be on Different Payouts</h4>
                <p className="text-red-800">
                  The charge and tax_adjustment often appear on <strong>different payouts</strong> (e.g., charge on Monday,
                  tax deduction on Wednesday). This is normal. The Pass-Through GL still nets to $0 over time &mdash;
                  there may just be a small residual balance at any point from recent transactions that haven&apos;t fully settled.
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-800 mb-2">NetSuite Setup Required (One-Time)</h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-700">
                  <li>Create GL account: <strong>&quot;Marketplace Tax Pass-Through&quot;</strong> (Other Current Liability)</li>
                  <li>Create non-inventory item: <strong>&quot;Marketplace Tax&quot;</strong> posting to that GL</li>
                  <li>In Mappings &rarr; Orders &rarr; Source tab: set marketplace sources to <strong>Taxable = No</strong></li>
                  <li>Ensure the payout mapping for tax adjustments points to the same GL account</li>
                </ol>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const renderOtherContent = () => (
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

  // ============================================================
  // MAIN RETURN
  // ============================================================

  return (
    <>
      {activeSubSection === 'mappings-orders' && renderOrdersContent()}
      {activeSubSection === 'mappings-customers' && renderCustomersContent()}
      {activeSubSection === 'mappings-products' && renderProductsContent()}
      {activeSubSection === 'mappings-fulfillments' && renderFulfillmentsContent()}
      {activeSubSection === 'mappings-payouts' && renderPayoutsContent()}
      {activeSubSection === 'mappings-other' && renderOtherContent()}

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmDialog.isOpen} onOpenChange={(open) => {
        if (!open) closeDeleteConfirmDialog()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              Are you sure you want to delete this {deleteConfirmDialog.itemType}?
            </p>
            <p className="font-medium text-slate-800">{deleteConfirmDialog.itemName}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDeleteConfirmDialog}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDelete}
              >
                Delete
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
                    if (customFieldInfo?.fieldType === 'select' && !customFieldValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }
                    const netsuiteValue = customFieldValue || ''

                    const newMapping: OrderFieldMapping = {
                      id: `temp-${Date.now()}`,
                      mappingType: 'Custom',
                      shopifyValue: netsuiteValue,
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
                  if (value && value !== 'Custom field' && !orderItemFieldsWithDropdowns.includes(value)) {
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
                  if (value && value !== 'Custom field' && !customerFieldsWithDropdowns.includes(value)) {
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
                    Enter a field name and click &quot;Query&quot; to load field information.
                  </div>
                ) : null}
              </div>
            )}

            {selectedCustomerNetSuiteField && selectedCustomerNetSuiteField !== 'Custom field' && customerFieldsWithDropdowns.includes(selectedCustomerNetSuiteField) && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  {selectedCustomerNetSuiteField.charAt(0).toUpperCase() + selectedCustomerNetSuiteField.slice(1)} Value
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
                    if (customerCustomFieldInfo?.fieldType === 'select' && !customerCustomFieldValue) {
                      alert('Please select a value from the dropdown')
                      return
                    }
                    if (customerCustomFieldInfo && customerCustomFieldInfo.fieldType !== 'text' && !customerCustomFieldValue) {
                      alert(`Please enter a ${customerCustomFieldInfo.fieldType} value`)
                      return
                    }

                    let mappingType: 'Fixed' | 'Custom' = 'Custom'
                    let shopifyValue: string | undefined = undefined

                    if (customerCustomFieldInfo?.fieldType === 'select' && customerCustomFieldValue) {
                      const selectedItem = customerCustomFieldInfo.listItems.find(item => item.value === customerCustomFieldValue)
                      shopifyValue = selectedItem ? `${selectedItem.text} (Value: ${selectedItem.value})` : customerCustomFieldValue
                      mappingType = 'Fixed'
                    } else if (customerCustomFieldValue) {
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
                  disabled={!customCustomerNetSuiteFieldName.trim() || (customerCustomFieldInfo !== null && !customerCustomFieldValue)}
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

                          const cameFromTranslationDialog = translationMappingIndex !== null && translationMappingIndex === editingMappingIndex

                          setIsCustomShopifyFieldDialogOpen(false)
                          setCustomShopifyOrderId('')
                          setCustomShopifyOrderData(null)
                          setEditingMappingIndex(null)

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
                        collapsed={2}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        enableClipboard={true}
                      />
                    </div>
                  </div>
                )}

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

                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Select Shopify Field
                  </label>
                  <Select
                    value={orderMappings[editingOrderHeaderIndex].shopifyCode || ''}
                    onValueChange={(value) => {
                      if (value === 'custom') {
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
                <div className="border rounded-lg p-4 bg-slate-50">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Select Shopify Field Code
                  </label>
                  <Select
                    value={orderMappings[translationMappingIndex].shopifyCode || ''}
                    onValueChange={(value) => {
                      if (value === 'custom') {
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
                        collapsed={2}
                        displayDataTypes={false}
                        displayObjectSize={false}
                        enableClipboard={true}
                      />
                    </div>
                  </div>
                )}

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

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-50 p-2 border-b grid grid-cols-12 gap-2 text-sm font-medium">
                    <div className="col-span-1"></div>
                    <div className="col-span-5">Shopify value</div>
                    <div className="col-span-1 text-center">&rarr;</div>
                    <div className="col-span-5">NetSuite value</div>
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
                        <div className="col-span-1 text-center text-slate-400">&rarr;</div>
                        <div className="col-span-4">
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
                  if (translationMappingIndex !== null) {
                    const updated = [...orderMappings]
                    const filteredTranslations: OrderFieldTranslationMapping[] = translationMappings.filter(
                      (tm) => tm.shopifyValue && tm.netsuiteValue
                    ).map((tm) => ({
                      ...tm,
                      id: tm.id || `temp-${Date.now()}-${Math.random()}`,
                      orderFieldMappingId: orderMappings[translationMappingIndex]?.id || '',
                    }))
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
                  if (!mapping.id || mapping.id.toString().startsWith('temp-')) {
                    alert('Please save the mapping first before configuring translations. Click "Save" on the main page to save the mapping, then configure translations.')
                    setIsTranslationDialogOpen(false)
                    return
                  }

                  try {
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
                    const updated = [...orderMappings]
                    const filteredTranslations: OrderFieldTranslationMapping[] = translationMappings.filter(
                      (tm) => tm.shopifyValue && tm.netsuiteValue
                    ).map((tm) => ({
                      ...tm,
                      id: tm.id || `temp-${Date.now()}-${Math.random()}`,
                      orderFieldMappingId: orderMappings[translationMappingIndex]?.id || '',
                    }))
                    updated[translationMappingIndex] = {
                      ...updated[translationMappingIndex],
                      translationMappings: filteredTranslations,
                      translationDefaultValue: translationDefaultValue || undefined,
                    }
                    setOrderMappings(updated)

                    alert('Translation mappings saved successfully!')
                    setIsTranslationDialogOpen(false)
                    setTranslationMappingIndex(null)
                    setTranslationMappings([])
                    setTranslationDefaultValue('')
                    setTranslationOrderId('')
                    setTranslationOrderData(null)
                  } else {
                    console.error('Translation save error:', result)
                    alert(`Failed to save translations: ${result.error || 'Unknown error'}. Please check the console for details.`)
                  }
                } catch (error) {
                  console.error('Error saving translation mappings:', error)
                  alert(`Error saving translations: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}