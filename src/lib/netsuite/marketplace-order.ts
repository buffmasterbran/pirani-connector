import { executeSuiteQL } from './suiteql'
import { deleteRecord, getRecord, patchRecord, transformRecord, createRecord } from './rest-helpers'
import { prisma } from '@/lib/prisma'

// --- Types ---

export interface OrderStateRecord {
  id: string
  tranid: string
  amount: number
  entity?: string
  entityId?: string
}

export interface MarketplaceOrderState {
  orderName: string
  invoice: OrderStateRecord | null
  cashSale: OrderStateRecord | null
  salesOrder: OrderStateRecord | null
  payments: OrderStateRecord[]
  customerId: string | null
}

export interface StepResult {
  step: string
  success: boolean
  detail?: string
  data?: any
  error?: string
}

// --- Step Functions ---

/**
 * Check what NS records exist for this order (SO, CS, Invoice, Payments).
 */
export async function checkOrderState(orderName: string): Promise<MarketplaceOrderState> {
  // Normalize: ensure it starts with #
  const ref = orderName.startsWith('#') ? orderName : `#${orderName}`

  const query = `
    SELECT
      Transaction.id,
      Transaction.tranid,
      Transaction.type,
      Transaction.foreigntotal,
      BUILTIN.DF(Transaction.entity) AS entityname,
      Transaction.entity
    FROM Transaction
    WHERE Transaction.otherrefnum = '${ref.replace(/'/g, "''")}'
      AND Transaction.type IN ('CustInvc', 'CashSale', 'SalesOrd', 'CustPymt')
    ORDER BY Transaction.type
  `

  const result = await executeSuiteQL<{
    id: string
    tranid: string
    type: string
    foreigntotal: string
    entityname: string
    entity: string
  }>(query)

  const state: MarketplaceOrderState = {
    orderName: ref,
    invoice: null,
    cashSale: null,
    salesOrder: null,
    payments: [],
    customerId: null,
  }

  for (const row of result.items || []) {
    const record: OrderStateRecord = {
      id: row.id,
      tranid: row.tranid,
      amount: Number(row.foreigntotal),
      entity: row.entityname,
      entityId: row.entity,
    }

    // Capture customer ID from any record
    if (row.entity && !state.customerId) {
      state.customerId = row.entity
    }

    switch (row.type) {
      case 'SalesOrd':
        state.salesOrder = record
        break
      case 'CashSale':
        state.cashSale = record
        break
      case 'CustInvc':
        state.invoice = record
        break
      case 'CustPymt':
        state.payments.push(record)
        break
    }
  }

  return state
}

/**
 * Delete a Cash Sale record from NetSuite.
 */
export async function deleteCashSale(cashSaleId: string): Promise<StepResult> {
  const result = await deleteRecord('cashSale', cashSaleId)
  return {
    step: 'delete-cash-sale',
    success: result.success,
    detail: result.success ? `Deleted Cash Sale ${cashSaleId}` : undefined,
    error: result.error,
  }
}

/**
 * Update a Sales Order for marketplace processing:
 * - Set non-taxable tax code
 * - Add marketplace tax line item (if tax > 0)
 * - Clear paymentoption
 */
export async function updateSOForMarketplace(soId: string, taxAmount?: number): Promise<StepResult> {
  // Fetch marketplace settings from MappingDefaults
  const settings = await prisma.mappingDefaults.findMany({
    where: { settingKey: { in: ['marketplace_nontaxable_taxcode', 'marketplace_tax_item'] } },
  })

  const taxCodeId = settings.find(s => s.settingKey === 'marketplace_nontaxable_taxcode')?.settingValue
  const taxItemId = settings.find(s => s.settingKey === 'marketplace_tax_item')?.settingValue

  if (!taxCodeId) {
    return {
      step: 'update-sales-order',
      success: false,
      error: 'No non-taxable tax code configured in Mappings. Go to Settings > Order Source Mappings and set the marketplace non-taxable tax code.',
    }
  }

  // Use the provided tax amount (from payout's Tax Adjustment sibling)
  // The NS SO's taxtotal is unreliable — FarApp may have pushed it as non-taxable (taxtotal=0)
  const taxTotal = taxAmount ?? 0

  // Build PATCH body
  const patchBody: any = {
    taxItem: { id: taxCodeId },
    paymentoption: null,
  }

  // Add marketplace tax line item if there's tax and we have the item configured
  if (taxTotal > 0 && taxItemId) {
    // Append to existing items. replaceAll: false to add without replacing.
    patchBody.item = {
      items: [{
        item: { id: taxItemId },
        quantity: 1,
        rate: taxTotal,
        amount: taxTotal,
        description: 'Marketplace Tax (collected by Shopify)',
      }],
      replaceAll: false,
    }
  }

  const result = await patchRecord('salesOrder', soId, patchBody)

  if (!result.success) {
    return {
      step: 'update-sales-order',
      success: false,
      error: result.error,
    }
  }

  const details = [`Set non-taxable tax code (${taxCodeId})`]
  if (taxTotal > 0 && taxItemId) {
    details.push(`Added marketplace tax line: $${taxTotal.toFixed(2)}`)
  } else if (taxTotal > 0 && !taxItemId) {
    details.push(`Warning: Order has $${taxTotal.toFixed(2)} tax but no Marketplace Tax Item configured`)
  } else if (taxTotal === 0) {
    details.push('No tax adjustment found')
  }
  details.push('Cleared paymentoption')

  return {
    step: 'update-sales-order',
    success: true,
    detail: details.join('. '),
    data: { taxTotal },
  }
}

/**
 * Transform a Sales Order into an Invoice.
 */
export async function createInvoiceFromSO(
  soId: string,
  tranDate: string
): Promise<StepResult> {
  const result = await transformRecord('salesOrder', soId, 'invoice', {
    trandate: tranDate,
    terms: { id: '4' }, // Prepaid
  })

  if (!result.success) {
    return {
      step: 'create-invoice',
      success: false,
      error: result.error,
    }
  }

  return {
    step: 'create-invoice',
    success: true,
    detail: `Created Invoice ${result.tranId || result.id} (terms: Prepaid)`,
    data: { invoiceId: result.id, invoiceName: result.tranId },
  }
}

/**
 * Create a Customer Payment applied to an Invoice.
 */
export async function createPaymentForInvoice(
  invoiceId: string,
  customerId: string,
  amount: number,
  currency: string,
  tranDate: string
): Promise<StepResult> {
  const body = {
    customer: { id: customerId },
    payment: amount,
    trandate: tranDate,
    apply: {
      items: [{
        doc: { id: invoiceId },
        apply: true,
        amount: amount,
      }],
    },
  }

  const result = await createRecord('customerPayment', body)

  if (!result.success) {
    return {
      step: 'create-payment',
      success: false,
      error: result.error,
    }
  }

  return {
    step: 'create-payment',
    success: true,
    detail: `Created Payment ${result.tranId || result.id} for $${amount.toFixed(2)}`,
    data: { paymentId: result.id, paymentName: result.tranId },
  }
}

/**
 * Run the full marketplace order processing workflow.
 * Returns results for each step attempted.
 */
export async function processMarketplaceOrder(
  orderName: string,
  paymentAmount: number,
  currency: string,
  tranDate: string,
  taxAmount?: number
): Promise<{ results: StepResult[]; finalState: MarketplaceOrderState }> {
  const results: StepResult[] = []

  // Step 1: Check current state
  const state = await checkOrderState(orderName)
  results.push({
    step: 'check',
    success: true,
    detail: [
      state.salesOrder ? `SO: ${state.salesOrder.tranid}` : 'No SO',
      state.cashSale ? `CS: ${state.cashSale.tranid}` : 'No CS',
      state.invoice ? `INV: ${state.invoice.tranid}` : 'No Invoice',
      `${state.payments.length} payment(s)`,
    ].join(', '),
    data: state,
  })

  let invoiceId = state.invoice?.id
  let customerId = state.customerId

  // If invoice already exists, skip to payment
  if (invoiceId) {
    results.push({ step: 'delete-cash-sale', success: true, detail: 'Skipped — invoice already exists' })
    results.push({ step: 'update-sales-order', success: true, detail: 'Skipped — invoice already exists' })
    results.push({ step: 'create-invoice', success: true, detail: 'Skipped — invoice already exists' })
  } else {
    // Need the full workflow
    if (!state.salesOrder) {
      results.push({ step: 'delete-cash-sale', success: false, error: 'No Sales Order found — cannot proceed' })
      return { results, finalState: state }
    }

    // Step 2: Delete Cash Sale (if exists)
    if (state.cashSale) {
      const deleteResult = await deleteCashSale(state.cashSale.id)
      results.push(deleteResult)
      if (!deleteResult.success) return { results, finalState: state }
    } else {
      results.push({ step: 'delete-cash-sale', success: true, detail: 'Skipped — no Cash Sale found' })
    }

    // Step 3: Update Sales Order (pass tax amount if provided)
    const updateResult = await updateSOForMarketplace(state.salesOrder.id, taxAmount)
    results.push(updateResult)
    if (!updateResult.success) return { results, finalState: state }

    // Step 4: Create Invoice from SO
    const invoiceResult = await createInvoiceFromSO(state.salesOrder.id, tranDate)
    results.push(invoiceResult)
    if (!invoiceResult.success) return { results, finalState: state }

    invoiceId = invoiceResult.data?.invoiceId
    if (!customerId) customerId = state.salesOrder.entityId || null
  }

  // Step 5: Create Payment
  if (!invoiceId) {
    results.push({ step: 'create-payment', success: false, error: 'No invoice ID available' })
    return { results, finalState: state }
  }

  if (!customerId) {
    results.push({ step: 'create-payment', success: false, error: 'No customer ID found on any transaction' })
    return { results, finalState: state }
  }

  const paymentResult = await createPaymentForInvoice(invoiceId, customerId, paymentAmount, currency, tranDate)
  results.push(paymentResult)

  // Re-check final state
  const finalState = await checkOrderState(orderName)
  return { results, finalState }
}
