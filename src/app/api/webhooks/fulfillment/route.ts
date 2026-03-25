import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getShopifyStore, shopifyGraphQLThrottled } from '@/lib/product-sync/shopify-graphql'
import { logWebhook } from '@/lib/webhook-logger'

function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.NETSUITE_WEBHOOK_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

interface FulfillmentLine {
  sku: string
  netsuiteItemId?: string
  quantityShipped: number
}

interface FulfillmentPayload {
  netsuiteIfId: string
  netsuiteIfTranId?: string
  netsuiteSoId: string
  shopifyOrderId: string
  trackingNumbers: string[]
  carrier: string | null
  shippedDate: string | null
  lines: FulfillmentLine[]
}

interface WebhookPayload {
  fulfillments: FulfillmentPayload[]
  timestamp?: string
  dry_run?: boolean
}

const FULFILLMENT_ORDER_QUERY = `
  query GetFulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            assignedLocation {
              location {
                id
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  remainingQuantity
                  totalQuantity
                  lineItem {
                    sku
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

const FULFILLMENT_CREATE_MUTATION = `
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        trackingInfo {
          number
          company
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.fulfillments || !Array.isArray(payload.fulfillments)) {
    return NextResponse.json({ error: 'fulfillments array is required' }, { status: 400 })
  }

  const startTime = Date.now()
  const dryRun = payload.dry_run === true
  console.info(`[webhook:fulfillment] Received ${payload.fulfillments.length} fulfillments${dryRun ? ' (DRY RUN)' : ''}`)

  const storeConfig = await prisma.productSyncStoreConfig.findFirst({
    where: { isActive: true },
  })

  if (!storeConfig) {
    return NextResponse.json({ error: 'No active store configured' }, { status: 404 })
  }

  const store = await getShopifyStore(storeConfig.id)
  const results: Array<{ netsuiteIfId: string; success: boolean; error?: string; shopifyFulfillmentId?: string; dryRun?: boolean; matchedLines?: number }> = []

  for (const ful of payload.fulfillments) {
    try {
      if (!ful.shopifyOrderId) {
        results.push({ netsuiteIfId: ful.netsuiteIfId, success: false, error: 'Missing shopifyOrderId' })
        continue
      }

      const shopifyGid = ful.shopifyOrderId.startsWith('gid://')
        ? ful.shopifyOrderId
        : `gid://shopify/Order/${ful.shopifyOrderId}`

      const orderResult = await shopifyGraphQLThrottled<any>(store, FULFILLMENT_ORDER_QUERY, {
        orderId: shopifyGid,
      })

      if (orderResult.errors?.length) {
        results.push({
          netsuiteIfId: ful.netsuiteIfId,
          success: false,
          error: `Shopify order query failed: ${orderResult.errors[0].message}`,
        })
        continue
      }

      const fulfillmentOrders = orderResult.data?.order?.fulfillmentOrders?.edges || []
      const openFOs = fulfillmentOrders
        .map((e: any) => e.node)
        .filter((fo: any) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS')

      if (openFOs.length === 0) {
        results.push({
          netsuiteIfId: ful.netsuiteIfId,
          success: false,
          error: 'No open fulfillment orders found (order may already be fulfilled)',
        })
        continue
      }

      const skuToQty = new Map<string, number>()
      for (const line of ful.lines) {
        skuToQty.set(line.sku, (skuToQty.get(line.sku) || 0) + line.quantityShipped)
      }

      let fulfilled = false

      for (const fo of openFOs) {
        const lineItemsToFulfill: Array<{ id: string; quantity: number }> = []
        const foLineItems = fo.lineItems?.edges?.map((e: any) => e.node) || []

        for (const foLine of foLineItems) {
          const lineSku = foLine.lineItem?.sku
          if (!lineSku) continue

          const requested = skuToQty.get(lineSku)
          if (requested && requested > 0 && foLine.remainingQuantity > 0) {
            const qtyToFulfill = Math.min(requested, foLine.remainingQuantity)
            lineItemsToFulfill.push({
              id: foLine.id,
              quantity: qtyToFulfill,
            })
            skuToQty.set(lineSku, requested - qtyToFulfill)
          }
        }

        if (lineItemsToFulfill.length === 0) continue

        if (dryRun) {
          results.push({
            netsuiteIfId: ful.netsuiteIfId,
            success: true,
            dryRun: true,
            matchedLines: lineItemsToFulfill.length,
            shopifyFulfillmentId: '(dry run - not created)',
          })
          fulfilled = true
          break
        }

        const trackingInfo = ful.trackingNumbers.length > 0
          ? { number: ful.trackingNumbers[0], company: ful.carrier || undefined }
          : undefined

        const fulfillmentInput: Record<string, any> = {
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: fo.id,
              fulfillmentOrderLineItems: lineItemsToFulfill,
            },
          ],
          notifyCustomer: false,
        }

        if (trackingInfo) {
          fulfillmentInput.trackingInfo = trackingInfo
        }

        const createResult = await shopifyGraphQLThrottled<any>(store, FULFILLMENT_CREATE_MUTATION, {
          fulfillment: fulfillmentInput,
        })

        const userErrors = createResult.data?.fulfillmentCreateV2?.userErrors || []
        if (userErrors.length > 0) {
          results.push({
            netsuiteIfId: ful.netsuiteIfId,
            success: false,
            error: userErrors.map((e: any) => `${e.field}: ${e.message}`).join('; '),
          })
          continue
        }

        if (createResult.errors?.length) {
          results.push({
            netsuiteIfId: ful.netsuiteIfId,
            success: false,
            error: createResult.errors.map((e: any) => e.message).join('; '),
          })
          continue
        }

        const shopifyFulId = createResult.data?.fulfillmentCreateV2?.fulfillment?.id
        fulfilled = true

        try {
          await prisma.$executeRaw`
            INSERT INTO "Fulfillment" ("shopifyOrderId", "netsuiteSoId", "netsuiteIfId", "shopifyFulfillmentId", "trackingNumber", "carrier", "shippedDate", "lineItems", "status", "createdAt", "updatedAt")
            VALUES (${ful.shopifyOrderId}, ${ful.netsuiteSoId}, ${ful.netsuiteIfId}, ${shopifyFulId || null}, ${ful.trackingNumbers.join(',') || null}, ${ful.carrier || null}, ${ful.shippedDate ? new Date(ful.shippedDate) : null}, ${JSON.stringify(ful.lines)}::jsonb, 'synced', NOW(), NOW())
            ON CONFLICT ("netsuiteIfId") DO UPDATE SET
              "shopifyFulfillmentId" = EXCLUDED."shopifyFulfillmentId",
              "trackingNumber" = EXCLUDED."trackingNumber",
              "status" = 'synced',
              "updatedAt" = NOW()
          `
        } catch (dbErr: any) {
          console.warn(`[webhook:fulfillment] DB save warning for IF ${ful.netsuiteIfId}: ${dbErr.message}`)
        }

        results.push({
          netsuiteIfId: ful.netsuiteIfId,
          success: true,
          shopifyFulfillmentId: shopifyFulId,
        })

        break
      }

      if (!fulfilled && !results.find(r => r.netsuiteIfId === ful.netsuiteIfId)) {
        results.push({
          netsuiteIfId: ful.netsuiteIfId,
          success: false,
          error: 'Could not match fulfillment lines to any open fulfillment order',
        })
      }

      if (!dryRun) {
        try {
          await prisma.orderLine.updateMany({
            where: { shopifyOrderId: ful.shopifyOrderId },
            data: { fulfillmentStatus: 'fulfilled' },
          })
        } catch {
          // OrderLine may not exist for this order
        }
      }
    } catch (err: any) {
      console.error(`[webhook:fulfillment] Error processing IF ${ful.netsuiteIfId}:`, err.message)
      results.push({
        netsuiteIfId: ful.netsuiteIfId,
        success: false,
        error: err.message,
      })
    }
  }

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.info(`[webhook:fulfillment] Done${dryRun ? ' (DRY RUN)' : ''}. ${succeeded} succeeded, ${failed} failed`)

  const responseBody = { results, succeeded, failed, dryRun }

  await logWebhook({
    endpoint: '/api/webhooks/fulfillment',
    requestPayload: payload,
    responsePayload: responseBody,
    responseStatus: 200,
    durationMs: Date.now() - startTime,
    source: request.headers.get('user-agent') || 'unknown',
    itemCount: payload.fulfillments.length,
    summary: `${succeeded} succeeded, ${failed} failed${dryRun ? ' (dry run)' : ''}`,
  })

  return NextResponse.json(responseBody, { status: 200 })
}
