# Developer Changelog

Changes made outside of the normal dev workflow. Each entry includes the exact before/after so changes can be reviewed quickly.

---

## 2026-03-22

### 1. Marketplace Sales Order — added `istaxable: false`

**File:** `src/lib/netsuite/marketplace-order.ts` — Line 163

**Before:**
```js
const patchBody: any = {
  taxItem: { id: taxCodeId },
  paymentoption: null,
}
```

**After:**
```js
const patchBody: any = {
  istaxable: false,
  taxItem: { id: taxCodeId },
  paymentoption: null,
}
```

**Why:** SO→Invoice transformation was failing with "Transaction was not in balance" because NetSuite recalculated tax on the invoice. Setting `istaxable: false` prevents this.

---

### 2. Removed unused DB columns and code references

**Columns dropped from `PayoutTransaction`:** `feeDescription`, `otherFeesDescription`
**Column dropped from `AutoAssignRule`:** `targetField`

**Why:** Only `amountDescription` was used by the UI dropdown. The other two fields were never wired up and caused deploy errors.

#### File-by-file changes:

**`prisma/schema.prisma`**

Before (PayoutTransaction model):
```prisma
  otherFeesDescription    String?
  amountDescription       String?
  feeDescription          String?
```

After:
```prisma
  amountDescription       String?
```

Before (AutoAssignRule model):
```prisma
  targetField               String   // "amountDescription" | "feeDescription" | "otherFeesDescription"
```

After:
```prisma
  targetField               String   // "amountDescription"
```

---

**`src/lib/auto-assign.ts`**

Before (line 34 — skip check):
```js
if (txn.amountDescription || txn.feeDescription || txn.otherFeesDescription) {
```

After:
```js
if (txn.amountDescription) {
```

Before (lines 57-59 — dynamic field write):
```js
const updateData: Record<string, string> = {}
updateData[matchedRule.targetField] = valueToStore

await prisma.payoutTransaction.update({
  where: { id: txn.id },
  data: updateData,
})
```

After:
```js
// Always write to amountDescription — same field the manual dropdown uses
await prisma.payoutTransaction.update({
  where: { id: txn.id },
  data: { amountDescription: valueToStore },
})
```

Before (line 67 — detail logging):
```js
field: matchedRule.targetField,
```

After:
```js
field: 'amountDescription',
```

---

**`src/app/api/mappings/auto-assign-rules/route.ts`**

Before (line 73 — validation):
```js
if (!['amountDescription', 'feeDescription', 'otherFeesDescription'].includes(targetField)) {
  return NextResponse.json(
    { success: false, error: 'targetField must be amountDescription, feeDescription, or otherFeesDescription' },
    { status: 400 }
  )
}
```

After:
```js
if (targetField !== 'amountDescription') {
  return NextResponse.json(
    { success: false, error: 'targetField must be amountDescription' },
    { status: 400 }
  )
}
```

---

**`src/lib/deposit-helpers.ts`**

Before (lines 137-162 — buildDropdownItems had 3 blocks):
```js
if (txn.amountDescription) { ... }
if (txn.feeDescription) { ... }
if (txn.otherFeesDescription) { ... }
```

After (only amountDescription block remains):
```js
if (txn.amountDescription) { ... }
```

The `feeDescription` and `otherFeesDescription` blocks were deleted entirely.

---

**`src/components/transactions/types.ts`**

Before:
```ts
otherFeesDescription?: string | null
amountDescription?: string | null
feeDescription?: string | null
```

After:
```ts
amountDescription?: string | null
```

Before (hasDropdownAssignment):
```ts
export function hasDropdownAssignment(t: Pick<Transaction, 'amountDescription' | 'feeDescription' | 'otherFeesDescription'>): boolean {
  return !!(t.amountDescription || t.feeDescription || t.otherFeesDescription)
}
```

After:
```ts
export function hasDropdownAssignment(t: Pick<Transaction, 'amountDescription'>): boolean {
  return !!t.amountDescription
}
```

---

**`src/components/transactions/TransactionCellEditors.tsx`**

Deleted `FeeDescriptionSelect` and `OtherFeesDescriptionSelect` components entirely (~70 lines removed). Only `AmountDescriptionSelect` remains.

Before (AmountDescriptionSelect resolved from all 3 fields):
```js
const activeDescription = transaction.amountDescription || transaction.otherFeesDescription || transaction.feeDescription
```

After:
```js
transaction.amountDescription
```

---

**`src/components/transactions/TransactionsDialog.tsx`**

Deleted `handleUpdateOtherFeesDescription` and `handleUpdateFeeDescription` handler functions entirely (~80 lines removed). Removed their props from the `TransactionsTable` call.

---

**`src/components/transactions/TransactionsTable.tsx`**

Removed `onUpdateOtherFeesDescription` and `onUpdateFeeDescription` props.

---

**`src/components/transactions/useTransactionData.ts`**

Removed `otherFeesDescription` and `feeDescription` from the `TransactionItem` interface. Deleted two blocks in the fee comparison logic that aggregated `otherFeesDescription` into Shopify and NetSuite fee maps (~25 lines removed).

---

**`src/components/transactions/useAutoProcessData.ts`**

Removed `feeDescription` and `otherFeesDescription` from the `TransactionLike` interface.

---

### 3. Deposit fee calculation — fixed sign bug

**File:** `src/app/api/payouts/[id]/create-deposit/route.ts` — Line 60

**Before:**
```js
const totalFees = includedTransactions.reduce((sum: number, txn: any) => sum + (txn.fee || 0), 0)
```

**After:**
```js
const totalFees = -includedTransactions.reduce((sum: number, txn: any) => sum + Math.abs(txn.fee || 0), 0)
```

**Why:** Charge fees are stored as positive (e.g., `2.50`), Shop Cash split child fees are stored as negative (e.g., `-0.54`). Summing directly caused credit fees to subtract from charge fees, making the Shopify Fees line too low in the deposit. The fix sums all fees as absolute values, then negates the total.

---

### 4. Help section — added Disputes & Chargebacks documentation

**File:** `src/app/sections/HelpSection.tsx`

- Added new "Disputes & Chargebacks" card with three FAQ sections: How Disputes Work, Setting Up Dispute Handling, Won Disputes warning
- Updated dropdown section title from "Using Dropdown Assignments (Amount, Fee, Other Fees)" to "Using Dropdown Assignments"
- Simplified dropdown description (removed bullet points for Fee and Other Fees dropdowns)

**Why:** Disputes are handled as "other" items in the deposit mapped to a single GL account (NS account 1020 "Chargebacks"). No NS transactions needed — dispute amounts flow through the deposit and offset over time when won or covered by chargeback protection.

---

### 5. "Orders with Issues" filter — now includes non-order transactions

**File:** `src/components/transactions/useTransactionData.ts` — Lines 214-247

**Before (3 counting blocks, all identical pattern):**
```js
// Count problematic transactions (for "Orders with Issues")
const problematicOrderIds = new Set<string>()
localTransactions.forEach(t => {
  if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
    problematicOrderIds.add(t.source_order_id)
  }
})
const problematicOrdersCount = problematicOrderIds.size
```

**After (total count — lines 214-225):**
```js
// Count problematic transactions (for "Orders with Issues")
const problematicOrderIds = new Set<string>()
let problematicNonOrderCount = 0
localTransactions.forEach(t => {
  if (isProblematicTransaction(t)) {
    if (t.source_order_id && t.source_order_id !== 'N/A') {
      problematicOrderIds.add(t.source_order_id)
    } else {
      problematicNonOrderCount++
    }
  }
})
const problematicOrdersCount = problematicOrderIds.size + problematicNonOrderCount
```

**Before (non-web count — same pattern as above):**
```js
if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
  problematicNonWebOrderIds.add(t.source_order_id)
}
```

**After (non-web count — lines 240-260):**
```js
// Non-order transactions (no source) count as non-web
if (!t.source_name) return true
```
added to filter, plus:
```js
if (isProblematicTransaction(t)) {
  if (t.source_order_id && t.source_order_id !== 'N/A') {
    problematicNonWebOrderIds.add(t.source_order_id)
  } else {
    problematicNonWebNonOrderCount++
  }
}
```
```js
const problematicNonWebOrdersCount = problematicNonWebOrderIds.size + problematicNonWebNonOrderCount
```

Note: The web count block was NOT changed (disputes have no source, so they don't count as web orders).

---

**File:** `src/components/transactions/TransactionsDialog.tsx` — Lines 584-601

**Before:**
```js
if (filterMissingCashSale) {
  const problematicOrderIds = new Set<string>()
  filtered.forEach(t => {
    if (isProblematicTransaction(t) && t.source_order_id && t.source_order_id !== 'N/A') {
      problematicOrderIds.add(t.source_order_id)
    }
  })

  if (problematicOrderIds.size === 0) {
    return []
  }

  return filtered.filter(t =>
    t.source_order_id &&
    t.source_order_id !== 'N/A' &&
    problematicOrderIds.has(t.source_order_id)
  )
}
```

**After:**
```js
if (filterMissingCashSale) {
  const problematicOrderIds = new Set<string>()
  const problematicNonOrderIds = new Set<string>()
  filtered.forEach(t => {
    if (isProblematicTransaction(t)) {
      if (t.source_order_id && t.source_order_id !== 'N/A') {
        problematicOrderIds.add(t.source_order_id)
      } else {
        problematicNonOrderIds.add(t.id)
      }
    }
  })

  if (problematicOrderIds.size === 0 && problematicNonOrderIds.size === 0) {
    return []
  }

  return filtered.filter(t =>
    // Show non-order problematic transactions directly
    problematicNonOrderIds.has(t.id) ||
    // Show all transactions for problematic order IDs
    (t.source_order_id &&
    t.source_order_id !== 'N/A' &&
    problematicOrderIds.has(t.source_order_id))
  )
}
```

**Why:** Dispute and chargeback protection lines have no order ID (`#N/A`), so they were invisible to the issues filter even when unassigned.

---

### 6. Proposed NetSuite total — disputes excluded from calculation

**File:** `src/components/transactions/useTransactionData.ts`

Two bugs caused the "Proposed NetSuite" summary to show a different amount than the Shopify payout total:

#### Bug A: Dispute transactions excluded from Adjustments total (Lines 312 and 375)

Dispute transactions (`type: "dispute"`) have `adjustmentReason: null`, so they weren't counted in Charges, Refunds, or Adjustments — their amounts were completely missing from the totals.

**Before (Shopify side — line 312):**
```js
const totalAdjustments = includedTransactions
    .filter(t => t.adjustmentReason && t.adjustmentReason !== null)
```

**After:**
```js
const totalAdjustments = includedTransactions
    .filter(t => (t.adjustmentReason && t.adjustmentReason !== null) || t.type === 'dispute')
```

**Before (NetSuite side — line 375):**
```js
const nsAdjustments = includedTransactionsForNetSuite
    .filter(t => t.adjustmentReason && t.adjustmentReason !== null)
```

**After:**
```js
const nsAdjustments = includedTransactionsForNetSuite
    .filter(t => (t.adjustmentReason && t.adjustmentReason !== null) || t.type === 'dispute')
```

#### Bug B: Dropdown item amounts using `Math.abs()` instead of signed values (Lines 482 and 499)

The grouped fee items display (Chargebacks, E-Com Tax Offset, etc.) was using `Math.abs()` on dropdown-assigned transaction amounts. This caused chargebacks to show as the sum of absolute values (e.g., $244.86) instead of the correct net (-$32.76).

**Before (Shopify dropdown aggregation — line 482):**
```js
shopifyFeeMap.set(description, existing + Math.abs(amount || 0))
```

**After:**
```js
shopifyFeeMap.set(description, existing + (amount || 0))
```

**Before (NetSuite dropdown aggregation — line 499):**
```js
netsuiteFeeMap.set(description, existing + Math.abs(amount || 0))
```

**After:**
```js
netsuiteFeeMap.set(description, existing + (amount || 0))
```

**Why:** Disputes have mixed positive (won disputes) and negative (lost disputes) amounts. Using `Math.abs()` inflated the Chargebacks line and the adjustments filter excluded disputes entirely, causing a false "Mismatch" warning in the payout summary header.
