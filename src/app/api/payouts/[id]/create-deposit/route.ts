import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOAuthHeader } from '@/lib/netsuite'

const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID || '7913744'
const NETSUITE_API_URL = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/record/v1/deposit`

interface NetSuiteDepositRequest {
  account: { id: string }
  trandate: string // ISO 8601 format
  memo: string
  payment: {
    items: Array<{ deposit: boolean; id: number }>
  }
  other?: {
    items: Array<{
      description: string
      amount: number
      account: { id: string }
    }>
  }
}

interface NetSuiteDepositResponse {
  id: string
  links?: Array<{
    rel: string
    href: string
  }>
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payoutId = params.id

    // Get payout with all transactions first
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        transactions: {
          orderBy: {
            processedAt: 'asc',
          },
        },
      },
    })

    if (!payout) {
      return NextResponse.json(
        { success: false, error: 'Payout not found' },
        { status: 404 }
      )
    }

    if (payout.netsuiteDepositId) {
      return NextResponse.json({
        success: true,
        message: 'Deposit already created',
        depositId: payout.netsuiteDepositId,
      })
    }

    // Get ALL transactions with NetSuite IDs (both charges and refunds)
    const transactionsWithNS = payout.transactions.filter(
      (txn) => txn.netsuiteTransactionId && txn.netsuiteTransactionId.trim() !== ''
    )

    if (transactionsWithNS.length === 0) {
      const totalTransactions = payout.transactions.length
      return NextResponse.json(
        {
          success: false,
          error: `No transactions with NetSuite IDs found. Found ${totalTransactions} total transaction(s). Please fetch NetSuite transaction IDs first using "Get Missing NS Transactions" button.`,
        },
        { status: 400 }
      )
    }

    // Calculate total fees (negative amount for "other" items)
    const totalFees = payout.transactions.reduce((sum, txn) => {
      return sum + (txn.fee || 0)
    }, 0)

    // Prepare deposit request
    const payoutDate = payout.payoutDate || new Date()
    
    // Get ALL NetSuite transaction IDs (both charges and refunds) - convert string to number
    // All transactions go into payment.items with deposit: true
    const depositItems = transactionsWithNS
      .map((txn) => {
        const nsId = txn.netsuiteTransactionId
        if (!nsId) return null
        const idNum = parseInt(nsId, 10)
        if (isNaN(idNum)) {
          console.warn(`Invalid NetSuite transaction ID: ${nsId} for transaction ${txn.id}`)
          return null
        }
        // All transactions (charges and refunds) are included as deposit items
        return { deposit: true, id: idNum }
      })
      .filter((item): item is { deposit: true; id: number } => item !== null)
      // Remove duplicates (in case same NetSuite transaction ID appears multiple times)
      .filter((item, index, self) => 
        index === self.findIndex((t) => t.id === item.id)
      )

    if (depositItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid NetSuite transaction IDs found',
        },
        { status: 400 }
      )
    }

    const depositRequest: NetSuiteDepositRequest = {
      account: { id: '217' }, // Default account ID
      trandate: payoutDate.toISOString(),
      memo: `Shopify payout ${payoutId.slice(-8)}`,
      payment: {
        items: depositItems,
      },
    }

    // Add fees if there are any (always as negative value)
    if (totalFees !== 0) {
      depositRequest.other = {
        items: [
          {
            description: 'Shopify Fees',
            amount: totalFees < 0 ? totalFees : -Math.abs(totalFees), // Ensure negative
            account: { id: '989' }, // Fees account
          },
        ],
      }
    }

    // Generate OAuth header
    const authorization = generateOAuthHeader('POST', NETSUITE_API_URL)

    // Create deposit in NetSuite
    // Note: Removed 'Prefer: respond-async' to get immediate response with deposit ID
    const response = await fetch(NETSUITE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        Accept: 'application/json',
      },
      body: JSON.stringify(depositRequest),
    })

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
      } catch (e) {
        errorText = `Failed to read error response: ${e instanceof Error ? e.message : 'Unknown error'}`
      }
      console.error('NetSuite deposit creation error:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      })
      return NextResponse.json(
        {
          success: false,
          error: `NetSuite API error ${response.status}: ${errorText || response.statusText}`,
        },
        { status: 500 }
      )
    }

    // Read response body once
    const responseText = await response.text()
    const location = response.headers.get('Location')
    
    // Log the response for debugging
    console.log('📋 NetSuite API Response:', {
      status: response.status,
      statusText: response.statusText,
      location,
      responseBody: responseText,
      headers: Object.fromEntries(response.headers.entries()),
    })
    
    // Try to parse response body first (works for both 200 and 202)
    let depositData: NetSuiteDepositResponse | null = null
    if (responseText && responseText.trim() !== '') {
      try {
        depositData = JSON.parse(responseText) as NetSuiteDepositResponse
        console.log('📋 Parsed NetSuite response data:', depositData)
      } catch (parseError) {
        console.warn('Failed to parse NetSuite response body:', parseError, 'Raw text:', responseText)
      }
    }
    
    // Extract deposit ID from response body (preferred) or Location header
    let depositId: string | null = null
    
    if (depositData?.id) {
      // Got deposit ID from response body
      depositId = depositData.id
      console.log('✅ Found deposit ID in response body:', depositId)
    } else if (depositData?.links && depositData.links.length > 0) {
      // Check links array for deposit ID
      const depositLink = depositData.links.find(link => 
        link.href && link.href.includes('deposit') && link.href.includes('id=')
      )
      if (depositLink) {
        const idMatch = depositLink.href.match(/id=(\d+)/)
        if (idMatch) {
          depositId = idMatch[1]
          console.log('✅ Found deposit ID in links array:', depositId)
        }
      }
    }
    
    if (!depositId && location) {
      // Try to extract from Location header
      // NetSuite can return deposit ID in different formats:
      // 1. REST API format: /services/rest/record/v1/deposit/1405135
      // 2. UI format: deposit.nl?id=1405135
      const restApiMatch = location.match(/\/deposit\/(\d+)/)
      const uiMatch = location.match(/deposit\.nl\?id=(\d+)/)
      
      if (restApiMatch) {
        depositId = restApiMatch[1]
        console.log('✅ Found deposit ID in Location header (REST API format):', depositId)
      } else if (uiMatch) {
        depositId = uiMatch[1]
        console.log('✅ Found deposit ID in Location header (UI format):', depositId)
      } else {
        // It's a job URL, try to extract job ID and note that we'll need to poll
        const jobMatch = location.match(/job\/(\d+)/)
        if (jobMatch) {
          console.warn('⚠️ NetSuite returned async job URL. Deposit ID will be available after job completes.')
          // For now, we can't get the deposit ID immediately from a job URL
          // In the future, we could poll the job endpoint, but for now return success
          // The user will need to manually check NetSuite or we can add polling later
        }
      }
    }
    
    // Handle 204 No Content response - deposit created successfully, ID in Location header
    if (response.status === 204) {
      if (depositId) {
        // We got the deposit ID from Location header, store it
        await prisma.payout.update({
          where: { id: payoutId },
          data: {
            netsuiteDepositId: depositId,
          },
        })
        
        return NextResponse.json({
          success: true,
          message: 'Deposit created successfully',
          depositId,
          depositUrl: `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositId}`,
        })
      } else {
        // 204 but no deposit ID found - this shouldn't happen, but handle gracefully
        console.warn('⚠️ NetSuite returned 204 but no deposit ID found in Location header')
        return NextResponse.json({
          success: true,
          message: 'Deposit creation completed (204), but deposit ID not found in Location header.',
          depositId: null,
          location: location || undefined,
        })
      }
    }
    
    // Handle async response (202 Accepted) - even without deposit ID, mark as success
    if (response.status === 202) {
      if (depositId) {
        // We got the deposit ID, store it
        await prisma.payout.update({
          where: { id: payoutId },
          data: {
            netsuiteDepositId: depositId,
          },
        })
        
        return NextResponse.json({
          success: true,
          message: 'Deposit created successfully (async)',
          depositId,
          depositUrl: `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositId}`,
          async: true,
        })
      } else {
        // Async response but no deposit ID yet - NetSuite is processing
        // Return success but note that deposit ID is pending
        return NextResponse.json({
          success: true,
          message: 'Deposit creation initiated (async). Please check NetSuite for the deposit ID.',
          depositId: null,
          async: true,
          location: location || undefined,
        })
      }
    }

    // Handle immediate response (200 OK)
    if (!depositData || !depositData.id) {
      console.error('❌ NetSuite did not return a deposit ID. Response:', {
        status: response.status,
        responseText,
        depositData,
        location,
      })
      return NextResponse.json(
        {
          success: false,
          error: 'NetSuite did not return a deposit ID in the response',
          details: {
            status: response.status,
            responseBody: responseText,
            parsedData: depositData,
            location,
          },
        },
        { status: 500 }
      )
    }

    // Update payout with NetSuite deposit ID
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        netsuiteDepositId: depositData.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Deposit created successfully',
      depositId: depositData.id,
      depositUrl: `https://${NETSUITE_ACCOUNT_ID}.app.netsuite.com/app/accounting/transactions/deposit.nl?id=${depositData.id}`,
    })
  } catch (error) {
    console.error('❌ Error creating NetSuite deposit:', error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create NetSuite deposit',
      },
      { status: 500 }
    )
  }
}

