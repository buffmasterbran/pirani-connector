/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Pirani Tech — Sales Order Total Validation
 *
 * beforeSubmit: Compares NetSuite's calculated total against the
 * Shopify order total stored in custbody_pirtech_order_total.
 * If they don't match (within tolerance), blocks the save.
 *
 * CUSTOM FIELDS REQUIRED ON SALES ORDER:
 *   custbody_pirtech_order_total   — Free-Form Text — JSON with Shopify totals
 *   custbody_pirtech_storefront    — Free-Form Text — Source storefront name
 *   custbody_pirtech_order_num     — Free-Form Text — Storefront order number
 *
 * DEPLOYMENT:
 *   Script ID:     customscript_pirtech_ue_validate_order
 *   Deployment ID: customdeploy_pirtech_ue_validate_order
 *   Applied To:    Sales Order
 *   Execute As:    Administrator
 *   Event Type:    beforeSubmit
 *   Status:        Released
 */
define(['N/log'], (log) => {

  // Maximum allowed difference between Shopify and NetSuite totals
  const TOLERANCE = 0

  /**
   * beforeSubmit — runs after NetSuite has calculated all line items,
   * taxes, shipping, and discounts, but before the record commits.
   */
  function beforeSubmit(context) {
    // Only validate on create — edits within NetSuite are intentional
    if (context.type !== context.UserEventType.CREATE) {
      return
    }

    const record = context.newRecord
    const orderTotalJson = record.getValue({ fieldId: 'custbody_pirtech_order_total' })

    // No pirtech data = not our order (manual entry, other integration, etc.)
    if (!orderTotalJson) {
      log.debug('PirTech Validate', 'No custbody_pirtech_order_total — skipping validation')
      return
    }

    let shopifyTotals
    try {
      shopifyTotals = JSON.parse(orderTotalJson)
    } catch (e) {
      log.error('PirTech Validate', `Could not parse order total JSON: ${orderTotalJson}`)
      return
    }

    const shopifyTotal = parseFloat(shopifyTotals.orderTotal) || 0

    // Get NetSuite's calculated total
    const netsuiteTotal = parseFloat(record.getValue({ fieldId: 'total' })) || 0

    const delta = Math.abs(netsuiteTotal - shopifyTotal)

    // Log the comparison for audit trail
    const storefront = record.getValue({ fieldId: 'custbody_pirtech_storefront' }) || 'Unknown'
    const orderNum = record.getValue({ fieldId: 'custbody_pirtech_order_num' }) || 'N/A'

    log.audit('PirTech Validate', [
      `Order: ${orderNum} (${storefront})`,
      `Shopify Total: $${shopifyTotal.toFixed(2)}`,
      `NetSuite Total: $${netsuiteTotal.toFixed(2)}`,
      `Delta: $${delta.toFixed(2)}`,
      `Breakdown: subtotal=$${shopifyTotals.subtotal || 0}, ` +
        `tax=$${shopifyTotals.taxTotal || 0}, ` +
        `shipping=$${shopifyTotals.shippingCost || 0}, ` +
        `discount=$${shopifyTotals.discountTotal || 0}`,
    ].join(' | '))

    if (delta > TOLERANCE) {
      log.error('PirTech Validate', `BLOCKED: Total mismatch exceeds $${TOLERANCE} tolerance`)

      throw new Error(
        `Pirani Tech: Order total mismatch for ${orderNum}. ` +
        `Shopify total: $${shopifyTotal.toFixed(2)}, ` +
        `NetSuite calculated: $${netsuiteTotal.toFixed(2)}, ` +
        `Difference: $${delta.toFixed(2)}. ` +
        `Check item prices, tax, shipping, and discounts.`
      )
    }

    log.audit('PirTech Validate', `PASSED — totals match within $${TOLERANCE} tolerance`)
  }

  return {
    beforeSubmit: beforeSubmit,
  }
})
