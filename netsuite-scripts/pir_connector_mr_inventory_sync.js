/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Inventory & Price Sync (Map/Reduce)
 *
 * Fetches its configuration from the webapp at runtime, then pulls all
 * flagged items with current quantity and price from NetSuite and POSTs
 * them back to the webapp webhook. The webapp diffs against last-pushed
 * values and only updates Shopify when something changed.
 *
 * SCRIPT PARAMETERS (only 2 needed):
 *   custscript_pir_webapp_url   — Base URL of the Pirani Connector webapp
 *                                  (e.g., "https://pirani-connector-mpdh.vercel.app")
 *   custscript_pir_auth_token   — Shared auth token for webapp API calls
 */
define(['N/search', 'N/https', 'N/runtime', 'N/log'], (search, https, runtime, log) => {

  const BATCH_SIZE = 100

  function getScriptParams() {
    const script = runtime.getCurrentScript()
    return {
      webappUrl: script.getParameter({ name: 'custscript_pir_webapp_url' }),
      authToken: script.getParameter({ name: 'custscript_pir_auth_token' }),
    }
  }

  /**
   * Fetch sync configuration from the webapp API.
   * Returns { flagFieldId, priceLevelId, locationIds, webhookUrl, storeId, fieldMappings }
   */
  function fetchConfig(webappUrl, authToken) {
    const configUrl = webappUrl.replace(/\/+$/, '') + '/api/sync-config'

    log.audit('PiraniInventorySync', `Fetching config from ${configUrl}`)

    const response = https.get({
      url: configUrl,
      headers: {
        'Authorization': 'Bearer ' + (authToken || ''),
        'Accept': 'application/json',
      },
    })

    if (response.code !== 200) {
      log.error('PiraniInventorySync', `Config fetch failed: HTTP ${response.code} — ${response.body?.substring(0, 500)}`)
      return null
    }

    try {
      const config = JSON.parse(response.body)
      log.audit('PiraniInventorySync', `Config loaded: flag=${config.flagFieldId}, priceLevel=${config.priceLevelId}, locations=${config.locationIds}, storeId=${config.storeId}`)
      return config
    } catch (e) {
      log.error('PiraniInventorySync', `Failed to parse config response: ${e.message}`)
      return null
    }
  }

  /**
   * getInputData — Fetch config from webapp, then build and return a saved search.
   */
  function getInputData() {
    const { webappUrl, authToken } = getScriptParams()

    if (!webappUrl) {
      log.error('PiraniInventorySync', 'Missing custscript_pir_webapp_url parameter')
      return []
    }

    const config = fetchConfig(webappUrl, authToken)
    if (!config || !config.flagFieldId) {
      log.error('PiraniInventorySync', 'Could not load config or missing flagFieldId')
      return []
    }

    log.audit('PiraniInventorySync', `Starting inventory sync for store "${config.storeId}"`)

    const filters = [
      [config.flagFieldId, 'is', '1'],
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

    if (config.locationIds) {
      const locIds = String(config.locationIds).split(',').map(id => id.trim()).filter(Boolean)
      if (locIds.length > 0) {
        filters.push('AND')
        filters.push(['inventorylocation', 'anyof', ...locIds])
      }
    }

    if (config.priceLevelId) {
      columns.push(
        search.createColumn({
          name: 'unitprice',
          join: 'pricing',
          summary: search.Summary.MAX,
        })
      )
      filters.push('AND')
      filters.push(['pricing.pricelevel', 'is', parseInt(config.priceLevelId, 10)])
    }

    return search.create({
      type: search.Type.ITEM,
      filters: filters,
      columns: columns,
    })
  }

  /**
   * map — Extract item data from each search result.
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
    const priceVal = values['MAX(unitprice.pricing)']
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
   * reduce — Deduplicate by SKU (safety net).
   */
  function reduce(context) {
    context.write({ key: context.key, value: context.values[0] })
  }

  /**
   * summarize — Collect all items, re-fetch config, and POST to webapp webhook.
   */
  function summarize(context) {
    const { webappUrl, authToken } = getScriptParams()

    if (!webappUrl) {
      log.error('PiraniInventorySync', 'Missing custscript_pir_webapp_url — cannot push')
      return
    }

    const config = fetchConfig(webappUrl, authToken)
    if (!config) {
      log.error('PiraniInventorySync', 'Could not load config in summarize — cannot push')
      return
    }

    const webhookUrl = config.webhookUrl
    if (!webhookUrl) {
      log.error('PiraniInventorySync', 'No webhookUrl in config — cannot push')
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

    let batchNum = 0
    let totalPushed = 0
    let totalErrors = 0

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      batchNum++
      const batch = allItems.slice(i, i + BATCH_SIZE)

      const payload = {
        storeId: config.storeId || 'default',
        items: batch,
        timestamp: new Date().toISOString(),
      }

      try {
        const response = https.post({
          url: webhookUrl,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (authToken || ''),
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

      const remaining = runtime.getCurrentScript().getRemainingUsage()
      if (remaining < 200) {
        log.audit('PiraniInventorySync', `Low governance (${remaining} remaining) — stopping after batch ${batchNum}`)
        break
      }
    }

    log.audit('PiraniInventorySync', `Done. ${totalPushed} pushed, ${totalErrors} errors, ${batchNum} batches`)

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
