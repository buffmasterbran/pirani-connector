'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpCircle, ChevronRight } from 'lucide-react'

export function HelpSection() {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Help & FAQ</h2>
        <p className="text-slate-600">Common questions and guidance for using the Shopify to NetSuite connector.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* FAQ Item: Shopify Tax Handling */}
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === 'tax-handling' ? null : 'tax-handling')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={`h-5 w-5 text-slate-500 transition-transform ${
                      expandedFaq === 'tax-handling' ? 'transform rotate-90' : ''
                    }`}
                  />
                  <span className="font-semibold text-slate-800">
                    Shopify Tax Adjustments
                  </span>
                </div>
              </button>
              {expandedFaq === 'tax-handling' && (
                <div className="px-4 pb-4 pt-0 border-t bg-gray-50">
                  <div className="pt-4 space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="font-medium mb-2">Understanding Shopify Tax Handling:</p>
                      <p>
                        When Shopify Pay processes an order, they charge tax to the customer regardless of your tax settings because Shopify handles tax collection and remittance. This tax amount is then <strong>deducted from your payout</strong> as a pass-through - meaning you never actually receive the tax money.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium mb-2">What happens when an order is cancelled?</p>
                      <p>
                        If an order is cancelled, Shopify will <strong>refund the tax</strong> to the customer. This creates a tax adjustment in your payout that needs to be properly categorized.
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                      <p className="font-medium text-blue-900 mb-1">Recommendation:</p>
                      <p className="text-blue-800">
                        All tax adjustments should be set to <strong>&quot;Shopify Tax Adjustment&quot;</strong> in the dropdown. This ensures proper categorization in NetSuite and maintains accurate accounting records.
                      </p>
                      <p className="text-blue-800 mt-2 text-xs">
                        <strong>Note:</strong> This is a recommendation, not a requirement. You can still choose other options if needed for your specific use case.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* FAQ Item: Split Shopify Pay Payments */}
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === 'split-payments' ? null : 'split-payments')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={`h-5 w-5 text-slate-500 transition-transform ${
                      expandedFaq === 'split-payments' ? 'transform rotate-90' : ''
                    }`}
                  />
                  <span className="font-semibold text-slate-800">
                    Split Shopify Pay Payments Across Multiple Payouts
                  </span>
                </div>
              </button>
              {expandedFaq === 'split-payments' && (
                <div className="px-4 pb-4 pt-0 border-t bg-gray-50">
                  <div className="pt-4 space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="font-medium mb-2">When Shopify Pay payments span multiple payouts:</p>
                      <p>
                        In some cases, Shopify Pay may split a single order&apos;s payment across <strong>two separate payouts</strong>. This typically happens when there are timing differences or payment processing delays.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium mb-2">Required NetSuite workflow:</p>
                      <ol className="list-decimal list-inside space-y-2 ml-2">
                        <li>
                          <strong>Delete the Cash Sale:</strong> The original cash sale created for the order must be deleted in NetSuite.
                        </li>
                        <li>
                          <strong>Invoice the Sales Order:</strong> Convert the sales order to an invoice instead of using a cash sale.
                        </li>
                        <li>
                          <strong>Match Payments:</strong> Apply payment matching to link the split payments from both payouts to the invoiced sales order.
                        </li>
                      </ol>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                      <p className="font-medium text-yellow-900 mb-1">Important:</p>
                      <p className="text-yellow-800">
                        This workflow <strong>only applies</strong> when a Shopify Pay payment is split across <strong>2 payouts</strong>. For single-payout payments, use the standard cash sale workflow.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Placeholder for future FAQs */}
            <div className="text-center py-8 text-slate-400 text-sm">
              More help topics coming soon...
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
