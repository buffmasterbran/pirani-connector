/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Inventory & Price Sync (Map/Reduce)
 *
 * Runs on a schedule. Pulls all flagged items with current quantity and price,
 * then POSTs them to the Pirani Connector webapp. The webapp diffs against
 * last-pushed values and only updates Shopify when something changed.
 *
 * DEPLOYMENT:
 *   1. Upload to File Cabinet > SuiteScripts > PiraniConnector
 *   2. Create Script: Customization > Scripting > Scripts > New
 *      - Type: Map/Reduce, Script File: this file
 *   3. Deploy:
 *      - Status = Released
 *      - Schedule: every 15 min (or as desired)
 *
 * SCRIPT PARAMETERS (set on Script record):
 *   custscript_pir_inv_flag_field    — Custom item field ID (e.g., "custitem_fa_shopify_flag01")
 *   custscript_pir_inv_price_level   — Price level internal ID (e.g., 5)
 *   custscript_pir_inv_location_ids  — Comma-separated location IDs (optional)
 *   custscript_pir_inv_webapp_url    — Webapp webhook URL (e.g., "https://pirani-connector.vercel.app/api/webhooks/inventory-update")
 *   custscript_pir_inv_webhook_secret — Shared secret for auth
 *   custscript_pir_inv_store_id      — Store identifier (e.g., "dtc")
 */
define(['N/search', 'N/https', 'N/runtime', 'N/log'], (search, https, runtime, log) => {

  const BATCH_SIZE = 100

  function getParams() {
    const script = runtime.getCurrentScript()
    return {
      flagFieldId: script.getParameter({ name: 'custscript_pir_inv_flag_field' }),
      priceLevelId: script.getParameter({ name: 'custscript_pir_inv_price_level' }),
      locationIds: script.getParameter({ name: 'custscript_pir_inv_location_ids' }),
      webappUrl: script.getParameter({ name: 'custscript_pir_inv_webapp_url' }),
      webhookSecret: script.getParameter({ name: 'custscript_pir_inv_webhook_secret' }),
      storeId: script.getParameter({ name: 'custscript_pir_inv_store_id' }) || 'default',
    }
  }

  /**
   * getInputData — Saved search for all flagged items.
   * Returns a search object that NetSuite pages through automatically.
   */
  function getInputData() {
    const params = getParams()
    const flagFieldId = params.flagFieldId
    if (!flagFieldId) {
      log.error('PiraniInventorySync', 'Missing custscript_pir_inv_flag_field parameter')
      return []
    }

    log.audit('PiraniInventorySync', `Starting inventory sync: flag=${flagFieldId}, priceLevel=${params.priceLevelId}, locations=${params.locationIds}`)

    const filters = [
      [flagFieldId, 'is', '1'],
      'AND',
      ['isinactive', 'is', 'F'],
      'AND',
      ['type', 'anyof', 'InvtPart', 'Kit', 'NonInvtPart'],
    ]

    const columns = [
      search.createColumn({ name: 'itemid', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'displayname', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'type', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'locationquantityavailable', summary: search.Summary.SUM }),
      search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM }),
    ]

    if (params.locationIds) {
      const locIds = params.locationIds.split(',').map(id => id.trim())
      filters.push('AND')
      filters.push(['inventorylocation', 'anyof', ...locIds])
    }

    if (params.priceLevelId) {
      columns.push(
        search.createColumn({
          name: 'unitprice',
          join: 'pricing',
          summary: search.Summary.GROUP,
        })
      )
      filters.push('AND')
      filters.push(['pricing.pricelevel', 'is', parseInt(params.priceLevelId, 10)])
      filters.push('AND')
      filters.push(['pricing.quantity', 'is', '1'])
    }

    return search.create({
      type: search.Type.ITEM,
      filters: filters,
      columns: columns,
    })
  }

  /**
   * map — Extract item data from each search result.
   * Emits {key: sku, value: itemPayload} for the reduce stage.
   */
  function map(context) {
    const result = JSON.parse(context.value)
    const values = result.values

    const sku = values['GROUP(itemid)']
    const name = values['GROUP(displayname)']
    const itemType = values['GROUP(type)']?.value || values['GROUP(type)']
    const internalId = values['GROUP(internalid)']?.value || values['GROUP(internalid)']
    const qtyAvailable = parseFloat(values['SUM(locationquantityavailable)']) || 0
    const qtyOnHand = parseFloat(values['SUM(locationquantityonhand)']) || 0

    let price = null
    const priceVal = values['GROUP(unitprice.pricing)']
    if (priceVal !== undefined && priceVal !== null && priceVal !== '') {
      price = parseFloat(priceVal)
    }

    const item = {
      netsuiteId: parseInt(internalId, 10),
      sku: sku,
      name: name || null,
      itemType: itemType || null,
      quantity: Math.max(0, qtyAvailable),
      quantityOnHand: qtyOnHand,
      price: price,
    }

    context.write({ key: sku, value: JSON.stringify(item) })
  }

  /**
   * reduce — Deduplicate by SKU (shouldn't happen, but safety net).
   * Passes through the item data unchanged.
   */
  function reduce(context) {
    // Take the first value per SKU
    context.write({ key: context.key, value: context.values[0] })
  }

  /**
   * summarize — Batch all items and POST to webapp.
   */
  function summarize(context) {
    const params = getParams()

    if (!params.webappUrl) {
      log.error('PiraniInventorySync', 'Missing custscript_pir_inv_webapp_url — cannot push to webapp')
      return
    }

    const allItems = []

    context.output.iterator().each((key, value) => {
      try {
        allItems.push(JSON.parse(value))
      } catch (e) {
        log.error('PiraniInventorySync', `Failed to parse item ${key}: ${e.message}`)
      }
      return true
    })

    log.audit('PiraniInventorySync', `Collected ${allItems.length} items to push`)

    if (allItems.length === 0) {
      log.audit('PiraniInventorySync', 'No items to push — done')
      return
    }

    // POST in batches
    let batchNum = 0
    let totalPushed = 0
    let totalErrors = 0

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      batchNum++
      const batch = allItems.slice(i, i + BATCH_SIZE)

      const payload = {
        storeId: params.storeId,
        items: batch,
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
          totalPushed += batch.length
          log.audit('PiraniInventorySync', `Batch ${batchNum}: pushed ${batch.length} items (HTTP ${response.code})`)
        } else {
          totalErrors += batch.length
          log.error('PiraniInventorySync', `Batch ${batchNum}: HTTP ${response.code} — ${response.body?.substring(0, 500)}`)
        }
      } catch (e) {
        totalErrors += batch.length
        log.error('PiraniInventorySync', `Batch ${batchNum}: network error — ${e.message}`)
      }

      // Check remaining governance
      const remaining = runtime.getCurrentScript().getRemainingUsage()
      if (remaining < 200) {
        log.audit('PiraniInventorySync', `Low governance (${remaining} remaining) — stopping after batch ${batchNum}`)
        break
      }
    }

    log.audit('PiraniInventorySync', `Done. ${totalPushed} pushed, ${totalErrors} errors, ${batchNum} batches`)

    // Log any M/R errors
    if (context.inputSummary.error) {
      log.error('PiraniInventorySync:input', context.inputSummary.error)
    }
    context.mapSummary.errors.iterator().each((key, error) => {
      log.error('PiraniInventorySync:map', `Key=${key}, Error=${error}`)
      return true
    })
    context.reduceSummary.errors.iterator().each((key, error) => {
      log.error('PiraniInventorySync:reduce', `Key=${key}, Error=${error}`)
      return true
    })
  }

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize,
  }
})
