export interface FieldMapping {
  id?: string
  storeConfigId: string | null
  mappingType: string
  shopifyField: string
  netsuiteFieldId: string | null
  defaultValue: string | null
  isRequired: boolean
  isEnabled: boolean
  sortOrder: number
  category: string
  specialConfig: Record<string, unknown> | null
  storeConfig?: { storeName: string; storeLabel: string | null } | null
}

export interface NsField {
  fieldId: string
  label: string
  type: string
  group: string
}

export interface StoreConfig {
  id: string
  storeName: string
  storeLabel: string | null
}

export interface NsPriceLevel {
  id: number
  name: string
}

export interface NsLocation {
  id: number
  name: string
}

export interface ShopifyLocation {
  id: string
  name: string
  isActive: boolean
}

export interface LocationMapping {
  id: string
  storeConfigId: string
  netsuiteLocationId: number
  netsuiteLocationName: string | null
  shopifyLocationId: string
  shopifyLocationName: string | null
  isActive: boolean
}

export const SHOPIFY_FIELDS_REQUIRED = [
  { id: 'sku', label: 'SKU', description: 'Product variant SKU' },
  { id: 'title', label: 'Title', description: 'Product title' },
  { id: 'price', label: 'Price', description: 'Variant price', special: true },
  { id: 'inventory_quantity', label: 'Inventory Quantity', description: 'Stock level', special: true },
]

export const SHOPIFY_FIELDS_STANDARD = [
  { id: 'body_html', label: 'Description (HTML)', description: 'Product description' },
  { id: 'compare_at_price', label: 'Compare at Price', description: 'Original price for sale display', special: true },
  { id: 'collections', label: 'Collections / Category', description: 'Product collection assignment', special: true },
  { id: 'weight', label: 'Weight', description: 'Product weight' },
  { id: 'weight_unit', label: 'Weight Unit', description: 'kg, g, lb, oz' },
  { id: 'barcode', label: 'Barcode', description: 'UPC/EAN barcode' },
  { id: 'vendor', label: 'Vendor', description: 'Product vendor/manufacturer' },
  { id: 'product_type', label: 'Product Type', description: 'Shopify product type' },
  { id: 'tags', label: 'Tags', description: 'Comma-separated tags' },
  { id: 'published', label: 'Published', description: 'Visible on storefront' },
  { id: 'taxable', label: 'Taxable', description: 'Subject to tax' },
]

export const SHOPIFY_FIELDS_UNCOMMON = [
  { id: 'handle', label: 'Handle', description: 'URL handle' },
  { id: 'variant_title', label: 'Variant Title', description: 'Variant display name' },
  { id: 'requires_shipping', label: 'Requires Shipping', description: 'Physical product flag' },
  { id: 'inventory_policy', label: 'Inventory Policy', description: 'Allow overselling' },
  { id: 'metafields_global_title_tag', label: 'SEO Title', description: 'Meta title tag' },
  { id: 'metafields_global_description_tag', label: 'SEO Description', description: 'Meta description tag' },
  { id: 'published_at', label: 'Published At', description: 'Publish date' },
  { id: 'published_scope', label: 'Published Scope', description: 'web, global' },
  { id: 'inventory_management', label: 'Inventory Management', description: 'Tracked by Shopify' },
]
