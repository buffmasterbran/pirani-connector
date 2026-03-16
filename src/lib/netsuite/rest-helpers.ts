import { buildRecordUrl } from './constants'
import { generateOAuthHeader } from './oauth'
import { executeSuiteQL } from './suiteql'

/**
 * DELETE a NetSuite record.
 */
export async function deleteRecord(
  recordType: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${buildRecordUrl(recordType)}/${id}`
  const authorization = generateOAuthHeader('DELETE', url)

  console.log(`🗑️ DELETE ${recordType}/${id}`)

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
    })

    const responseText = await response.text()
    console.log(`🗑️ DELETE response: ${response.status} ${responseText?.substring(0, 300)}`)

    if (!response.ok) {
      return { success: false, error: `DELETE failed ${response.status}: ${responseText}` }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * GET a NetSuite record by type and ID.
 */
export async function getRecord(
  recordType: string,
  id: string,
  expandSubResources?: string[]
): Promise<{ success: boolean; data?: any; error?: string }> {
  let url = `${buildRecordUrl(recordType)}/${id}`
  if (expandSubResources && expandSubResources.length > 0) {
    url += `?expandSubResources=${expandSubResources.join(',')}`
  }
  const authorization = generateOAuthHeader('GET', url)

  console.log(`📖 GET ${recordType}/${id}`)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
      },
    })

    const responseText = await response.text()

    if (!response.ok) {
      return { success: false, error: `GET failed ${response.status}: ${responseText}` }
    }

    try {
      const data = JSON.parse(responseText)
      return { success: true, data }
    } catch {
      return { success: true, data: responseText }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * PATCH (update) a NetSuite record.
 */
export async function patchRecord(
  recordType: string,
  id: string,
  body: object
): Promise<{ success: boolean; data?: any; error?: string }> {
  const url = `${buildRecordUrl(recordType)}/${id}`
  const authorization = generateOAuthHeader('PATCH', url)

  console.log(`✏️ PATCH ${recordType}/${id}`)

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const responseText = await response.text()
    console.log(`✏️ PATCH response: ${response.status} ${responseText?.substring(0, 300)}`)

    if (!response.ok) {
      return { success: false, error: `PATCH failed ${response.status}: ${responseText}` }
    }

    try {
      const data = JSON.parse(responseText)
      return { success: true, data }
    } catch {
      return { success: true }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * POST to create a new NetSuite record.
 * Returns the created record ID extracted from the Location header.
 */
export async function createRecord(
  recordType: string,
  body: object
): Promise<{ success: boolean; id?: string; tranId?: string; error?: string }> {
  const url = buildRecordUrl(recordType)
  const authorization = generateOAuthHeader('POST', url)

  console.log(`➕ POST ${recordType}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const location = response.headers.get('Location') || response.headers.get('location')
    const responseText = await response.text()

    console.log(`➕ POST response: ${response.status}, Location: ${location}`)
    console.log(`➕ Body: ${responseText?.substring(0, 500)}`)

    if (!response.ok) {
      return { success: false, error: `POST failed ${response.status}: ${responseText}` }
    }

    let id: string | undefined
    let tranId: string | undefined

    // Extract ID from Location header: /recordType/{id}
    if (location) {
      const match = location.match(/\/(\d+)(?:\?|$)/)
      if (match) id = match[1]
    }

    // Try response body
    if (responseText) {
      try {
        const data = JSON.parse(responseText)
        if (data.id) id = String(data.id)
        if (data.tranId || data.tranid) tranId = data.tranId || data.tranid
      } catch {
        // 204 No Content
      }
    }

    // Look up tranId via SuiteQL if we only got the ID
    if (id && !tranId) {
      try {
        const result = await executeSuiteQL<{ tranid: string }>(
          `SELECT tranid FROM transaction WHERE id = ${id}`
        )
        if (result.items?.length > 0) tranId = result.items[0].tranid
      } catch {
        // Non-critical
      }
    }

    return { success: true, id, tranId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Transform one record type into another (e.g., Sales Order → Invoice).
 * Uses the NS REST API sub-resource pattern: POST /sourceType/{id}/!transform/targetType
 */
export async function transformRecord(
  sourceType: string,
  sourceId: string,
  targetType: string,
  bodyOverrides?: object
): Promise<{ success: boolean; id?: string; tranId?: string; error?: string }> {
  const url = `${buildRecordUrl(sourceType)}/${sourceId}/!transform/${targetType}`
  const authorization = generateOAuthHeader('POST', url)

  console.log(`🔄 TRANSFORM ${sourceType}/${sourceId} → ${targetType}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyOverrides || {}),
    })

    const location = response.headers.get('Location') || response.headers.get('location')
    const responseText = await response.text()

    console.log(`🔄 TRANSFORM response: ${response.status}, Location: ${location}`)
    console.log(`🔄 Body: ${responseText?.substring(0, 500)}`)

    if (!response.ok) {
      return { success: false, error: `Transform failed ${response.status}: ${responseText}` }
    }

    let id: string | undefined
    let tranId: string | undefined

    // Extract ID from Location header
    if (location) {
      const match = location.match(/\/(\d+)(?:\?|$)/)
      if (match) id = match[1]
    }

    if (responseText) {
      try {
        const data = JSON.parse(responseText)
        if (data.id) id = String(data.id)
        if (data.tranId || data.tranid) tranId = data.tranId || data.tranid
      } catch {
        // 204 No Content
      }
    }

    // Look up tranId if missing
    if (id && !tranId) {
      try {
        const result = await executeSuiteQL<{ tranid: string }>(
          `SELECT tranid FROM transaction WHERE id = ${id}`
        )
        if (result.items?.length > 0) tranId = result.items[0].tranid
      } catch {
        // Non-critical
      }
    }

    return { success: true, id, tranId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
