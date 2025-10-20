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

  // Check payment method mapping - Handle both array and JSON string formats
  console.log(`🔍 Validating order ${order.id} (${order.name})`)
  console.log(`📊 Raw payment_gateway_names:`, order.payment_gateway_names)
  
  let paymentGatewayNames = order.payment_gateway_names
  if (typeof paymentGatewayNames === 'string') {
    try {
      paymentGatewayNames = JSON.parse(paymentGatewayNames)
      console.log(`📊 Parsed payment_gateway_names:`, paymentGatewayNames)
    } catch (e) {
      console.log(`❌ Failed to parse payment_gateway_names:`, e)
      paymentGatewayNames = null
    }
  }
  
  console.log(`📊 Final payment_gateway_names:`, paymentGatewayNames)
  console.log(`📊 Available payment mappings:`, paymentMappings.map(m => `${m.shopifyCode}→${m.netsuiteId}`))
  
  if (paymentGatewayNames && Array.isArray(paymentGatewayNames) && paymentGatewayNames.length > 0) {
    const paymentMethod = paymentGatewayNames[0]
    console.log(`💳 Checking payment method: "${paymentMethod}"`)
    
    const paymentMapping = checkPaymentMethodMapping(paymentMethod, paymentMappings)
    console.log(`🔍 Payment mapping result:`, paymentMapping)
    
    if (!paymentMapping) {
      console.log(`⚠️ No mapping found for payment method: "${paymentMethod}"`)
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
    } else {
      console.log(`✅ Found mapping for payment method: "${paymentMethod}" → ${paymentMapping.netsuiteId}`)
    }
  } else {
    console.log(`ℹ️ No payment gateway names found or empty array`)
  }

  // Check shipment method mapping - Handle both array and JSON string formats
  let shippingLines = order.shipping_lines
  if (typeof shippingLines === 'string') {
    try {
      shippingLines = JSON.parse(shippingLines)
    } catch (e) {
      shippingLines = null
    }
  }
  
  if (shippingLines && Array.isArray(shippingLines) && shippingLines.length > 0 && shippingLines[0]?.code) {
    const shippingMethod = shippingLines[0].code
    console.log(`🚚 Checking shipping method: "${shippingMethod}"`)
    console.log(`📊 Available shipment mappings:`, shipmentMappings.map(m => `${m.shopifyCode}→${m.netsuiteId} (active: ${m.isActive})`))
    
    const shipmentMapping = checkShipmentMethodMapping(shippingMethod, shipmentMappings)
    console.log(`🔍 Shipment mapping result:`, shipmentMapping)
    
    if (!shipmentMapping) {
      console.log(`⚠️ No mapping found for shipping method: "${shippingMethod}"`)
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
    } else {
      console.log(`✅ Found mapping for shipping method: "${shippingMethod}" → ${shipmentMapping.netsuiteId}`)
    }
  } else {
    console.log(`ℹ️ No shipping lines found or empty array`)
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
