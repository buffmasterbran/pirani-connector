/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Pirani Connector — Product Sync RESTlet
 *
 * Returns all flagged items with price and quantity in a single call.
 * Kit/Package items get their calculated quantityAvailable automatically
 * from NetSuite's search engine (no manual component math needed).
 *
 * DEPLOYMENT:
 *   1. Upload this file to File Cabinet > SuiteScripts > PiraniConnector
 *   2. Create Script: Customization > Scripting > Scripts > New
 *      - Type: RESTlet, Script File: this file
 *   3. Deploy: set Status = Released, Audience = All Roles (or specific)
 *      - Note the External URL — that's what the app calls
 *
 * REQUEST (GET query params or POST JSON body):
 *   flagFieldId    — e.g. "custitem_fa_shopify_flag01" (required)
 *   priceLevelId   — e.g. "5" (optional, returns prices at this level)
 *   locationIds    — e.g. "1,4,7" (optional, filters inventory to these locations)
 *   since          — ISO timestamp, e.g. "2026-02-25T00:00:00Z" (optional, only changed items)
 *
 * RESPONSE:
 *   { items: [ { sku, name, itemType, price, quantityAvailable, ... } ], count: N }
 */
define(['N/search', 'N/runtime', 'N/log'], (search, runtime, log) => {

  function processRequest(params) {
    const flagFieldId = params.flagFieldId
    if (!flagFieldId) {
      return { error: 'flagFieldId is required' }
    }

    const priceLevelId = params.priceLevelId ? parseInt(params.priceLevelId, 10) : null
    const locationIds = params.locationIds
      ? params.locationIds.split(',').map(id => id.trim())
      : []
    const since = params.since || null

    log.audit('PiraniSync', `Pull request: flag=${flagFieldId}, priceLevel=${priceLevelId}, locations=[${locationIds}], since=${since}`)

    const filters = [
      [flagFieldId, 'is', '1'],
      'AND',
      ['isinactive', 'is', 'F'],
    ]

    if (since) {
      filters.push('AND')
      filters.push(['lastmodifieddate', 'onorafter', since])
    }

    // Item types we care about: Inventory, Kit/Package, Non-inventory (optional)
    filters.push('AND')
    filters.push(['type', 'anyof', 'InvtPart', 'Kit', 'NonInvtPart'])

    const columns = [
      search.createColumn({ name: 'itemid', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'displayname', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'type', summary: search.Summary.GROUP }),
      search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }),
      search.createColumn({ name: flagFieldId, summary: search.Summary.GROUP }),
      search.createColumn({ name: 'locationquantityavailable', summary: search.Summary.SUM }),
      search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM }),
    ]

    // If specific locations requested, add location filter and group by location
    if (locationIds.length > 0) {
      filters.push('AND')
      filters.push(['inventorylocation', 'anyof', ...locationIds])
    }

    // Price column: use pricing join if price level specified
    if (priceLevelId) {
      columns.push(
        search.createColumn({
          name: 'unitprice',
          join: 'pricing',
          summary: search.Summary.GROUP,
        })
      )
      filters.push('AND')
      filters.push(['pricing.pricelevel', 'is', priceLevelId])
      // Only base quantity (qty break = 1)
      filters.push('AND')
      filters.push(['pricing.quantity', 'is', '1'])
    }

    // Add custom fields we commonly need
    try {
      columns.push(search.createColumn({ name: 'custitem_item_color', summary: search.Summary.GROUP }))
      columns.push(search.createColumn({ name: 'custitem_item_size', summary: search.Summary.GROUP }))
    } catch (e) {
      // Fields may not exist in every account — that's fine
    }

    const itemSearch = search.create({
      type: search.Type.ITEM,
      filters: filters,
      columns: columns,
    })

    const items = []
    const pagedData = itemSearch.runPaged({ pageSize: 1000 })

    pagedData.pageRanges.forEach(pageRange => {
      const page = pagedData.fetch({ index: pageRange.index })
      page.data.forEach(result => {
        const sku = result.getValue({ name: 'itemid', summary: search.Summary.GROUP })
        const name = result.getValue({ name: 'displayname', summary: search.Summary.GROUP })
        const itemType = result.getValue({ name: 'type', summary: search.Summary.GROUP })
        const internalId = result.getValue({ name: 'internalid', summary: search.Summary.GROUP })
        const flagValue = result.getValue({ name: flagFieldId, summary: search.Summary.GROUP })
        const qtyAvailable = parseFloat(result.getValue({ name: 'locationquantityavailable', summary: search.Summary.SUM })) || 0
        const qtyOnHand = parseFloat(result.getValue({ name: 'locationquantityonhand', summary: search.Summary.SUM })) || 0

        const item = {
          netsuite_id: parseInt(internalId, 10),
          sku: sku,
          name: name || null,
          item_type: itemType || null,
          flag_value: String(flagValue),
          quantity_available: Math.max(0, qtyAvailable),
          quantity_on_hand: qtyOnHand,
        }

        if (priceLevelId) {
          const price = result.getValue({ name: 'unitprice', join: 'pricing', summary: search.Summary.GROUP })
          item.price = price ? parseFloat(price) : null
        }

        try {
          item.color = result.getText({ name: 'custitem_item_color', summary: search.Summary.GROUP }) || null
          item.size = result.getText({ name: 'custitem_item_size', summary: search.Summary.GROUP }) || null
        } catch (e) {
          // Ignore if fields don't exist
        }

        items.push(item)
      })
    })

    log.audit('PiraniSync', `Returning ${items.length} items`)

    return {
      items: items,
      count: items.length,
      timestamp: new Date().toISOString(),
    }
  }

  return {
    get: (params) => processRequest(params),
    post: (body) => processRequest(body),
  }
})
