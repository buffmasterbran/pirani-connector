import { getShopifyCredentials, shopifyFetch, shopifyFetchWithHeaders } from './shared'

export async function fetchShopifyPayouts(limit = 50) {
  const creds = await getShopifyCredentials()
  if (!creds) return { payouts: [] }
  const query = new URLSearchParams({ limit: String(limit) })
  const data = await shopifyFetch<{ payouts: any[] }>(`/shopify_payments/payouts.json?${query.toString()}`)
  return { payouts: data.payouts ?? [] }
}

export async function fetchShopifyPayoutTransactions(payoutId: string) {
  const creds = await getShopifyCredentials()
  if (!creds) return { transactions: [] }

  // Fetch all transactions with pagination using Shopify's Link header
  // Handles large payouts (5000+ transactions) by paginating through all pages
  const allTransactions: any[] = []
  let nextUrl: string | null = null
  let hasNextPage = true
  let pageCount = 0
  const maxPages = 100 // Safety limit: 100 pages * 250 = 25,000 transactions max

  while (hasNextPage && pageCount < maxPages) {
    pageCount++
    const url: string = nextUrl || `/shopify_payments/balance/transactions.json?payout_id=${payoutId}&limit=250`

    try {
      const { data, headers }: { data: { transactions: any[] }; headers: Headers } = await shopifyFetchWithHeaders<{ transactions: any[] }>(url)
      const transactions = data.transactions ?? []
      allTransactions.push(...transactions)

      // Log progress for large imports
      if (pageCount % 5 === 0 || transactions.length < 250) {
        console.log(`Fetched page ${pageCount}: ${allTransactions.length} transactions so far...`)
      }

      // Parse Link header to get next page URL
      const linkHeader: string | null = headers.get('link')
      if (linkHeader) {
        // Parse Link header: <url>; rel="next" (can be full URL or relative)
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
        if (nextMatch) {
          let extractedUrl: string = nextMatch[1]
          // Handle both full URLs and relative paths
          if (extractedUrl.startsWith('http')) {
            // Full URL - extract just the path part
            try {
              const urlObj = new URL(extractedUrl)
              extractedUrl = urlObj.pathname + urlObj.search
              // Remove the base API path if present
              extractedUrl = extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
            } catch (e) {
              // If URL parsing fails, try to extract path manually
              const pathMatch = extractedUrl.match(/\/admin\/api\/[^/]+(\/.*)/)
              extractedUrl = pathMatch ? pathMatch[1] : extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
            }
          }
          nextUrl = extractedUrl
          hasNextPage = true
        } else {
          hasNextPage = false
        }
      } else {
        // If no Link header, we're done (got less than limit)
        hasNextPage = false
      }
    } catch (error) {
      console.error(`Error fetching transactions page ${pageCount}:`, error)
      // If we have some transactions, return what we have rather than failing completely
      if (allTransactions.length > 0) {
        console.warn(`Returning ${allTransactions.length} transactions despite error on page ${pageCount}`)
        break
      }
      throw error
    }
  }

  if (pageCount >= maxPages) {
    console.warn(`Reached maximum page limit (${maxPages}). There may be more transactions.`)
  }

  console.log(`Fetched ${allTransactions.length} transactions for payout ${payoutId} (${pageCount} pages)`)
  return { transactions: allTransactions }
}

export async function fetchShopifyPayoutTransactionsPage(
  payoutId: string,
  cursor?: string,
): Promise<{ transactions: any[]; nextCursor: string | null }> {
  const creds = await getShopifyCredentials()
  if (!creds) return { transactions: [], nextCursor: null }

  const url = cursor || `/shopify_payments/balance/transactions.json?payout_id=${payoutId}&limit=250`

  const { data, headers } = await shopifyFetchWithHeaders<{ transactions: any[] }>(url)
  const transactions = data.transactions ?? []

  let nextCursor: string | null = null
  const linkHeader = headers.get('link')
  if (linkHeader) {
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    if (nextMatch) {
      let extractedUrl = nextMatch[1]
      if (extractedUrl.startsWith('http')) {
        try {
          const urlObj = new URL(extractedUrl)
          extractedUrl = urlObj.pathname + urlObj.search
          extractedUrl = extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
        } catch {
          const pathMatch = extractedUrl.match(/\/admin\/api\/[^/]+(\/.*)/)
          extractedUrl = pathMatch ? pathMatch[1] : extractedUrl.replace(/^\/admin\/api\/[^/]+/, '')
        }
      }
      nextCursor = extractedUrl
    }
  }

  return { transactions, nextCursor }
}
