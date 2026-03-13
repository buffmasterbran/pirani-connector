"use client"

import { Check, X } from "lucide-react"
import type { GroupedFeeItem, TransactionItem } from "./useTransactionData"

interface TransactionSummaryProps {
  totalCharges: number
  totalRefunds: number
  totalAdjustments: number
  totalMarketplaceSalesTax: number
  totalFees: number
  totalShopifyAmount: number
  nsCharges: number
  nsRefunds: number
  nsAdjustments: number
  nsFees: number
  totalNetSuiteAmount: number
  currency: string
  hideSensitiveData: boolean
  groupedFeeItems: GroupedFeeItem[]
  includedTransactionsForNetSuite: TransactionItem[]
  transactionsWithNS: TransactionItem[]
}

export function TransactionSummary({
  totalCharges,
  totalRefunds,
  totalAdjustments,
  totalMarketplaceSalesTax,
  totalFees,
  totalShopifyAmount,
  nsCharges,
  nsRefunds,
  nsAdjustments,
  nsFees,
  totalNetSuiteAmount,
  currency,
  hideSensitiveData,
  groupedFeeItems,
  includedTransactionsForNetSuite,
  transactionsWithNS,
}: TransactionSummaryProps) {
  // Calculate matches for each category
  const chargesMatch = Math.abs(totalCharges - nsCharges) < 0.01
  const refundsMatch = Math.abs(totalRefunds - nsRefunds) < 0.01
  const adjustmentsMatch = Math.abs(totalAdjustments - nsAdjustments) < 0.01

  // Compute itemized fee totals from groupedFeeItems (matches what the NS deposit will contain)
  const totalShopifyFeeItems = groupedFeeItems.reduce((sum, item) => sum + item.shopifyAmount, 0)
  const totalNetsuiteFeeItems = groupedFeeItems.reduce((sum, item) => sum + item.netsuiteAmount, 0)
  const feesMatch = groupedFeeItems.length > 0
    ? Math.abs(totalShopifyFeeItems - totalNetsuiteFeeItems) < 0.01
    : Math.abs(totalFees - nsFees) < 0.01

  // Create unified list of items to display (always show all items for alignment)
  // Show item if it appears in Shopify OR NetSuite to ensure alignment
  const summaryItems = [
    { label: 'Charges', shopify: totalCharges, netsuite: nsCharges, match: chargesMatch, showShopify: true, showNetSuite: nsCharges !== 0, isNegative: false },
    { label: 'Refunds', shopify: totalRefunds, netsuite: nsRefunds, match: refundsMatch, showShopify: totalRefunds !== 0, showNetSuite: nsRefunds !== 0, isNegative: true },
    { label: 'Adjustments', shopify: totalAdjustments, netsuite: nsAdjustments, match: adjustmentsMatch, showShopify: totalAdjustments !== 0, showNetSuite: nsAdjustments !== 0, isNegative: false },
    { label: 'Marketplace sales tax', shopify: totalMarketplaceSalesTax, netsuite: 0, match: true, showShopify: totalMarketplaceSalesTax !== 0, showNetSuite: false, isNegative: false },
    { label: 'Fees', shopify: totalFees, netsuite: nsFees, match: feesMatch, showShopify: totalFees !== 0, showNetSuite: nsFees !== 0, isNegative: true },
  ].filter(item => item.showShopify || item.showNetSuite) // Only show items that appear in at least one column

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Shopify Summary (Left) */}
      <div className="p-4 bg-white rounded-lg border">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Shopify</p>
          <p className="text-2xl font-bold">
            {hideSensitiveData ? (
              <span className="text-gray-500">{'••••••'}</span>
            ) : (
              `${currency} ${totalShopifyAmount.toFixed(2)}`
            )}
          </p>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Summary</p>
          <div className="space-y-2">
            {summaryItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                <span className="text-sm font-medium text-right min-w-[100px]">
                  {item.showShopify ? (
                    <span className={item.isNegative ? 'text-red-600' : ''}>
                      {hideSensitiveData ? (
                        <span className="text-gray-500">{'••••••'}</span>
                      ) : (
                        `${currency} ${item.shopify.toFixed(2)}`
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">{'\u2014'}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Column (Middle) */}
      <div className="p-4 bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <p className="text-2xl font-bold text-slate-700">
            {hideSensitiveData ? (
              <span className="text-gray-500">{'••••••'}</span>
            ) : Math.abs(totalNetSuiteAmount - totalShopifyAmount) < 0.01 ? (
              <span className="text-green-600">Matched</span>
            ) : (
              <span className="text-orange-600">Mismatch</span>
            )}
          </p>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Match Status</p>
          <div className="space-y-2">
            {summaryItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                <span className="text-right min-w-[100px] flex justify-end">
                  {!hideSensitiveData && item.showShopify && item.showNetSuite ? (
                    item.match ? (
                      <div className="flex items-center gap-1 text-green-600" title="Shopify matches NetSuite">
                        <Check className="h-4 w-4" />
                        <span className="text-xs font-medium">Match</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600" title="Shopify does not match NetSuite">
                        <X className="h-4 w-4" />
                        <span className="text-xs font-medium">Mismatch</span>
                      </div>
                    )
                  ) : (
                    <span className="text-gray-500 text-xs">{'\u2014'}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proposed NetSuite Summary (Right) */}
      <div className="p-4 bg-white rounded-lg border">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Proposed NetSuite</p>
          <p className={`text-2xl font-bold ${
            includedTransactionsForNetSuite.length > 0
              ? Math.abs(totalNetSuiteAmount - totalShopifyAmount) < 0.01
                ? 'text-green-600'
                : 'text-orange-600'
              : 'text-muted-foreground'
          }`}>
            {hideSensitiveData ? (
              <span className="text-gray-500">{'••••••'}</span>
            ) : includedTransactionsForNetSuite.length > 0 ? (
              `${currency} ${totalNetSuiteAmount.toFixed(2)}`
            ) : (
              '\u2014'
            )}
          </p>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Summary</p>
          <div className="space-y-2">
            {summaryItems.map((item, idx) => {
              // Special handling for Fees - show breakdown
              if (item.label === 'Fees' && groupedFeeItems.length > 0) {
                return (
                  <div key={idx}>
                    <div className="flex justify-between items-center min-h-[28px] py-0.5">
                      <span className="text-sm font-semibold text-slate-700 flex-1">{item.label}</span>
                      <span className={`text-sm font-medium text-right min-w-[100px] ${item.isNegative ? 'text-red-600' : ''}`}>
                        {item.showNetSuite ? (
                          hideSensitiveData ? (
                            <span className="text-gray-500">{'••••••'}</span>
                          ) : (
                            `${currency} ${item.netsuite.toFixed(2)}`
                          )
                        ) : (
                          <span className="text-slate-400">{'\u2014'}</span>
                        )}
                      </span>
                    </div>
                    {groupedFeeItems.map((feeItem, feeIdx) => (
                      <div key={`fee-${feeIdx}`} className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                        <span className="text-xs text-slate-500 flex-1">- {feeItem.description}</span>
                        <span className="text-xs font-medium text-red-600 text-right min-w-[100px]">
                          {hideSensitiveData ? (
                            <span className="text-gray-500">{'••••••'}</span>
                          ) : feeItem.netsuiteAmount > 0 ? (
                            `-${currency} ${feeItem.netsuiteAmount.toFixed(2)}`
                          ) : (
                            <span className="text-slate-400">{'\u2014'}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }

              // Regular items
              return (
                <div key={idx} className="flex justify-between items-center min-h-[28px] py-0.5">
                  <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                  <span className={`text-sm font-medium text-right min-w-[100px] ${item.isNegative ? 'text-red-600' : ''}`}>
                    {item.showNetSuite ? (
                      hideSensitiveData ? (
                        <span className="text-gray-500">{'••••••'}</span>
                      ) : (
                        `${currency} ${item.netsuite.toFixed(2)}`
                      )
                    ) : (
                      <span className="text-slate-400">{'\u2014'}</span>
                    )}
                  </span>
                </div>
              )
            })}
            {transactionsWithNS.length === 0 && summaryItems.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No transactions matched yet
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
