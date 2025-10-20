const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'https://pirani-life.myshopify.com'
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ''
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'

const SHOPIFY_BASE_URL = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}`

const headers = {
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

export async function getPayoutsFromShopify(limit: number = 250) {
  try {
    const response = await fetch(`${SHOPIFY_BASE_URL}/shopify_payments/payouts.json?limit=${limit}`, {
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

export async function getAllPayoutsFromShopify(maxPayouts?: number) {
  try {
    const allPayouts: any[] = []
    let pageInfo: string | null = null
    let totalFetched = 0
    const limit = 250 // Shopify's max per request
    
    console.log('🔄 Starting paginated payout fetch...')
    
    while (true) {
      // Build URL with pagination
      let url = `${SHOPIFY_BASE_URL}/shopify_payments/payouts.json?limit=${limit}`
      
      if (pageInfo) {
        url += `&page_info=${pageInfo}`
      }
      
      console.log(`📄 Fetching payout page ${Math.floor(totalFetched / limit) + 1}... (${totalFetched} payouts fetched so far)`)
      
      const response = await fetch(url, { headers })
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      const payouts = data.payouts || []
      
      if (payouts.length === 0) {
        console.log('✅ No more payouts to fetch')
        break
      }
      
      allPayouts.push(...payouts)
      totalFetched += payouts.length
      
      console.log(`📦 Fetched ${payouts.length} payouts (total: ${totalFetched})`)
      
      // Check if we've hit the max limit
      if (maxPayouts && totalFetched >= maxPayouts) {
        console.log(`🛑 Reached max limit of ${maxPayouts} payouts`)
        break
      }
      
      // Check for next page using Link header
      const linkHeader = response.headers.get('Link')
      if (linkHeader) {
        const nextPageMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextPageMatch) {
          const nextUrl = new URL(nextPageMatch[1])
          pageInfo = nextUrl.searchParams.get('page_info')
        } else {
          console.log('✅ No more pages available')
          break
        }
      } else {
        console.log('✅ No Link header found, assuming last page')
        break
      }
      
      // Add a small delay to be respectful to Shopify's API
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`🎉 Successfully fetched ${allPayouts.length} payouts total`)
    return allPayouts
    
  } catch (error) {
    console.error('Error fetching all payouts from Shopify:', error)
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

export async function getOrdersFromShopify(limit: number = 250) {
  try {
    const response = await fetch(`${SHOPIFY_BASE_URL}/orders.json?limit=${limit}&fields=id,name,financial_status,fulfillment_status,total_price,currency,created_at,payment_gateway_names,shipping_lines`, {
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

export async function getAllOrdersFromShopify(maxOrders?: number) {
  try {
    const allOrders: any[] = []
    let pageInfo: string | null = null
    let totalFetched = 0
    const limit = 250 // Shopify's max per request
    
    console.log('🔄 Starting paginated order fetch...')
    
    while (true) {
      // Build URL with pagination
      let url = `${SHOPIFY_BASE_URL}/orders.json?limit=${limit}&fields=id,name,financial_status,fulfillment_status,total_price,currency,created_at,payment_gateway_names,shipping_lines`
      
      if (pageInfo) {
        url += `&page_info=${pageInfo}`
      }
      
      console.log(`📄 Fetching page ${Math.floor(totalFetched / limit) + 1}... (${totalFetched} orders fetched so far)`)
      
      const response = await fetch(url, { headers })
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      const orders = data.orders || []
      
      if (orders.length === 0) {
        console.log('✅ No more orders to fetch')
        break
      }
      
      allOrders.push(...orders)
      totalFetched += orders.length
      
      console.log(`📦 Fetched ${orders.length} orders (total: ${totalFetched})`)
      
      // Check if we've hit the max limit
      if (maxOrders && totalFetched >= maxOrders) {
        console.log(`🛑 Reached max limit of ${maxOrders} orders`)
        break
      }
      
      // Check for next page using Link header
      const linkHeader = response.headers.get('Link')
      if (linkHeader) {
        const nextPageMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextPageMatch) {
          const nextUrl = new URL(nextPageMatch[1])
          pageInfo = nextUrl.searchParams.get('page_info')
        } else {
          console.log('✅ No more pages available')
          break
        }
      } else {
        console.log('✅ No Link header found, assuming last page')
        break
      }
      
      // Add a small delay to be respectful to Shopify's API
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`🎉 Successfully fetched ${allOrders.length} orders total`)
    return allOrders
    
  } catch (error) {
    console.error('Error fetching all orders from Shopify:', error)
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
