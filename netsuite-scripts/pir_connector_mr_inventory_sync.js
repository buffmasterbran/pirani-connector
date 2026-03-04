/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Inventory & Price Sync (Map/Reduce)
 *
 * Fetches configuration (including field mappings) from the webapp,
 * runs two searches — InvtPart and Kit — with location-aware filters,
 * then POSTs results to the webapp webhook for DB-only ingest.
 *
 * SCRIPT PARAMETERS (only 2 needed):
 *   custscript_pir_webapp_url   — Base URL of the Pirani Connector webapp
 *   custscript_pir_auth_token   — Shared auth token for webapp API calls
 */
define(['N/search', 'N/https', 'N/runtime', 'N/log'], (search, https, runtime, log) => {

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
      log.audit('PiraniInventorySync', `Config loaded: flag=${config.flagFieldId}, priceLevel=${config.priceLevelId}, locations=${config.locationIds}, storeId=${config.storeId}, fieldMappings=${(config.fieldMappings || []).length}`)
      return config
    } catch (e) {
      log.error('PiraniInventorySync', `Failed to parse config response: ${e.message}`)
      return null
    }
  }

  /**
   * Build extra columns + column key map from fieldMappings config.
   * Only includes item_field mappings with a netsuiteFieldId.
   */
  function buildExtraColumns(fieldMappings) {
    const extraColumns = []
    const columnKeyMap = {} // { shopifyField: 'GROUP(fieldId)' }

    if (!fieldMappings || !Array.isArray(fieldMappings)) return { extraColumns, columnKeyMap }

    for (const fm of fieldMappings) {
      if (fm.mappingType !== 'item_field' || !fm.netsuiteFieldId) continue
      // Skip fields already handled as core columns
      if (['itemid', 'displayname', 'type', 'internalid'].includes(fm.netsuiteFieldId)) continue

      try {
        extraColumns.push(
          search.createColumn({ name: fm.netsuiteFieldId, summary: search.Summary.GROUP })
        )
        columnKeyMap[fm.shopifyField] = `GROUP(${fm.netsuiteFieldId})`
      } catch (e) {
        log.debug('PiraniInventorySync', `Skipping unsupported field ${fm.netsuiteFieldId}: ${e.message}`)
      }
    }

    return { extraColumns, columnKeyMap }
  }

  // Store config + extra column keys in module scope so map() can access them
  let _config = null
  let _columnKeyMap = {}

  /**
   * getInputData — Two searches: InvtPart (by inventorylocation) + Kit (by memberitem.inventorylocation)
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

    _config = config

    const locIds = config.locationIds
      ? String(config.locationIds).split(',').map(id => id.trim()).filter(Boolean)
      : []

    const { extraColumns, columnKeyMap } = buildExtraColumns(config.fieldMappings)
    _columnKeyMap = columnKeyMap

    log.audit('PiraniInventorySync', `Extra field columns: ${extraColumns.length} (${Object.keys(columnKeyMap).join(', ')})`)

    // ── Core columns (shared by both searches) ──
    const coreColumns = [
      search.createColumn({ name: 'itemid', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'displayname', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'type', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }),
    ]

    // ── Price column ──
    const priceColumns = []
    const priceFilters = []
    if (config.priceLevelId) {
      priceColumns.push(
        search.createColumn({ name: 'unitprice', join: 'pricing', summary: search.Summary.MAX })
      )
      priceFilters.push('AND')
      priceFilters.push(['pricing.pricelevel', 'anyof', parseInt(config.priceLevelId, 10)])
    }

    // ── Search 1: InvtPart + NonInvtPart ──
    const invtFilters = [
      [config.flagFieldId, 'is', '1'],
      'AND',
      ['isinactive', 'is', 'F'],
      'AND',
      ['type', 'anyof', 'InvtPart', 'NonInvtPart'],
    ]

    if (locIds.length > 0) {
      invtFilters.push('AND')
      invtFilters.push(['inventorylocation', 'anyof', ...locIds])
    }

    invtFilters.push(...priceFilters)

    const invtColumns = [
      ...coreColumns,
      search.createColumn({ name: 'locationquantityavailable', summary: search.Summary.SUM }),
      search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM }),
      ...priceColumns,
      ...extraColumns,
    ]

    // ── Search 2: Kit items (location via member item) ──
    const kitFilters = [
      [config.flagFieldId, 'is', '1'],
      'AND',
      ['isinactive', 'is', 'F'],
      'AND',
      ['type', 'anyof', 'Kit'],
    ]

    if (locIds.length > 0) {
      kitFilters.push('AND')
      kitFilters.push(['memberitem.inventorylocation', 'anyof', ...locIds])
    }

    kitFilters.push(...priceFilters)

    const kitColumns = [
      ...coreColumns,
      search.createColumn({ name: 'memberitem', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'locationquantityavailable', join: 'memberItem', summary: search.Summary.SUM }),
      ...priceColumns,
      ...extraColumns,
    ]

    // ── Run both searches and combine results ──
    // IMPORTANT: Module-scope variables (_columnKeyMap) do NOT survive between
    // M/R phases. We embed columnKeyMap in each result row so map() can access it.
    const allResults = []

    try {
      log.audit('PiraniInventorySync', `Running InvtPart search — filters: ${JSON.stringify(invtFilters)}`)
      const invtSearch = search.create({ type: search.Type.ITEM, filters: invtFilters, columns: invtColumns })
      let invtCount = 0
      invtSearch.run().each(result => {
        allResults.push({ type: 'invtpart', id: result.id, values: result.toJSON().values, columnKeyMap: columnKeyMap })
        invtCount++
        return true
      })
      log.audit('PiraniInventorySync', `InvtPart search returned ${invtCount} results`)
    } catch (e) {
      log.error('PiraniInventorySync', `InvtPart search FAILED: ${e.message}`)
    }

    try {
      log.audit('PiraniInventorySync', `Running Kit search — filters: ${JSON.stringify(kitFilters)}`)
      const kitSearch = search.create({ type: search.Type.ITEM, filters: kitFilters, columns: kitColumns })
      let kitCount = 0
      kitSearch.run().each(result => {
        allResults.push({ type: 'kit', id: result.id, values: result.toJSON().values, columnKeyMap: columnKeyMap })
        kitCount++
        return true
      })
      log.audit('PiraniInventorySync', `Kit search returned ${kitCount} results`)
    } catch (e) {
      log.error('PiraniInventorySync', `Kit search FAILED: ${e.message}`)
    }

    log.audit('PiraniInventorySync', `Combined: ${allResults.length} total results`)
    return allResults
  }

  /**
   * map — Extract item data from each search result.
   * InvtPart: qty directly from locationquantityavailable.
   * Kit: component rows grouped in reduce to calculate min(available/required).
   */
  let mapLogCount = 0

  function map(context) {
    const result = JSON.parse(context.value)
    const values = result.values
    const resultType = result.type // 'invtpart' or 'kit'
    // columnKeyMap is embedded in each result row (module-scope vars don't survive between M/R phases)
    const columnKeyMap = result.columnKeyMap || _columnKeyMap || {}

    if (mapLogCount < 5) {
      log.audit('PiraniInventorySync:map', `type=${resultType}, columnKeyMap=${JSON.stringify(columnKeyMap)}, keys=${JSON.stringify(Object.keys(values))}`)
      mapLogCount++
    }

    const sku = values['GROUP(itemid)']
    const name = values['GROUP(displayname)']
    const itemType = values['GROUP(type)']?.value || values['GROUP(type)']
    const internalId = values['GROUP(internalid)']?.value || values['GROUP(internalid)'] || result.id

    let price = null
    const priceVal = values['MAX(unitprice.pricing)']
      ?? values['MAX(unitprice)']
      ?? values['MAX(pricing.unitprice)']
    if (priceVal !== undefined && priceVal !== null && priceVal !== '') {
      price = parseFloat(priceVal)
      if (isNaN(price)) price = null
    }

    // Extract extra fields from config-driven column keys
    const extraFields = {}
    for (const [shopifyField, columnKey] of Object.entries(columnKeyMap)) {
      const val = values[columnKey]
      if (val !== undefined && val !== null && val !== '') {
        extraFields[shopifyField] = typeof val === 'object' ? (val.text || val.value || val) : val
      }
    }

    if (resultType === 'kit') {
      // Kit: each row is a component — write component data keyed by SKU
      const memberItem = values['GROUP(memberitem)']
      const memberName = typeof memberItem === 'object' ? (memberItem.text || memberItem.value) : memberItem
      const componentQty = parseFloat(values['SUM(locationquantityavailable.memberItem)']
        || values['SUM(locationquantityavailable)']) || 0

      const kitComponent = {
        netsuiteId: parseInt(internalId, 10),
        sku: sku,
        name: name || null,
        itemType: 'Kit',
        price: price,
        isKitComponent: true,
        componentName: memberName,
        componentAvailable: componentQty,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
      }

      context.write({ key: sku, value: JSON.stringify(kitComponent) })
    } else {
      // InvtPart / NonInvtPart: qty is direct
      const qtyAvailable = parseFloat(values['SUM(locationquantityavailable)']) || 0
      const qtyOnHand = parseFloat(values['SUM(locationquantityonhand)']) || 0

      const item = {
        netsuiteId: parseInt(internalId, 10),
        sku: sku,
        name: name || null,
        itemType: itemType || null,
        quantity: Math.max(0, qtyAvailable),
        quantityOnHand: qtyOnHand,
        price: price,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
      }

      context.write({ key: sku, value: JSON.stringify(item) })
    }
  }

  /**
   * reduce — For InvtPart, dedup. For Kit, calculate min(component_available).
   * All component rows for a kit share the same SKU key.
   */
  function reduce(context) {
    const items = context.values.map(v => JSON.parse(v))

    // Check if these are kit component rows
    if (items[0] && items[0].isKitComponent) {
      // Calculate kit qty: min of all component available quantities
      // Each row is one component; kit can build = min(componentAvailable) across all
      const kitQty = Math.max(0, Math.min(...items.map(c => Math.max(0, c.componentAvailable))))
      const first = items[0]

      const kitItem = {
        netsuiteId: first.netsuiteId,
        sku: first.sku,
        name: first.name,
        itemType: 'Kit',
        quantity: kitQty,
        quantityOnHand: kitQty,
        price: first.price,
        extraFields: first.extraFields,
      }

      context.write({ key: context.key, value: JSON.stringify(kitItem) })
    } else {
      // InvtPart — just take the first (should be one per SKU)
      context.write({ key: context.key, value: items[0] ? JSON.stringify(items[0]) : context.values[0] })
    }
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

    // Webhook now only writes to the database (no Shopify calls),
    // so we can send larger batches without hitting timeouts.
    const BATCH_SIZE = 4000
    let totalPushed = 0
    let totalErrors = 0
    const totalBatches = Math.ceil(allItems.length / BATCH_SIZE)

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

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
          log.audit('PiraniInventorySync', `Batch ${batchNum}/${totalBatches}: pushed ${batch.length} items (HTTP ${response.code})`)
        } else {
          totalErrors += batch.length
          log.error('PiraniInventorySync', `Batch ${batchNum}/${totalBatches} failed: HTTP ${response.code} — ${response.body?.substring(0, 500)}`)
        }
      } catch (e) {
        totalErrors += batch.length
        log.error('PiraniInventorySync', `Batch ${batchNum}/${totalBatches} network error: ${e.message}`)
      }
    }

    log.audit('PiraniInventorySync', `Done. ${totalPushed} pushed, ${totalErrors} errors`)

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
