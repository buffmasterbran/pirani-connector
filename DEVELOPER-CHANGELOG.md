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

**Files updated:** Prisma schema, API routes, UI components, deposit helpers — all references to these columns were removed. Auto-assign rules now write only to `amountDescription`.

**Why:** Only `amountDescription` was used by the UI dropdown. The other two fields were never wired up and caused confusion.

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

- Added new "Disputes & Chargebacks" card with three sections: How Disputes Work, Setting Up Dispute Handling, Won Disputes warning
- Updated dropdown section title (removed references to removed Fee/Other Fees dropdowns)

**Why:** Disputes are handled as "other" items in the deposit mapped to a single GL account (NS account 1020 "Chargebacks"). No NS transactions needed — dispute amounts flow through the deposit and offset over time when won or covered by chargeback protection.

---

### 5. "Orders with Issues" filter — now includes non-order transactions

**Files:**
- `src/components/transactions/useTransactionData.ts` — Lines 214-247
- `src/components/transactions/TransactionsDialog.tsx` — Lines 584-601

**Before:** The "Orders with Issues" counter and filter only counted transactions that had a valid `source_order_id`. Transactions without an order ID (disputes, chargeback protection, unassigned payout lines) were detected as problematic but never shown in the count or filter results.

**After:** Non-order problematic transactions are now counted and displayed when the "Orders with Issues" checkbox is checked.

**Why:** Dispute and chargeback protection lines have no order ID (`#N/A`), so they were invisible to the issues filter even when unassigned.
