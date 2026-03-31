import * as XLSX from 'xlsx'

export interface TikTokStatement {
  statementId: string
  paymentId: string
  status: string
  currency: string
  totalAmount: number
  netSales: number
  shipping: number
  fees: number
  adjustments: number
  reserveAmount: number
  payableAmount: number
  statementDate: string // "2026/03/29"
}

export interface TikTokOrderDetail {
  statementId: string
  paymentId: string
  status: string
  currency: string
  type: string // "Order", "Refund", "Adjustment"
  tiktokOrderId: string
  skuId: string | null
  quantity: number | null
  productName: string | null
  skuName: string | null
  orderCreatedDate: string | null
  orderShipmentDate: string | null
  orderDeliveryDate: string | null
  totalSettlementAmount: number
  grossSales: number
  grossSalesRefund: number
  sellerDiscount: number
  shippingAmount: number
  fees: number
  transactionFee: number
  referralFee: number
  affiliateCommission: number
  adjustmentAmount: number
  adjustmentReason: string | null
  customerPayment: number
  customerRefund: number
}

function parseNum(val: any): number {
  if (val === null || val === undefined || val === '' || val === '/') return 0
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

function parseStr(val: any): string | null {
  if (val === null || val === undefined || val === '' || val === '/') return null
  return String(val)
}

/**
 * TikTok's Excel export declares an incorrect sheet range (e.g., A1:EC6)
 * even though data extends much further. This helper scans all cell keys
 * to find the true last row and fixes the !ref property.
 */
function fixSheetRange(ws: XLSX.WorkSheet): void {
  let maxRow = 0
  for (const cell in ws) {
    if (cell[0] === '!') continue
    const match = cell.match(/(\d+)$/)
    if (match) {
      const row = parseInt(match[1], 10)
      if (row > maxRow) maxRow = row
    }
  }
  if (maxRow > 0 && ws['!ref']) {
    const colEnd = ws['!ref'].split(':')[1]?.replace(/\d+/, '') || 'EC'
    ws['!ref'] = `A1:${colEnd}${maxRow}`
  }
}

/**
 * Parse TikTok income Excel file.
 * Returns statements (payout summaries) and order details (line items).
 */
export function parseTikTokExcel(buffer: Buffer): {
  statements: TikTokStatement[]
  orderDetails: TikTokOrderDetail[]
} {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  // --- Parse Statements sheet ---
  const statementsSheet = wb.Sheets['Statements']
  if (!statementsSheet) throw new Error('Missing "Statements" sheet in Excel file')
  fixSheetRange(statementsSheet)

  const statementsRaw = XLSX.utils.sheet_to_json<any[]>(statementsSheet, { header: 1 })
  const statements: TikTokStatement[] = []

  // Row 0 = headers, data starts at row 1
  for (let i = 1; i < statementsRaw.length; i++) {
    const row = statementsRaw[i]
    if (!row || !row[0] || !row[1]) continue // skip empty rows

    statements.push({
      statementDate: String(row[0]),
      statementId: String(row[1]),
      paymentId: String(row[2] || ''),
      status: String(row[3] || ''),
      currency: 'USD',
      totalAmount: parseNum(row[4]),
      netSales: parseNum(row[5]),
      shipping: parseNum(row[6]),
      fees: parseNum(row[7]),
      adjustments: parseNum(row[8]),
      reserveAmount: parseNum(row[9]),
      payableAmount: parseNum(row[10]),
    })
  }

  // --- Parse Order details sheet ---
  const orderSheet = wb.Sheets['Order details']
  if (!orderSheet) throw new Error('Missing "Order details" sheet in Excel file')
  fixSheetRange(orderSheet)

  const orderRaw = XLSX.utils.sheet_to_json<any[]>(orderSheet, { header: 1 })
  const orderDetails: TikTokOrderDetail[] = []

  // Row 0 = headers, data starts at row 1
  for (let i = 1; i < orderRaw.length; i++) {
    const row = orderRaw[i]
    if (!row || !row[0] || !row[1]) continue // skip empty rows

    orderDetails.push({
      statementId: String(row[1]),
      paymentId: String(row[2] || ''),
      status: String(row[3] || ''),
      currency: String(row[4] || 'USD'),
      type: String(row[5] || 'Order'),
      tiktokOrderId: String(row[6] || ''),
      skuId: parseStr(row[7]),
      quantity: row[8] != null ? Number(row[8]) : null,
      productName: parseStr(row[9]),
      skuName: parseStr(row[10]),
      orderCreatedDate: parseStr(row[11]),
      orderShipmentDate: parseStr(row[12]),
      orderDeliveryDate: parseStr(row[13]),
      totalSettlementAmount: parseNum(row[14]),
      grossSales: parseNum(row[15]),
      grossSalesRefund: parseNum(row[17]),
      sellerDiscount: parseNum(row[19]),
      shippingAmount: parseNum(row[20]),
      fees: parseNum(row[41]),
      transactionFee: parseNum(row[42]),
      referralFee: parseNum(row[43]),
      affiliateCommission: parseNum(row[45]),
      adjustmentAmount: parseNum(row[60]),
      adjustmentReason: parseStr(row[61]),
      customerPayment: parseNum(row[63]),
      customerRefund: parseNum(row[64]),
    })
  }

  return { statements, orderDetails }
}
