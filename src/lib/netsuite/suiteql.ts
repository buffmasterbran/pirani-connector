import { buildSuiteQLUrl } from './constants'
import { generateOAuthHeader } from './oauth'
import type { NetSuiteSuiteQLResponse } from './types'

/**
 * Executes a SuiteQL query against the NetSuite API.
 * Low-level — use fetchNetSuiteList() for dropdown data.
 */
export async function executeSuiteQL<T = any>(
  query: string,
  limit: number = 1000,
  offset: number = 0
): Promise<NetSuiteSuiteQLResponse<T>> {
  const url = `${buildSuiteQLUrl()}?limit=${limit}&offset=${offset}`
  const authorization = generateOAuthHeader('POST', url)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'transient',
      Authorization: authorization,
      Accept: '*/*',
    },
    body: JSON.stringify({ q: query }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`NetSuite SuiteQL API error ${response.status}: ${errorText}`)
  }

  return (await response.json()) as NetSuiteSuiteQLResponse<T>
}

/**
 * Fetches a NetSuite list using SuiteQL.
 * Used for populating dropdowns (classes, locations, partners, etc.)
 */
export async function fetchNetSuiteList(
  queryName: string,
  query: string
): Promise<Array<{ id: string; name: string; [key: string]: any }>> {
  try {
    const data = await executeSuiteQL(query)

    if (data.items && data.items.length > 0) {
      return data.items
        .filter((item: any) => item.isinactive !== 'T' && item.isinactive !== true)
        .map((item: any) => {
          let displayName = ''
          if (item.altname) {
            displayName = item.altname
          } else if (item.acctname) {
            displayName = item.acctname
          } else {
            displayName = item.name || item.entityid || item.companyname || item.symbol || item.pluralname || item.ScriptID || ''
          }

          return {
            id: String(item.id),
            name: displayName,
            ...item,
          }
        })
    }

    return []
  } catch (error) {
    console.error(`Error querying NetSuite list ${queryName}:`, error)
    throw error
  }
}
