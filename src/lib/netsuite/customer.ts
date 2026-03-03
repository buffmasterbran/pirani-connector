import { executeSuiteQL } from './suiteql'
import type { NetSuiteCustomer } from './types'

/**
 * Queries NetSuite SuiteQL API to find a customer by email
 */
export async function findNetSuiteCustomerByEmail(email: string): Promise<NetSuiteCustomer | null> {
  if (!email || !email.trim()) {
    return null
  }

  const escapedEmail = email.replace(/'/g, "''")
  const query = `SELECT id, email, custentity_customer_category FROM customer WHERE email = '${escapedEmail}'`

  try {
    const data = await executeSuiteQL<NetSuiteCustomer>(query)
    if (data.items && data.items.length > 0) {
      return data.items[0]
    }
    return null
  } catch (error) {
    console.error('Error querying NetSuite customer by email:', error)
    throw error
  }
}
