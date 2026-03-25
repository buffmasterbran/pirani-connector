'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpCircle, ChevronRight, BookOpen, GitMerge, FileText, AlertTriangle, DollarSign, Tag, ClipboardList, ShieldCheck } from 'lucide-react'

type FaqId = string

function FaqItem({ id, icon, title, expandedFaq, setExpandedFaq, children }: {
  id: FaqId
  icon?: React.ReactNode
  title: string
  expandedFaq: FaqId | null
  setExpandedFaq: (id: FaqId | null) => void
  children: React.ReactNode
}) {
  const isExpanded = expandedFaq === id
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpandedFaq(isExpanded ? null : id)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronRight
            className={`h-5 w-5 text-slate-500 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
          />
          {icon}
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t bg-gray-50">
          <div className="pt-4 space-y-3 text-sm text-slate-700">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">{number}</div>
      <div className="flex-1">
        <p className="font-medium mb-1">{title}</p>
        <div className="text-slate-600">{children}</div>
      </div>
    </div>
  )
}

function Tip({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'success' }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  }
  const labels = { info: 'Tip', warning: 'Important', success: 'Good to know' }
  return (
    <div className={`border rounded p-3 ${styles[variant]}`}>
      <p className="font-medium mb-1">{labels[variant]}:</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function HelpSection() {
  const [expandedFaq, setExpandedFaq] = useState<FaqId | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Help &amp; Workflows</h2>
        <p className="text-slate-600">Standard operating procedures and guidance for payout reconciliation.</p>
      </div>

      {/* ============ PAYOUT RECONCILIATION WORKFLOW ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            Payout Reconciliation Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="standard-workflow"
              icon={<DollarSign className="h-4 w-4 text-green-600" />}
              title="Standard Payout Workflow (Start Here)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3">Follow these steps for each payout to reconcile and push to NetSuite:</p>
              <div className="space-y-4">
                <Step number={1} title="Open the Payout">
                  <p>Click <strong>&quot;View Transactions&quot;</strong> on the payout row. The transactions dialog shows the Shopify vs NetSuite summary at the top.</p>
                </Step>
                <Step number={2} title="Import Missing Orders">
                  <p>If orders are missing from the DB, click <strong>&quot;Import Missing Orders&quot;</strong> in the filter bar. This fetches order data from Shopify.</p>
                </Step>
                <Step number={3} title="Fetch Missing NetSuite Transactions">
                  <p>Click <strong>&quot;Get Missing NS Transactions&quot;</strong> to auto-match Shopify orders with their NetSuite cash sales, refunds, and payments by order number.</p>
                </Step>
                <Step number={4} title="Review Mismatches">
                  <p>Check <strong>&quot;Orders with Issues&quot;</strong> to filter to transactions that need attention. Red rows indicate problems (missing NS IDs, amount mismatches, sign mismatches). Sign mismatches (e.g., Shopify shows -$44.53 but NS shows +$44.53) are flagged in red &mdash; this usually means a transaction was manually added with the wrong sign.</p>
                </Step>
                <Step number={5} title="Handle Special Cases">
                  <p>Address any order editing splits, tax adjustments, or other special transactions using the guides below.</p>
                </Step>
                <Step number={6} title="Assign Dropdowns for Fees &amp; Non-Order Transactions">
                  <p>Use the <strong>Amount</strong>, <strong>Fee</strong>, and <strong>Other Fees</strong> dropdowns to assign GL accounts to non-order transactions (fees, shipping labels, credits, etc.).</p>
                </Step>
                <Step number={7} title="Verify Summary Matches">
                  <p>The three-column summary at the top should show <strong>&quot;Match&quot;</strong> for Charges and Fees. If not, investigate remaining mismatches.</p>
                </Step>
                <Step number={8} title="Push to NetSuite">
                  <p>Once the payout shows a green <strong>&quot;Matched&quot;</strong> badge in the payout list, click <strong>&quot;Push to NS&quot;</strong> to create the NetSuite deposit. The system will preview the deposit JSON, validate all NS IDs, and then create the deposit (or multiple batched deposits for large payouts).</p>
                </Step>
              </div>
              <Tip variant="info">
                <p>The deposit includes two sections: <strong>payment items</strong> (cash sales, refunds, payments that have NS IDs) and <strong>other items</strong> (fees and dropdown-assigned transactions mapped to GL accounts).</p>
              </Tip>
              <Tip variant="success">
                <p><strong>Bulk assign:</strong> Select multiple transactions using checkboxes, then use the bulk dropdown that appears above the table to assign them all to the same GL account at once. Useful for assigning many tax adjustments or credits in one go.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="amount-mismatch"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              title="Amount Mismatch Warnings"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When you see <strong className="text-red-600">&quot;Amount mismatch!&quot;</strong> on a transaction, it means the Shopify payout amount differs from the NetSuite transaction amount.</p>

              <p className="font-medium mt-3 mb-2">Common causes:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Order Editing:</strong> The order was modified after the original charge, creating split captures. See &quot;Order Editing&quot; section below.</li>
                <li><strong>Split across payouts:</strong> A single order&apos;s payment was split into multiple payouts (gift cards, Shopify Pay timing, order edits). See &quot;Split Payments Across Payouts&quot; below.</li>
                <li><strong>Sign mismatch:</strong> The Shopify amount is negative but the NS amount is positive (or vice versa). This usually means a transaction was manually added with the wrong sign. The row will be highlighted in red.</li>
                <li><strong>Partial refunds or adjustments:</strong> The Shopify amount reflects a partial amount.</li>
              </ul>

              <Tip variant="warning">
                <p>Shopify payout amounts are NOT order totals. They are the <strong>net payout for that transaction</strong> (order total minus Shopify fees). The NetSuite cash sale shows the <strong>full order total</strong>. These will almost never be exactly equal. The mismatch flag compares these two amounts.</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ ORDER EDITING ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-amber-600" />
            Order Editing (Product Added/Removed)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="order-editing-overview"
              icon={<Tag className="h-4 w-4 text-amber-600" />}
              title="What is Order Editing?"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>When products are added or removed from an order after the original purchase using the Order Editing tool, Shopify creates <strong>additional captures</strong> for the price difference. This means one order can have <strong>multiple payout transactions</strong>.</p>

              <p className="mt-2">Orders with this flag will show an amber <strong className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-semibold">EDITED</strong> badge next to the order name (once the order has been imported with tags).</p>

              <p className="mt-2">Shopify tags these orders with: <code className="bg-gray-200 px-1 rounded text-xs">orderediting, orderediting:product_added</code> or <code className="bg-gray-200 px-1 rounded text-xs">orderediting:product_removed</code></p>

              <Tip variant="info">
                <p>The EDITED badge only appears after orders are imported (or re-imported) with the tags field. Older orders imported before this feature will not show the badge.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="order-editing-same-payout"
              icon={<GitMerge className="h-4 w-4 text-green-600" />}
              title="SOP: Edited Order - Both Charges in SAME Payout (Merge)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3">When both the original charge and the additional capture are in the <strong>same payout</strong>, simply merge them:</p>
              <div className="space-y-4">
                <Step number={1} title="Identify the split transactions">
                  <p>Look for two (or more) transactions with the same order number. They will appear grouped with a &quot;2 transactions&quot; indicator.</p>
                </Step>
                <Step number={2} title="Select both transactions">
                  <p>Check the checkboxes on both transactions.</p>
                </Step>
                <Step number={3} title="Click Merge">
                  <p>The merge dialog will appear. Select the target transaction (the one with the NetSuite ID).</p>
                </Step>
                <Step number={4} title="Verify the match indicator">
                  <p>The merge dialog shows a <strong className="text-green-600">green checkmark</strong> if the combined amount will match the NS cash sale, or a <strong className="text-red-600">red X</strong> if it will not. Only proceed if it shows green.</p>
                </Step>
                <Step number={5} title="Merge">
                  <p>Click &quot;Merge Transactions.&quot; The combined transaction will now match the NetSuite cash sale.</p>
                </Step>
              </div>
              <Tip variant="success">
                <p>After merging, the amount mismatch flag is automatically recalculated. If the combined amount matches the NS amount, the mismatch warning will clear.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="order-editing-cross-payout"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              title="SOP: Edited Order - Charges in DIFFERENT Payouts (Invoice + Payments)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3">When the original charge and additional capture are in <strong>different payouts</strong>, you cannot merge them (deposits would not match). Use the <strong>Process Marketplace Order</strong> flow to convert the cash sale into an invoice with payments:</p>
              <div className="space-y-4">
                <Step number={1} title="Identify the cross-payout split">
                  <p>Search for the order number in the payout search bar. It will show which payouts contain this order and the amounts in each. One payout will have a charge with an NS cash sale matched (showing a mismatch), and the other will have a charge with no NS match.</p>
                </Step>
                <Step number={2} title="Open the payout with the NS cash sale">
                  <p>Click &quot;View Transactions&quot; on the payout that has the matched cash sale. Find the transaction and click the <strong>marketplace order icon</strong> to open the Process Marketplace Order dialog.</p>
                </Step>
                <Step number={3} title="Run the marketplace order workflow">
                  <p>Click <strong>&quot;Run All&quot;</strong> or run each step individually:</p>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                    <li><strong>Delete Cash Sale</strong> &mdash; removes the original cash sale from NetSuite</li>
                    <li><strong>Edit Sales Order</strong> &mdash; sets non-taxable tax code and adds marketplace tax line item (if applicable). Tax is automatically looked up across all payouts and from the Shopify Order API as a fallback.</li>
                    <li><strong>Create Invoice</strong> &mdash; transforms the sales order into an invoice for the full order amount</li>
                    <li><strong>Create Payment</strong> &mdash; creates a payment for this payout&apos;s transaction amount. The payment NS ID is automatically saved to the transaction.</li>
                  </ul>
                </Step>
                <Step number={4} title="Process the second (and third) payout">
                  <p>Open the other payout(s) containing this order. Click the marketplace order icon on that transaction. Since the invoice already exists, the workflow will skip straight to <strong>Create Payment</strong> for that payout&apos;s amount. The invoice balance decreases with each payment until fully paid.</p>
                </Step>
              </div>

              <Tip variant="info">
                <p>An order can span <strong>2 or even 3 payouts</strong>. For example, a $165.11 order paid with a $15 gift card might appear as: $15 credit in payout A, $150.11 charge in payout B, and $9.36 tax debit in payout C. Each charge/credit payout needs its own payment against the invoice.</p>
              </Tip>

              <Tip variant="success">
                <p>The Process Marketplace Order flow handles all the NetSuite work automatically. You no longer need to manually delete cash sales, create invoices, or create payments in NetSuite. The tax line is automatically pulled from payout data across all payouts, with a Shopify API fallback if the payout hasn&apos;t been imported yet.</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ TRANSACTION TYPES & DROPDOWNS ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            Transaction Types &amp; Dropdown Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="transaction-types"
              icon={<FileText className="h-4 w-4 text-purple-600" />}
              title="Understanding Transaction Types"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">Shopify&apos;s payout API returns these transaction types:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Type</th>
                      <th className="border p-2 text-left">Description</th>
                      <th className="border p-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-2 font-mono">charge</td><td className="border p-2">Order payment (most common)</td><td className="border p-2">Auto-matched to NS Cash Sale</td></tr>
                    <tr><td className="border p-2 font-mono">refund</td><td className="border p-2">Order refund</td><td className="border p-2">Auto-matched to NS Refund</td></tr>
                    <tr><td className="border p-2 font-mono">credit</td><td className="border p-2">Shop cash credit, marketplace tax</td><td className="border p-2">Assign via dropdown</td></tr>
                    <tr><td className="border p-2 font-mono">debit</td><td className="border p-2">Shipping labels, adjustments</td><td className="border p-2">Assign via dropdown</td></tr>
                    <tr><td className="border p-2 font-mono">dispute</td><td className="border p-2">Chargebacks</td><td className="border p-2">Assign via dropdown</td></tr>
                    <tr><td className="border p-2 font-mono">payout</td><td className="border p-2">Payout-level entries</td><td className="border p-2">Usually excluded</td></tr>
                  </tbody>
                </table>
              </div>

              <Tip variant="info">
                <p>Shopify&apos;s API returns <strong>generic</strong> types (charge, credit, debit). The CSV export from Shopify shows <strong>specific</strong> types (marketplace_sales_tax, shop_cash_credit, etc.). The web app stores what the API returns.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="dropdowns"
              icon={<DollarSign className="h-4 w-4 text-purple-600" />}
              title="Using Dropdown Assignments"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">For transactions that do not have a NetSuite cash sale or refund (fees, credits, debits, disputes), use the dropdown menu to assign them to a GL account. The dropdown routes the transaction&apos;s <strong>amount</strong> to the selected account as an &quot;other&quot; item in the deposit.</p>

              <p className="mt-3 font-medium">Current GL Account Mappings:</p>
              <div className="overflow-x-auto mt-1">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Dropdown Option</th>
                      <th className="border p-2 text-left">NS Account</th>
                      <th className="border p-2 text-left">When to Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-2">Shopify Fees</td><td className="border p-2">989</td><td className="border p-2">Standard Shopify transaction processing fees</td></tr>
                    <tr><td className="border p-2">Shipping Label</td><td className="border p-2">513</td><td className="border p-2">Shopify shipping label purchases</td></tr>
                    <tr><td className="border p-2">E-Com Tax Offset</td><td className="border p-2">1019</td><td className="border p-2">Marketplace sales tax / tax adjustments</td></tr>
                    <tr><td className="border p-2">Shopify Advertising Fees</td><td className="border p-2">1003</td><td className="border p-2">Shopify advertising/marketing charges</td></tr>
                  </tbody>
                </table>
              </div>

              <Tip variant="warning">
                <p>A transaction with <strong>both</strong> a NetSuite ID (cash sale/payment) <strong>and</strong> an amount dropdown will be counted twice in the deposit &mdash; once as a payment item and once as an &quot;other&quot; item. Only assign dropdowns to transactions that do NOT have a NS cash sale or payment.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-handling"
              icon={<DollarSign className="h-4 w-4 text-amber-600" />}
              title="Shopify Tax Adjustments (Marketplace Sales Tax)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>When Shopify collects marketplace sales tax (Shop App, Facebook, TikTok, etc.), they charge tax to the customer and deduct it from your payout as a separate <strong>tax_adjustment</strong>. You never receive this money &mdash; Shopify remits it directly to the state.</p>

              <p className="mt-2 font-medium">For tax adjustment transactions in a payout:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Set the amount dropdown to <strong>&quot;E-Com Tax Offset&quot;</strong> (account 1019)</li>
                <li>This posts the deduction to the Marketplace Tax Pass-Through GL</li>
              </ul>

              <p className="mt-2 font-medium">When an order with marketplace tax is cancelled:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Shopify refunds the tax to the customer</li>
                <li>This creates a tax adjustment credit in your payout</li>
                <li>Assign it to &quot;E-Com Tax Offset&quot; as well</li>
              </ul>

              <Tip variant="warning">
                <p>Tax adjustments often appear on a <strong>different payout</strong> than the order charge. For example, the charge might be on Monday&apos;s payout but the tax deduction on Wednesday&apos;s. This is normal &mdash; the pass-through GL account balances out over time. See &quot;Marketplace Tax &mdash; Full Guide&quot; below for details.</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ MARKETPLACE TAX - FULL GUIDE ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Marketplace Tax &mdash; Full Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="tax-why"
              icon={<HelpCircle className="h-4 w-4 text-emerald-600" />}
              title="Why Marketplace Orders Handle Tax Differently"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When a customer buys through a <strong>marketplace channel</strong> (Shop App, Facebook, TikTok), Shopify is legally the &quot;marketplace facilitator.&quot; They collect sales tax from the customer and remit it directly to the state. Pirani never touches this tax money.</p>

              <p className="mt-2 font-medium">What happens in the payout:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Customer pays $134.75 + $8.10 tax = <strong>$142.85</strong></li>
                <li>Shopify takes their processing fee (~$4.94)</li>
                <li>Payout <strong>charge</strong> = $137.91 (includes tax, minus fees)</li>
                <li>Payout <strong>tax_adjustment</strong> = -$8.10 (Shopify deducts the tax they&apos;re remitting)</li>
                <li>Net deposit to bank = $129.81 (subtotal minus fees)</li>
              </ol>

              <Tip variant="warning">
                <p>The charge and tax_adjustment <strong>often land on different payouts</strong>. The charge might be on Monday&apos;s payout, and the tax deduction on Wednesday&apos;s. This is normal Shopify behavior.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-vs-direct"
              icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
              title="Marketplace Orders vs Direct Website Orders"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left"></th>
                      <th className="border p-2 text-left">Direct Website (pirani.life)</th>
                      <th className="border p-2 text-left">Marketplace (Shop App, FB, TikTok)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-2 font-medium">Who collects tax?</td><td className="border p-2">Pirani (you)</td><td className="border p-2">Shopify (marketplace facilitator)</td></tr>
                    <tr><td className="border p-2 font-medium">Who remits tax?</td><td className="border p-2">Pirani (you)</td><td className="border p-2">Shopify</td></tr>
                    <tr><td className="border p-2 font-medium">Taxable in NetSuite?</td><td className="border p-2 text-green-700 font-semibold">Yes &mdash; NS calculates tax</td><td className="border p-2 text-red-700 font-semibold">No &mdash; push as non-taxable</td></tr>
                    <tr><td className="border p-2 font-medium">Tax GL account</td><td className="border p-2">Sales Tax Payable (liability)</td><td className="border p-2">Marketplace Tax Pass-Through</td></tr>
                    <tr><td className="border p-2 font-medium">Payout has tax_adjustment?</td><td className="border p-2">No</td><td className="border p-2">Yes (negative debit)</td></tr>
                    <tr><td className="border p-2 font-medium">Order Source Mapping</td><td className="border p-2">Taxable = Yes</td><td className="border p-2">Taxable = No</td></tr>
                  </tbody>
                </table>
              </div>

              <Tip variant="info">
                <p>This is NOT about whether the customer&apos;s state has nexus. It&apos;s about <strong>who is responsible for remitting the tax</strong>. Marketplace = Shopify remits. Direct = Pirani remits.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-wrong-way"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              title="What Goes Wrong if Marketplace Orders Are Taxable in NS"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">If a marketplace order is pushed as <strong>taxable</strong> in NetSuite:</p>

              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>NS calculates tax (e.g., $8.10) and posts it to <strong>Sales Tax Payable</strong></li>
                <li>Meanwhile, Shopify deducts $8.10 as a tax_adjustment in the payout</li>
                <li>The tax_adjustment goes to the <strong>Marketplace Tax Pass-Through</strong> GL (a different account)</li>
                <li>Now you have $8.10 sitting in Sales Tax Payable that <strong>will never be relieved</strong>, because Shopify already remitted the tax &mdash; you don&apos;t owe it</li>
                <li>And the Pass-Through GL has a -$8.10 with no offsetting credit</li>
              </ol>

              <Tip variant="warning">
                <p><strong>Both accounts drift over time.</strong> Sales Tax Payable grows with phantom liabilities you don&apos;t owe, and the Pass-Through GL accumulates unmatched debits. This is why marketplace orders must ALWAYS be non-taxable in NS.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-correct-flow"
              icon={<ShieldCheck className="h-4 w-4 text-green-600" />}
              title="Correct GL Flow for Marketplace Orders"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When set up correctly, the marketplace tax creates a clean pass-through that nets to $0:</p>

              <p className="font-medium mt-3 mb-1">Step 1: Cash Sale is pushed as non-taxable</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Product lines: $134.75 &rarr; Revenue</li>
                <li>&quot;Marketplace Tax&quot; line item: $8.10 &rarr; <strong>credits</strong> Pass-Through GL</li>
                <li>CS total: $142.85 (matches what customer paid)</li>
              </ul>

              <p className="font-medium mt-3 mb-1">Step 2: Payout deposit includes the tax_adjustment</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Charge: $137.91 (= $142.85 - $4.94 fee)</li>
                <li>Tax adjustment: -$8.10 &rarr; <strong>debits</strong> Pass-Through GL</li>
              </ul>

              <p className="font-medium mt-3 mb-1">Net result:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Pass-Through GL: +$8.10 (from CS) - $8.10 (from deposit) = <strong>$0</strong></li>
                <li>Revenue: $134.75 (correct &mdash; the actual sale amount)</li>
                <li>Sales Tax Payable: untouched (correct &mdash; you don&apos;t owe this tax)</li>
              </ul>

              <Tip variant="success">
                <p>Even when the charge and tax_adjustment are on different payouts (which is common), the Pass-Through GL self-clears over time. At month-end, any small residual balance is just timing from recent orders.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-ns-setup"
              icon={<FileText className="h-4 w-4 text-emerald-600" />}
              title="NetSuite Setup Required (One-Time)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3">Before marketplace tax handling works automatically, these need to be set up in NetSuite:</p>

              <div className="space-y-4">
                <Step number={1} title="Create GL Account: Marketplace Tax Pass-Through">
                  <p>Type: <strong>Other Current Liability</strong>. This is where marketplace tax flows in (from the CS line) and out (from the deposit tax_adjustment). It should net to ~$0 over time.</p>
                </Step>
                <Step number={2} title="Create Non-Inventory Item: Marketplace Tax">
                  <p>Create a non-inventory item called &quot;Marketplace Tax&quot; that posts to the Pass-Through GL account. This item gets added as an extra line on marketplace cash sales.</p>
                </Step>
                <Step number={3} title="Configure Order Source Mappings">
                  <p>In the web app Settings &rarr; Order Source Mappings, set <strong>Taxable = No</strong> for all marketplace sources: Shop App, Facebook, TikTok, etc. Leave your direct website source as Taxable = Yes.</p>
                </Step>
                <Step number={4} title="Provide IDs to the web app">
                  <p>The web app needs the NS account ID for the Pass-Through GL and the NS item ID for the &quot;Marketplace Tax&quot; item so it can automatically add the tax line when pushing marketplace orders.</p>
                </Step>
              </div>

              <Tip variant="info">
                <p>This is a one-time setup. Once configured, marketplace orders will automatically push as non-taxable with the tax pass-through line, and the GL will self-balance.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-source-mappings"
              icon={<Tag className="h-4 w-4 text-emerald-600" />}
              title="Order Source Mapping &amp; Taxable Settings"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">Go to <strong>Settings &rarr; Order Source Mappings</strong> to view and configure source mappings. Each mapping controls how orders from that source are handled:</p>

              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Source</th>
                      <th className="border p-2 text-left">Type</th>
                      <th className="border p-2 text-left">Taxable in NS?</th>
                      <th className="border p-2 text-left">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-2">Online Store (web)</td><td className="border p-2">Direct</td><td className="border p-2 text-green-700 font-semibold">Yes</td><td className="border p-2">Pirani collects &amp; remits tax</td></tr>
                    <tr><td className="border p-2">Shop App (3890849)</td><td className="border p-2">Marketplace</td><td className="border p-2 text-red-700 font-semibold">No</td><td className="border p-2">Shopify remits tax</td></tr>
                    <tr><td className="border p-2">Facebook (2329312)</td><td className="border p-2">Marketplace</td><td className="border p-2 text-red-700 font-semibold">No</td><td className="border p-2">Shopify remits tax</td></tr>
                    <tr><td className="border p-2">TikTok</td><td className="border p-2">Marketplace</td><td className="border p-2 text-red-700 font-semibold">No</td><td className="border p-2">Shopify remits tax</td></tr>
                    <tr><td className="border p-2">Draft Orders</td><td className="border p-2">Direct</td><td className="border p-2 text-green-700 font-semibold">Yes</td><td className="border p-2">Pirani collects &amp; remits tax</td></tr>
                  </tbody>
                </table>
              </div>

              <Tip variant="warning">
                <p>If a source is not mapped, orders from that source <strong>cannot be pushed</strong> to NetSuite. Make sure all active sources have a mapping configured.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="tax-why-not-alternatives"
              icon={<HelpCircle className="h-4 w-4 text-slate-500" />}
              title="Why Not Just [X]? — Alternatives We Considered"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3 font-medium">We evaluated several approaches before settling on the line-item pass-through. Here&apos;s why each alternative doesn&apos;t work:</p>

              <div className="space-y-4">
                <div className="border-l-4 border-red-300 pl-3">
                  <p className="font-medium text-red-800">&quot;Just push tax adjustments to the same Sales Tax Payable account&quot;</p>
                  <p className="text-sm mt-1">We have <strong>separate liability accounts per state</strong> (NC=210, FL=435, SC=473, etc.). NS calculates tax to the correct state account, but the tax_adjustment in the payout has no state info &mdash; it&apos;s just a lump sum. We&apos;d have to guess which state account to post to, and getting it wrong inflates one state&apos;s liability while deflating another.</p>
                </div>

                <div className="border-l-4 border-red-300 pl-3">
                  <p className="font-medium text-red-800">&quot;Do a monthly journal entry to correct the drift&quot;</p>
                  <p className="text-sm mt-1">Same per-state problem. The JE would need to break down each tax_adjustment by state to move the right amount from each state&apos;s Sales Tax Payable to the offset account. Shopify doesn&apos;t give us state-level breakdowns on tax adjustments, making this manual and error-prone every month.</p>
                </div>

                <div className="border-l-4 border-red-300 pl-3">
                  <p className="font-medium text-red-800">&quot;Let NS calculate tax and just ignore the tax adjustments&quot;</p>
                  <p className="text-sm mt-1">The tax adjustments are real money being deducted from the payout. Ignoring them means the deposit total won&apos;t match the bank deposit, and the state liability accounts grow with tax that Shopify already remitted &mdash; you&apos;d be paying tax twice.</p>
                </div>

                <div className="border-l-4 border-red-300 pl-3">
                  <p className="font-medium text-red-800">&quot;Push marketplace orders as taxable and send tax adjustments to E-Com Tax Offset&quot;</p>
                  <p className="text-sm mt-1">Tax goes to state-specific Sales Tax Payable, but the offset goes to a single E-Com Tax Offset account. The state accounts accumulate phantom liabilities that never get relieved, and the offset account accumulates unmatched debits. Both drift indefinitely.</p>
                </div>

                <div className="border-l-4 border-green-400 pl-3">
                  <p className="font-medium text-green-800">Winner: &quot;Non-taxable CS + Marketplace Tax line item + Pass-Through GL&quot;</p>
                  <p className="text-sm mt-1">No state-specific accounts involved. All marketplace tax flows through <strong>one</strong> pass-through GL. The CS line credits it, the deposit tax_adjustment debits it, and it nets to $0 over time regardless of state. No monthly JE, no manual work, fully automated.</p>
                </div>
              </div>

              <Tip variant="info">
                <p>The key insight: marketplace tax should never touch your state Sales Tax Payable accounts because <strong>Shopify remits that tax, not you</strong>. By pushing non-taxable with a pass-through line, the tax stays completely separate from your actual tax obligations.</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ MERGING & SPLITTING ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-indigo-600" />
            Merging &amp; Splitting Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="merging"
              icon={<GitMerge className="h-4 w-4 text-indigo-600" />}
              title="How to Merge Transactions"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-3">Use merge when multiple Shopify payout transactions should map to a single NetSuite cash sale (e.g., Order Editing splits within the same payout).</p>
              <div className="space-y-4">
                <Step number={1} title="Select transactions to merge">
                  <p>Check the checkboxes on 2 or more transactions. A merge alert bar will appear above the table.</p>
                </Step>
                <Step number={2} title="Click Merge Selected">
                  <p>The merge dialog opens showing all selected transactions.</p>
                </Step>
                <Step number={3} title="Choose the target (to keep)">
                  <p>Select the transaction that should be kept. Usually this is the one with the NetSuite ID. The others will be deleted after their amounts are combined into the target.</p>
                </Step>
                <Step number={4} title="Check the match indicator">
                  <p>The dialog shows whether the combined amount will match NetSuite:</p>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    <li><strong className="text-green-600">Green check:</strong> Combined amount matches NS &mdash; safe to merge</li>
                    <li><strong className="text-red-600">Red X:</strong> Combined amount does NOT match NS &mdash; merging may not fix the problem</li>
                  </ul>
                </Step>
                <Step number={5} title="Confirm merge">
                  <p>If amounts match, click &quot;Merge Transactions.&quot; If they do not match, a confirmation dialog will ask if you are sure.</p>
                </Step>
              </div>
              <Tip variant="warning">
                <p><strong>Only merge transactions in the same payout.</strong> Merging transactions from different payouts would break deposit totals.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="splitting"
              icon={<GitMerge className="h-4 w-4 text-orange-600" />}
              title="How to Split Transactions"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>Use split when a single Shopify payout transaction needs to map to multiple NetSuite transactions. This is rare but can happen with combined orders.</p>
              <div className="space-y-4 mt-3">
                <Step number={1} title="Click the split icon on a transaction row">
                  <p>The split dialog opens with the original transaction details.</p>
                </Step>
                <Step number={2} title="Define the split amounts">
                  <p>Enter the amounts for each part. The parts must add up to the original total.</p>
                </Step>
                <Step number={3} title="Save the split">
                  <p>The original transaction is kept as a parent, and child transactions are created for each part. Each child can then be matched to its own NS transaction.</p>
                </Step>
              </div>
            </FaqItem>

            <FaqItem
              id="drag-drop"
              icon={<GitMerge className="h-4 w-4 text-blue-600" />}
              title="Reassigning NetSuite IDs (Drag &amp; Drop)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>If a NetSuite ID was matched to the wrong Shopify transaction, you can drag it to the correct one:</p>
              <div className="space-y-4 mt-3">
                <Step number={1} title="Grab the NS ID">
                  <p>Click and hold the NetSuite ID/name on the transaction that has the wrong match.</p>
                </Step>
                <Step number={2} title="Drag to the correct transaction">
                  <p>Drop it onto the target transaction row. The NS ID will move from the source to the target.</p>
                </Step>
              </div>
              <p className="mt-2">You can also manually add a NS ID using the &quot;+&quot; button, or delete one using the trash icon.</p>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ SPLIT PAYMENTS ACROSS PAYOUTS ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Split Payments Across Payouts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="split-payments"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              title="SOP: Order Split Across Multiple Payouts (Gift Cards, Shopify Pay, Order Editing)"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">Sometimes Shopify splits a single order across <strong>two or even three</strong> separate payouts. This can happen with:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li><strong>Gift card + credit card:</strong> The gift card portion and credit card portion land in different payouts</li>
                <li><strong>Order Editing:</strong> Products added/removed after purchase create additional captures in later payouts</li>
                <li><strong>Marketplace tax:</strong> The tax adjustment can land in a completely different payout than the charge</li>
                <li><strong>Shopify Pay timing differences:</strong> Payment processing delays split the order</li>
              </ul>

              <p className="font-medium mb-2">How to identify:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Search for the order number in the payout search bar &mdash; it will show <strong>&quot;Found order in N payouts&quot;</strong> with the amounts in each</li>
                <li>A charge in one payout has an NS match but a large amount mismatch</li>
                <li>Another payout has a charge for the same order with no NS match</li>
              </ul>

              <p className="font-medium mb-2">Workflow using Process Marketplace Order:</p>
              <div className="space-y-4">
                <Step number={1} title="Open the payout with the NS cash sale">
                  <p>Find the transaction with the matched cash sale. Click the marketplace order icon.</p>
                </Step>
                <Step number={2} title="Run the full workflow">
                  <p>Click <strong>&quot;Run All&quot;</strong>. This deletes the cash sale, edits the sales order (adding tax if applicable), creates an invoice for the full order amount, and creates a payment for this payout&apos;s amount.</p>
                </Step>
                <Step number={3} title="Process remaining payouts">
                  <p>Open each other payout containing this order. Click the marketplace order icon. Since the invoice already exists, it will skip straight to <strong>Create Payment</strong> for that payout&apos;s amount. The invoice balance decreases with each payment until fully paid.</p>
                </Step>
              </div>

              <Tip variant="info">
                <p><strong>Real example:</strong> Order #77655 ($165.11 total) spans 3 payouts: $15.00 credit (gift card) in payout A, $150.11 charge (credit card) in payout B, $9.36 tax debit in payout C. Process the $150.11 payout first (creates invoice), then process the $15.00 payout (creates second payment). The tax adjustment is handled via dropdown assignment to E-Com Tax Offset.</p>
              </Tip>

              <Tip variant="warning">
                <p>This is unavoidable when Shopify splits payments. Each payout becomes its own NetSuite deposit, so each must have its own payment entry against the shared invoice. The tax line on the sales order is automatically found across all payouts (or fetched from Shopify if the payout hasn&apos;t been imported yet).</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ ACTIVITY LOG ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-600" />
            Activity Log &amp; Tracking Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="activity-log"
              icon={<ClipboardList className="h-4 w-4 text-teal-600" />}
              title="Using the Activity Log"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>Every change made to payout transactions is logged. To view the log:</p>
              <div className="space-y-4 mt-3">
                <Step number={1} title="Open a payout's transactions">
                  <p>Click &quot;View Transactions&quot; on any payout.</p>
                </Step>
                <Step number={2} title="Click &quot;Activity Log&quot;">
                  <p>The button is in the top-right corner of the transactions dialog. A panel opens showing all recorded changes.</p>
                </Step>
              </div>

              <p className="mt-3 font-medium">Actions that are logged:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Merges:</strong> Which transactions were merged, before/after amounts</li>
                <li><strong>Splits:</strong> Original amount and resulting parts</li>
                <li><strong>NS ID changes:</strong> Adding, removing, or reassigning NetSuite IDs</li>
                <li><strong>Dropdown changes:</strong> Amount, Fee, and Other Fees description selections</li>
                <li><strong>Include/Exclude toggles:</strong> When a transaction is included or excluded from the NS deposit</li>
              </ul>

              <Tip variant="info">
                <p>Use the activity log to understand what changes have been made to a payout before pushing to NetSuite, or to troubleshoot why amounts look different than expected.</p>
              </Tip>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ DEPOSIT CREATION ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            NetSuite Deposit Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="deposit-structure"
              icon={<DollarSign className="h-4 w-4 text-green-600" />}
              title="How NetSuite Deposits Are Built"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When you click &quot;Push to NS,&quot; a deposit is created in NetSuite with two sections:</p>

              <p className="font-medium mt-3">Payment Items (cashback section):</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Transactions with a NetSuite cash sale, refund, or payment ID</li>
                <li>These reference the actual NS transaction by internal ID</li>
                <li>Amount comes from the NS transaction</li>
              </ul>

              <p className="font-medium mt-3">Other Items (other deposits section):</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Transactions with <strong>dropdown assignments</strong> (amount, fee, or other fees descriptions)</li>
                <li>Transactions that do NOT have a NS ID</li>
                <li>Each maps to a GL account based on the dropdown selection</li>
                <li>Standard fees (from transactions with NS IDs) are also included here</li>
              </ul>

              <p className="font-medium mt-3">Match Status Badges:</p>
              <p className="ml-2">Each payout in the list shows a status badge:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong className="text-green-600">Matched</strong> &mdash; All transactions have NS IDs and amounts match. Ready to push.</li>
                <li><strong className="text-orange-600">Mismatch (N missing)</strong> &mdash; Some transactions are missing NS IDs or amounts don&apos;t match. Review before pushing.</li>
              </ul>

              <p className="font-medium mt-3">Large Payout Batching:</p>
              <p className="ml-2">Payouts with more than 1,500 transactions are automatically split into multiple deposits (batches of 1,500). A progress bar shows &quot;Creating deposit 2 of 5...&quot; with deposit IDs as they are created. Each batch is saved to the database immediately, so if a batch fails you can retry without losing progress. Each batch typically takes 1-3 minutes depending on server load.</p>

              <p className="font-medium mt-3">Pre-Push Validation:</p>
              <p className="ml-2">Before creating the deposit, the system validates all transaction IDs against NetSuite. If any IDs no longer exist (deleted in NS) or are already deposited, you will be blocked with a detailed error showing which transactions need to be fixed.</p>

              <Tip variant="warning">
                <p>Make sure a transaction does not have <strong>both</strong> a NS ID and an amount dropdown, or it will be double-counted in the deposit (once as a payment item, once as an other item).</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="exclude-transactions"
              icon={<FileText className="h-4 w-4 text-gray-500" />}
              title="Excluding Transactions from Deposits"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>If a transaction should not be included in the NetSuite deposit:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                <li>Use the <strong>&quot;Ignore&quot;</strong> option in the amount dropdown</li>
                <li>Or toggle the include/exclude setting on the transaction</li>
              </ul>
              <p className="mt-2">Excluded transactions will not appear in the deposit&apos;s payment items or other items, and will not count toward the summary totals.</p>
            </FaqItem>
          </div>
        </CardContent>
      </Card>

      {/* ============ DISPUTES & CHARGEBACKS ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-red-600" />
            Disputes &amp; Chargebacks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="disputes-overview"
              icon={<ShieldCheck className="h-4 w-4 text-red-500" />}
              title="How Disputes Work"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When a customer disputes a charge with their bank, Shopify creates <strong>dispute</strong> transactions in the payout. These do not require any new NetSuite transactions &mdash; they flow through the deposit as &quot;other&quot; items mapped to a single GL account.</p>

              <p className="font-medium mt-3 mb-2">What Appears in the Payout:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Payout Line</th>
                      <th className="border p-2 text-left">Amount</th>
                      <th className="border p-2 text-left">What It Means</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="border p-2 font-mono">dispute (negative)</td><td className="border p-2">e.g. -$49.11</td><td className="border p-2">Lost dispute &mdash; Shopify clawed back the original charge amount</td></tr>
                    <tr><td className="border p-2 font-mono">dispute fee</td><td className="border p-2">$15.00</td><td className="border p-2">Per-dispute fee charged by Shopify</td></tr>
                    <tr><td className="border p-2 font-mono">dispute (positive)</td><td className="border p-2">e.g. +$41.94</td><td className="border p-2">Won dispute &mdash; money returned to you</td></tr>
                    <tr><td className="border p-2 font-mono">chargeback_protection credit</td><td className="border p-2">e.g. +$64.11</td><td className="border p-2">Shopify reimburses you for a lost dispute (amount + fee)</td></tr>
                    <tr><td className="border p-2 font-mono">chargeback_protection debit</td><td className="border p-2">e.g. -$56.94</td><td className="border p-2">Claws back protection payout after you win (no longer needed)</td></tr>
                  </tbody>
                </table>
              </div>
            </FaqItem>

            <FaqItem
              id="disputes-setup"
              icon={<ClipboardList className="h-4 w-4 text-red-500" />}
              title="Setting Up Dispute Handling"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="font-medium mb-2">One-time setup:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>Create a <strong>Disputes GL account</strong> in NetSuite (expense account).</li>
                <li>In Settings &gt; Payout Mappings, create a <strong>&quot;Shopify Disputes&quot;</strong> mapping pointing to that NS account ID.</li>
                <li>In Settings &gt; Auto-Assign Rules, create two rules:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li><code>type = dispute</code> &rarr; Shopify Disputes</li>
                    <li><code>adjustmentReason = chargeback_protection</code> &rarr; Shopify Disputes</li>
                  </ul>
                </li>
              </ol>

              <Tip variant="info">
                <p>All dispute lines go to the same account. Losses increase the balance, wins and chargeback protection offset it. The account balance shows your net dispute exposure over time.</p>
              </Tip>
            </FaqItem>

            <FaqItem
              id="disputes-won"
              icon={<ShieldCheck className="h-4 w-4 text-green-600" />}
              title="Won Disputes &mdash; Important Warning"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="mb-2">When you win a dispute, the money comes back as a <strong>positive</strong> dispute line. The app may auto-match it to the original Cash Sale in NetSuite because it shares the same Shopify order ID.</p>

              <Tip variant="warning">
                <p><strong>Do not</strong> leave the NS Cash Sale ID on a won dispute. The Cash Sale was already deposited in the original payout &mdash; re-depositing it would double-count the cash. Clear the NS ID and assign the &quot;Shopify Disputes&quot; dropdown instead.</p>
              </Tip>

              <p className="mt-2">The correct flow for a won dispute:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Clear the auto-assigned NS Cash Sale ID</li>
                <li>Assign the &quot;Shopify Disputes&quot; dropdown</li>
                <li>The positive amount offsets previous losses in the Disputes GL account</li>
              </ol>
            </FaqItem>

          </div>
        </CardContent>
      </Card>

      {/* ============ TROUBLESHOOTING ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-slate-600" />
            Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">

            <FaqItem
              id="troubleshoot-mismatch"
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              title="Charges Mismatch but Everything Looks Right"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="font-medium mb-2">Check these common causes:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li><strong>Order Editing splits:</strong> Look for orders with multiple transactions (grouped rows with &quot;2 transactions&quot; label). These need to be merged.</li>
                <li><strong>Marketplace sales tax:</strong> Tax credits/debits may not have been assigned to a GL account via dropdown yet.</li>
                <li><strong>Excluded transactions:</strong> A transaction may have been accidentally excluded. Check for any that show as ignored.</li>
                <li><strong>Missing NS matches:</strong> Some transactions may not have been matched yet. Try &quot;Get Missing NS Transactions&quot; again.</li>
                <li><strong>Bookkeeper changes:</strong> Check the Activity Log to see if any merges, splits, or reassignments were made that might explain the discrepancy.</li>
              </ol>
            </FaqItem>

            <FaqItem
              id="troubleshoot-deposit-amount"
              icon={<DollarSign className="h-4 w-4 text-red-500" />}
              title="NS Deposit Amount Does Not Match Payout Amount"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p className="font-medium mb-2">The deposit total should equal the Shopify payout total. If it does not:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li><strong>Double-counted transactions:</strong> Check if any transaction has both a NS ID AND an amount dropdown assigned. Remove the dropdown if so.</li>
                <li><strong>Missing fee assignments:</strong> Fees from non-order transactions may need dropdown assignments to appear in the deposit.</li>
                <li><strong>Shipping labels:</strong> Shipping label debits need to be assigned to the &quot;Shipping Label&quot; dropdown (account 513).</li>
                <li><strong>Unassigned credits/debits:</strong> All non-order transactions (credits, debits, disputes) need dropdown assignments or they will be missing from the deposit.</li>
              </ol>
            </FaqItem>

            <FaqItem
              id="troubleshoot-missing-orders"
              icon={<HelpCircle className="h-4 w-4 text-slate-500" />}
              title="Orders Not Showing Order Names"
              expandedFaq={expandedFaq}
              setExpandedFaq={setExpandedFaq}
            >
              <p>If transactions show order IDs but no order names (like &quot;#77277&quot;):</p>
              <ol className="list-decimal list-inside space-y-2 ml-2 mt-2">
                <li>Click <strong>&quot;Import Missing Orders&quot;</strong> in the filter bar</li>
                <li>This fetches order details from Shopify and links them to payout transactions</li>
                <li>After import, order names, source info, and tags will be populated</li>
              </ol>
            </FaqItem>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
