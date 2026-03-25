import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'inventory'

  try {
    if (type === 'inventory') {
      const storeConfig = await prisma.productSyncStoreConfig.findFirst({
        where: { isActive: true },
      })

      const items = await prisma.productSyncMapping.findMany({
        where: storeConfig ? { storeConfigId: storeConfig.id } : undefined,
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          netsuiteItemId: true,
          netsuiteSku: true,
          netsuiteName: true,
          netsuiteItemType: true,
          netsuiteCurrentQty: true,
          netsuiteCurrentPrice: true,
        },
      })

      const payload = {
        storeId: storeConfig?.id || 'default',
        items: items.map(i => ({
          netsuiteId: i.netsuiteItemId,
          sku: i.netsuiteSku,
          name: i.netsuiteName,
          itemType: i.netsuiteItemType,
          quantity: i.netsuiteCurrentQty ?? 0,
          price: i.netsuiteCurrentPrice ? Number(i.netsuiteCurrentPrice) : null,
        })),
        timestamp: new Date().toISOString(),
      }

      return NextResponse.json({
        payload,
        endpoint: '/api/webhooks/inventory-update',
        method: 'POST',
        description: 'Simulates what the Map/Reduce inventory sync script sends. Uses real SKUs from your database.',
        itemCount: items.length,
      })
    }

    if (type === 'fulfillment') {
      const recentOrder = await prisma.orderLine.findFirst({
        where: {
          netsuiteSalesOrderId: { not: null },
          fulfillmentStatus: { not: 'fulfilled' },
        },
        orderBy: { orderCreatedAt: 'desc' },
        select: {
          shopifyOrderId: true,
          shopifyOrderName: true,
          netsuiteSalesOrderId: true,
          lineItemSku: true,
          lineItemQuantity: true,
        },
      })

      const payload = {
        fulfillments: [
          {
            netsuiteIfId: 'TEST-IF-' + Date.now(),
            netsuiteIfTranId: 'IF-TEST-001',
            netsuiteSoId: recentOrder?.netsuiteSalesOrderId || 'SO-12345',
            shopifyOrderId: recentOrder?.shopifyOrderId || '0000000000000',
            trackingNumbers: ['TEST-TRACKING-001'],
            carrier: 'UPS',
            shippedDate: new Date().toISOString().split('T')[0],
            lines: [
              {
                sku: recentOrder?.lineItemSku || 'SAMPLE-SKU',
                quantityShipped: recentOrder?.lineItemQuantity || 1,
              },
            ],
          },
        ],
        timestamp: new Date().toISOString(),
      }

      return NextResponse.json({
        payload,
        endpoint: '/api/webhooks/fulfillment',
        method: 'POST',
        description: 'Simulates what the Scheduled Script fulfillment push sends. Uses a real order from your database.',
        warning: 'WARNING: Without dry_run=true, this will create a REAL fulfillment in Shopify!',
        orderName: recentOrder?.shopifyOrderName || '(no order found)',
      })
    }

    if (type === 'restlet') {
      const storeConfig = await prisma.productSyncStoreConfig.findFirst({
        where: { isActive: true },
        select: { netsuiteFlagFieldId: true, netsuitePriceLevelId: true },
      })

      return NextResponse.json({
        description: 'The RESTlet is deployed in NetSuite. Configure the URL below and test the connection.',
        params: {
          flagFieldId: storeConfig?.netsuiteFlagFieldId || 'custitem_fa_shopify_flag01',
          priceLevelId: storeConfig?.netsuitePriceLevelId || 5,
          locationIds: '',
          since: '',
        },
        sampleUrl: 'https://<ACCOUNT_ID>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=<SCRIPT_ID>&deploy=<DEPLOY_ID>',
        note: 'Replace <ACCOUNT_ID>, <SCRIPT_ID>, and <DEPLOY_ID> with your NetSuite deployment values.',
      })
    }

    return NextResponse.json({ error: 'Unknown type. Use: inventory, fulfillment, or restlet' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
