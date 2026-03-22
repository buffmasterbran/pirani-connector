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

---

### 7. Auto-split child fee sign bug — stored as negative instead of positive

The auto-split code for Shop Cash merged transactions stored child fees as **negative** (`-Math.abs(childFee)`), but they should be **positive** like regular charge fees. This caused a chain of issues:

1. Negative child fees reduced the fee total (wrong direction)
2. `Math.abs` was added as a bandaid to the fee calculation, which overcorrected by also abs-ing the legitimate won-dispute fee refund (-$15)
3. The deposit "Shopify Fees" line was inflated, and the Proposed NetSuite total was $28.92 off from the Shopify payout

#### Fix A: Store child fees as positive

**File:** `src/app/api/payouts/save/route.ts` — Line 235

**Before:**
```js
fee: childFee ? -Math.abs(childFee) : 0,
```

**After:**
```js
fee: Math.abs(childFee || 0),
```

#### Fix B: Remove `Math.abs` from deposit fee calculation

**File:** `src/app/api/payouts/[id]/create-deposit/route.ts` — Line 60

**Before:**
```js
const totalFees = -includedTransactions.reduce((sum: number, txn: any) => sum + Math.abs(txn.fee || 0), 0)
```

**After:**
```js
const totalFees = -includedTransactions.reduce((sum: number, txn: any) => sum + (Number(txn.fee) || 0), 0)
```

#### Fix C: Remove `Math.abs` from UI fee calculations (6 locations)

**File:** `src/components/transactions/useTransactionData.ts`

All fee sum calculations changed from `Math.abs(fee || 0)` to `(fee || 0)` — using signed sum instead of absolute value. Locations:

- Line 332: Shopify totalFees calculation
- Line 385: NetSuite nsFees calculation
- Line 460: Grouped fee items — Shopify Fees (all transactions)
- Line 468: Grouped fee items — NetSuite Fees (included transactions)
- Line 508: Recalculated Shopify Fees total
- Line 515: Recalculated NetSuite Fees total

**Before (all 6):**
```js
return sum + Math.abs(fee || 0)
```

**After (all 6):**
```js
return sum + (fee || 0)
```

#### Fix D: Database migration — flipped 164 existing child fee records

All auto-split child transactions (`id` containing `-auto`) with negative fees were updated to positive across all payouts. 164 records affected.

**Why:** The Shopify API returns child fees as positive numbers (e.g., `0.37`). Regular charge fees are stored as positive in our DB. The auto-split code negated them (`-Math.abs`) which made them inconsistent with regular fees. With fees stored correctly as positive, the signed sum naturally handles the one legitimate negative fee case (won dispute fee refund of -$15) without needing `Math.abs`.

**Result:** Payout 130217836801 gap reduced from $28.92 to $1.08 (rounding across 1,300+ transactions).

---

### 8. Auto-split — rewrite for robustness (fixes $1.08 gap)

The auto-split logic had multiple bugs that caused incomplete splits on re-import, leaving Shop Cash credit fees invisible to the deposit.

**Root cause of $1.08 gap on payout 130217836801:** Two Shop Cash credits (#2677391294721 and #2676385022209) each had 2 children, but only 1 was created. The second child was lost on re-import because the existing-children check was broken (always returned 0), causing duplicate key crashes that aborted the split mid-way. The missing children's fees ($0.74 + $0.34 = $1.08) were only on the excluded parent.

**Confirmed via Shopify API:** Shopify DOES return all orders in `adjustment_order_transactions` — the data was always complete. The bug was purely in our re-import handling.

#### Fix A: Re-import now creates only MISSING children (not all-or-nothing)

**File:** `src/app/api/payouts/save/route.ts`

**Before:**
```js
const existingChildren = await prisma.payoutTransaction.count({
  where: { parentTransactionId: parentId },  // BUG: parentTransactionId is never set
})
if (existingChildren > 0) {
  continue  // Skip entirely — but check always returned 0, so it never skipped
}
// ... create ALL children with prisma.create (crashes on duplicate key)
```

**After:**
```js
const existingChildRows = await prisma.payoutTransaction.findMany({
  where: { id: { startsWith: `${parentId}-auto` } },
  select: { id: true },
})
const existingChildIds = new Set(existingChildRows.map(c => c.id))

if (existingChildIds.size >= subs.length) {
  continue  // Already fully split
}

for (let j = 0; j < subs.length; j++) {
  const childId = `${parentId}-auto-${j}`
  if (existingChildIds.has(childId)) continue  // Skip existing, create missing
  // ... create child
}
```

**Why:** Children don't have `parentTransactionId` (removed in commit 6e78dcb), so the old check always returned 0. On re-import it would try to recreate all children, crash on the first duplicate key, and abort — leaving later splits incomplete. The new approach finds existing children by ID pattern and only creates the missing ones.

#### Fix B: Each parent wrapped in try-catch

Individual split failures no longer abort the entire auto-split loop. One bad credit can't prevent others from being processed.

#### Fix C: Remainder child safety net

After creating children from `adjustment_order_transactions`, if the amounts don't sum to the parent, a remainder child is inferred for the primary order (using the parent's `source_order_id`). Defensive against any future Shopify API changes.

#### Fix D: Parent `source_order_id` included in orderLine lookup

Added `t.source_order_id` to the `splitOrderIds` set so the remainder child can get the correct `orderLineId`.

**Result:** Re-importing payout 130217836801 should now create the 2 missing children and close the $1.08 gap.
