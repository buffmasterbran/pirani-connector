const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'https://pirani-life.myshopify.com'
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'

const SHOPIFY_BASE_URL = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}`

const headers = {
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

export async function getPayoutsFromShopify() {
  try {
    const response = await fetch(`${SHOPIFY_BASE_URL}/shopify_payments/payouts.json`, {
      headers
    })
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.payouts || []
  } catch (error) {
    console.error('Error fetching payouts from Shopify:', error)
    throw error
  }
}

export async function getTransactionsByPayout(payoutId: string) {
  try {
    const response = await fetch(
      `${SHOPIFY_BASE_URL}/shopify_payments/balance/transactions.json?payout_id=${payoutId}`,
      { headers }
    )
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.transactions || []
  } catch (error) {
    console.error('Error fetching transactions from Shopify:', error)
    throw error
  }
}

export async function getOrdersFromShopify() {
  try {
    const response = await fetch(`${SHOPIFY_BASE_URL}/orders.json?limit=250`, {
      headers
    })
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.orders || []
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error)
    throw error
  }
}

export async function getOrderById(orderId: string) {
  try {
    const response = await fetch(`${SHOPIFY_BASE_URL}/orders/${orderId}.json`, {
      headers
    })
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.order || null
  } catch (error) {
    console.error('Error fetching order from Shopify:', error)
    throw error
  }
}

export async function getOrderByNameFromShopify(orderName: string) {
  try {
    // Use the full order name including # symbol
    console.log(`🔍 Searching for order with name: "${orderName}"`)
    
    // Search for orders with this name (including # if present)
    const searchUrl = `${SHOPIFY_BASE_URL}/orders.json?name=${encodeURIComponent(orderName)}&limit=1`
    console.log(`📡 Making request to: ${searchUrl}`)
    
    const response = await fetch(searchUrl, {
      headers
    })
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    const orders = data.orders || []
    console.log(`📦 Found ${orders.length} orders from Shopify API`)
    
    if (orders.length > 0) {
      console.log(`📋 Order names found:`, orders.map((o: any) => o.name))
    }
    
    // Find exact match by name (case insensitive) - compare against original orderName
    const exactMatch = orders.find((order: any) => 
      order.name.toLowerCase() === orderName.toLowerCase()
    )
    
    if (exactMatch) {
      console.log(`✅ Found exact match: ${exactMatch.name}`)
    } else {
      console.log(`❌ No exact match found for "${orderName}"`)
    }
    
    return exactMatch || null
  } catch (error) {
    console.error('Error fetching order by name from Shopify:', error)
    throw error
  }
}
