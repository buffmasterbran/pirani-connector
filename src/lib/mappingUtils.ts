// Utility functions for mapping validation and error handling

export interface MappingError {
  orderId: string
  orderName: string
  missingMapping: {
    type: 'payment' | 'shipment' | 'order_field' | 'order_item_field' | 'customer_field'
    shopifyValue: string
    netsuiteField?: string
  }
  errorMessage: string
  timestamp: Date
}

export interface PaymentMethodMapping {
  id: string
  shopifyCode: string // Shopify payment gateway code (e.g., 'visa', 'shopify_payments')
  netsuiteId: string // NetSuite Internal ID (e.g., '177', '228')
  isActive: boolean
}

export interface ShipmentMethodMapping {
  id: string
  shopifyCode: string // Shopify shipping method code (e.g., 'free_shipping', 'standard_shipping')
  netsuiteId: string // NetSuite Internal ID (e.g., '293', '288', '1035')
  isActive: boolean
}

export interface OrderFieldMapping {
  id: string
  mappingType: 'Fixed' | 'Order Header' | 'Order Header with Translation' | 'Custom'
  shopifyCode?: string // Shopify field code (e.g., 'order_id', 'payment_gateway_names')
  shopifyValue?: string // Fixed value (e.g., 'Online Sales', 'Unchecked')
  netsuiteId: string // NetSuite Internal ID or field name (e.g., '11', 'false', 'custbody_pir_shop_order_date')
  applyToAllAccounts: boolean | 'N/A'
  isActive: boolean
  customFieldId?: string // For custom fields
}

export interface OrderItemFieldMapping {
  id: string
  mappingType: 'Fixed' | 'Order Line' | 'Custom'
  shopifyCode?: string // Shopify field code (e.g., 'properties._pca_preview_url')
  shopifyValue?: string // Fixed value (e.g., 'Base Rate (MSRP)')
  netsuiteId: string // NetSuite Internal ID or field name (e.g., '1', 'custcol_custom_image_url')
  applyToAllAccounts: boolean | 'N/A'
  isActive: boolean
  customFieldId?: string // For custom fields
}

export interface CustomerFieldMapping {
  id: string
  mappingType: 'Fixed' | 'Customer Field' | 'Custom'
  shopifyCode?: string // Shopify field code (e.g., 'customer_id', 'email')
  shopifyValue?: string // Fixed value (e.g., '6 Pirani Life : Websales')
  netsuiteId: string // NetSuite Internal ID or field name (e.g., '1833', 'custentity_pir_cust_source')
  applyToAllAccounts: boolean | 'N/A'
  isActive: boolean
  customFieldId?: string // For custom fields
}

// Check if a payment method has a mapping
export function checkPaymentMethodMapping(
  paymentMethod: string, 
  mappings: PaymentMethodMapping[]
): PaymentMethodMapping | null {
  return mappings.find(mapping => 
    mapping.isActive && 
    mapping.shopifyCode === paymentMethod
  ) || null
}

// Check if a shipment method has a mapping
export function checkShipmentMethodMapping(
  shipmentMethod: string, 
  mappings: ShipmentMethodMapping[]
): ShipmentMethodMapping | null {
  return mappings.find(mapping => 
    mapping.isActive && 
    mapping.shopifyCode === shipmentMethod
  ) || null
}

// Validate order mappings and return any missing mappings
export function validateOrderMappings(
  order: any,
  paymentMappings: PaymentMethodMapping[],
  shipmentMappings: ShipmentMethodMapping[]
): MappingError[] {
  const errors: MappingError[] = []

  // Check payment method mapping - Updated to use correct Shopify field
  const paymentMethod = order.payment_gateway_names?.[0] || 'unknown'
  if (paymentMethod) {
    const paymentMapping = checkPaymentMethodMapping(paymentMethod, paymentMappings)
    if (!paymentMapping) {
      errors.push({
        orderId: order.id,
        orderName: order.name || order.orderName,
        missingMapping: {
          type: 'payment',
          shopifyValue: paymentMethod
        },
        errorMessage: `Payment method "${paymentMethod}" is not mapped to a NetSuite payment option`,
        timestamp: new Date()
      })
    }
  }

  // Check shipment method mapping - Using Shopify shipping code (e.g., "Flat Rate")
  const shippingMethod = order.shipping_lines?.[0]?.code || 'unknown'
  if (shippingMethod) {
    const shipmentMapping = checkShipmentMethodMapping(shippingMethod, shipmentMappings)
    if (!shipmentMapping) {
      errors.push({
        orderId: order.id,
        orderName: order.name || order.orderName,
        missingMapping: {
          type: 'shipment',
          shopifyValue: shippingMethod
        },
        errorMessage: `Shipment method "${shippingMethod}" is not mapped to a NetSuite shipment option`,
        timestamp: new Date()
      })
    }
  }

  return errors
}

// Get all unmapped payment methods from errors
export function getUnmappedPaymentMethods(errors: MappingError[]): string[] {
  const unmapped = errors
    .filter(error => error.missingMapping.type === 'payment')
    .map(error => error.missingMapping.shopifyValue)
  
  // Remove duplicates
  return Array.from(new Set(unmapped))
}

// Get all unmapped shipment methods from errors
export function getUnmappedShipmentMethods(errors: MappingError[]): string[] {
  const unmapped = errors
    .filter(error => error.missingMapping.type === 'shipment')
    .map(error => error.missingMapping.shopifyValue)
  
  // Remove duplicates
  return Array.from(new Set(unmapped))
}
