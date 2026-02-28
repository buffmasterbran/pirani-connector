/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Fulfillment Push (Scheduled Script)
 *
 * Runs every 15 minutes. Finds Item Fulfillments that haven't been synced
 * to the Pirani Connector webapp, POSTs them in batches, and stamps a
 * custom field on each IF after successful push. Un-stamped IFs are
 * automatically retried on the next run (idempotent safety net).
 *
 * PREREQUISITES:
 *   - Custom body field on Item Fulfillment:
 *       custbody_pir_connector_synced  (Date field, "Pirani Connector Synced At")
 *     Set "Applies To" = Transaction (Item Fulfillment)
 *     Leave it hidden from UI if desired.
 *
 * DEPLOYMENT:
 *   1. Upload to File Cabinet > SuiteScripts > PiraniConnector
 *   2. Create Script: Customization > Scripting > Scripts > New
 *      - Type: Scheduled, Script File: this file
 *   3. Deploy:
 *      - Status = Released
 *      - Schedule: every 15 min (or as desired)
 *
 * SCRIPT PARAMETERS (set on Script record):
 *   custscript_pir_ful_webapp_url    — Webapp webhook URL (e.g., "https://pirani-connector.vercel.app/api/webhooks/fulfillment")
 *   custscript_pir_ful_webhook_secret — Shared secret for auth
 *   custscript_pir_ful_stamp_field   — Stamp field ID (default: "custbody_pir_connector_synced")
 *   custscript_pir_ful_shopify_so_field — SO field with Shopify order ID (default: "custbody_shopify_source_order_id")
 */
define(['N/search', 'N/record', 'N/https', 'N/runtime', 'N/log'], (search, record, https, runtime, log) => {

  const BATCH_SIZE = 50

  function getParams() {
    const script = runtime.getCurrentScript()
    return {
      webappUrl: script.getParameter({ name: 'custscript_pir_ful_webapp_url' }),
      webhookSecret: script.getParameter({ name: 'custscript_pir_ful_webhook_secret' }),
      stampField: script.getParameter({ name: 'custscript_pir_ful_stamp_field' }) || 'custbody_pir_connector_synced',
      shopifySoField: script.getParameter({ name: 'custscript_pir_ful_shopify_so_field' }) || 'custbody_shopify_source_order_id',
    }
  }

  /**
   * Find un-synced Item Fulfillments via saved search.
   * Joins to parent Sales Order to get the Shopify order ID.
   */
  function findUnsyncedFulfillments(params) {
    const fulfillments = []

    const ifSearch = search.create({
      type: search.Type.ITEM_FULFILLMENT,
      filters: [
        [params.stampField, 'isempty', ''],
        'AND',
        ['status', 'anyof', 'ItemShip:C'], // Shipped status
        'AND',
        ['mainline', 'is', 'F'],           // Line-level results for SKU + qty
      ],
      columns: [
        search.createColumn({ name: 'internalid', summary: null }),
        search.createColumn({ name: 'tranid', summary: null }),
        search.createColumn({ name: 'trandate', summary: null }),
        search.createColumn({ name: 'trackingnumbers', summary: null }),
        search.createColumn({ name: 'shipcarrier', summary: null }),
        search.createColumn({ name: 'shipmethod', summary: null }),
        search.createColumn({ name: 'item', summary: null }),
        search.createColumn({ name: 'quantity', summary: null }),
        // Joined columns from parent Sales Order
        search.createColumn({ name: 'internalid', join: 'createdFrom', summary: null }),
        search.createColumn({ name: params.shopifySoField, join: 'createdFrom', summary: null }),
      ],
    })

    const pagedData = ifSearch.runPaged({ pageSize: 1000 })

    pagedData.pageRanges.forEach(pageRange => {
      const page = pagedData.fetch({ index: pageRange.index })
      page.data.forEach(result => {
        const ifId = result.getValue({ name: 'internalid' })
        const ifTranId = result.getValue({ name: 'tranid' })
        const tranDate = result.getValue({ name: 'trandate' })
        const trackingNumbers = result.getValue({ name: 'trackingnumbers' })
        const shipCarrier = result.getText({ name: 'shipcarrier' })
        const shipMethod = result.getText({ name: 'shipmethod' })
        const itemId = result.getValue({ name: 'item' })
        const itemSku = result.getText({ name: 'item' })
        const quantity = parseFloat(result.getValue({ name: 'quantity' })) || 0
        const soId = result.getValue({ name: 'internalid', join: 'createdFrom' })
        const shopifyOrderId = result.getValue({ name: params.shopifySoField, join: 'createdFrom' })

        fulfillments.push({
          ifId: ifId,
          ifTranId: ifTranId,
          tranDate: tranDate,
          trackingNumbers: trackingNumbers ? trackingNumbers.split(/[,\n]/).map(t => t.trim()).filter(Boolean) : [],
          carrier: shipCarrier || shipMethod || null,
          soId: soId,
          shopifyOrderId: shopifyOrderId || null,
          itemSku: itemSku,
          netsuiteItemId: itemId,
          quantity: quantity,
        })
      })
    })

    return fulfillments
  }

  /**
   * Group line-level results into fulfillment-level payloads.
   * Multiple lines can belong to the same IF (partial shipments, multiple items).
   */
  function groupByFulfillment(lineResults) {
    const grouped = {}

    lineResults.forEach(line => {
      const key = line.ifId
      if (!grouped[key]) {
        grouped[key] = {
          netsuiteIfId: line.ifId,
          netsuiteIfTranId: line.ifTranId,
          netsuiteSoId: line.soId,
          shopifyOrderId: line.shopifyOrderId,
          trackingNumbers: line.trackingNumbers,
          carrier: line.carrier,
          shippedDate: line.tranDate,
          lines: [],
        }
      }
      grouped[key].lines.push({
        sku: line.itemSku,
        netsuiteItemId: line.netsuiteItemId,
        quantityShipped: line.quantity,
      })
    })

    return Object.values(grouped)
  }

  /**
   * Stamp the sync date on successfully pushed IFs.
   */
  function stampFulfillments(ifIds, stampField) {
    const now = new Date()
    let stamped = 0

    ifIds.forEach(ifId => {
      try {
        record.submitFields({
          type: record.Type.ITEM_FULFILLMENT,
          id: ifId,
          values: { [stampField]: now },
          options: { enableSourcing: false, ignoreMandatoryFields: true },
        })
        stamped++
      } catch (e) {
        log.error('PiraniFulfillmentPush', `Failed to stamp IF ${ifId}: ${e.message}`)
      }
    })

    return stamped
  }

  function execute(context) {
    const params = getParams()

    if (!params.webappUrl) {
      log.error('PiraniFulfillmentPush', 'Missing custscript_pir_ful_webapp_url — cannot push')
      return
    }

    log.audit('PiraniFulfillmentPush', 'Starting fulfillment push run')

    const lineResults = findUnsyncedFulfillments(params)
    log.audit('PiraniFulfillmentPush', `Found ${lineResults.length} un-synced fulfillment lines`)

    if (lineResults.length === 0) {
      log.audit('PiraniFulfillmentPush', 'Nothing to push — done')
      return
    }

    const fulfillments = groupByFulfillment(lineResults)
    log.audit('PiraniFulfillmentPush', `Grouped into ${fulfillments.length} fulfillments`)

    // Skip fulfillments missing Shopify order ID
    const pushable = fulfillments.filter(f => f.shopifyOrderId)
    const skipped = fulfillments.filter(f => !f.shopifyOrderId)

    if (skipped.length > 0) {
      log.audit('PiraniFulfillmentPush', `Skipping ${skipped.length} fulfillments with no Shopify order ID: ${skipped.map(f => f.netsuiteIfTranId).join(', ')}`)
    }

    let totalPushed = 0
    let totalErrors = 0
    let batchNum = 0

    for (let i = 0; i < pushable.length; i += BATCH_SIZE) {
      batchNum++
      const batch = pushable.slice(i, i + BATCH_SIZE)

      const payload = {
        fulfillments: batch,
        timestamp: new Date().toISOString(),
      }

      try {
        const response = https.post({
          url: params.webappUrl,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (params.webhookSecret || ''),
          },
          body: JSON.stringify(payload),
        })

        if (response.code === 200) {
          let responseBody = {}
          try {
            responseBody = JSON.parse(response.body)
          } catch (e) { /* ignore parse errors */ }

          // Determine which IFs succeeded — if webapp returns per-IF status, use it
          const succeededIds = []
          if (responseBody.results && Array.isArray(responseBody.results)) {
            responseBody.results.forEach(r => {
              if (r.success) succeededIds.push(r.netsuiteIfId)
            })
          } else {
            // Assume all succeeded if no per-item breakdown
            batch.forEach(f => succeededIds.push(f.netsuiteIfId))
          }

          const stamped = stampFulfillments(succeededIds, params.stampField)
          totalPushed += stamped
          log.audit('PiraniFulfillmentPush', `Batch ${batchNum}: ${batch.length} sent, ${stamped} stamped`)
        } else {
          totalErrors += batch.length
          log.error('PiraniFulfillmentPush', `Batch ${batchNum}: HTTP ${response.code} — ${(response.body || '').substring(0, 500)}`)
        }
      } catch (e) {
        totalErrors += batch.length
        log.error('PiraniFulfillmentPush', `Batch ${batchNum}: network error — ${e.message}`)
      }

      // Check remaining governance
      const remaining = runtime.getCurrentScript().getRemainingUsage()
      if (remaining < 500) {
        log.audit('PiraniFulfillmentPush', `Low governance (${remaining} remaining) — stopping after batch ${batchNum}. Remaining IFs will be picked up next run.`)
        break
      }
    }

    log.audit('PiraniFulfillmentPush', `Done. ${totalPushed} pushed, ${totalErrors} errors, ${skipped.length} skipped (no Shopify ID), ${batchNum} batches`)
  }

  return {
    execute: execute,
  }
})
