"use client"

import { Check, X } from "lucide-react"
import type { GroupedFeeItem, TransactionItem } from "./useTransactionData"
import { hasDropdownAssignment } from "./types"

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
  // Deposit structure props
  paymentsTabTotal: number
  depositCashSalesTotal: number
  depositCashSalesCount: number
  depositRefundsTotal: number
  depositRefundsCount: number
  depositPaymentsTotal: number
  depositPaymentsCount: number
  cashBackTotal: number
  depositTotal: number
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
  paymentsTabTotal,
  depositCashSalesTotal,
  depositCashSalesCount,
  depositRefundsTotal,
  depositRefundsCount,
  depositPaymentsTotal,
  depositPaymentsCount,
  cashBackTotal,
  depositTotal,
}: TransactionSummaryProps) {
  // Shopify summary items (left column)
  const summaryItems = [
    { label: 'Charges', value: totalCharges, show: true, isNegative: false },
    { label: 'Refunds', value: totalRefunds, show: totalRefunds !== 0, isNegative: true },
    { label: 'Adjustments', value: totalAdjustments, show: totalAdjustments !== 0, isNegative: false },
    { label: 'Marketplace sales tax', value: totalMarketplaceSalesTax, show: totalMarketplaceSalesTax !== 0, isNegative: false },
    { label: 'Fees', value: totalFees, show: totalFees !== 0, isNegative: true },
  ].filter(item => item.show)

  // Match calculations
  const depositMatch = Math.abs(depositTotal - totalShopifyAmount) < 0.01
  const missingNS = includedTransactionsForNetSuite.filter(
    t => !t.netsuiteTransactionId && t.type !== 'payout' && !hasDropdownAssignment(t)
  )
  const allMapped = missingNS.length === 0
  const overallMatch = depositMatch && allMapped

  const hasData = includedTransactionsForNetSuite.length > 0

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
                  <span className={item.isNegative ? 'text-red-600' : ''}>
                    {hideSensitiveData ? (
                      <span className="text-gray-500">{'••••••'}</span>
                    ) : (
                      `${currency} ${item.value.toFixed(2)}`
                    )}
                  </span>
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
            ) : overallMatch ? (
              <span className="text-green-600">Matched</span>
            ) : (
              <span className="text-orange-600">Mismatch</span>
            )}
          </p>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Match Status</p>
          <div className="space-y-2">
            {/* Deposit Total match */}
            <div className="flex justify-between items-center min-h-[28px] py-0.5">
              <span className="text-sm text-slate-600 flex-1">Deposit Total</span>
              <span className="text-right min-w-[100px] flex justify-end">
                {!hideSensitiveData && hasData ? (
                  depositMatch ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <Check className="h-4 w-4" />
                      <span className="text-xs font-medium">Match</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-600">
                      <X className="h-4 w-4" />
                      <span className="text-xs font-medium">Mismatch</span>
                    </div>
                  )
                ) : (
                  <span className="text-gray-500 text-xs">{'\u2014'}</span>
                )}
              </span>
            </div>

            {/* Payments info */}
            <div className="flex justify-between items-center min-h-[28px] py-0.5">
              <span className="text-sm text-slate-600 flex-1">Payments</span>
              <span className="text-right min-w-[100px] flex justify-end">
                {!hideSensitiveData && hasData ? (
                  <span className="text-xs text-slate-500">
                    {depositCashSalesCount + depositRefundsCount + depositPaymentsCount} items
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs">{'\u2014'}</span>
                )}
              </span>
            </div>

            {/* Cash Back info */}
            <div className="flex justify-between items-center min-h-[28px] py-0.5">
              <span className="text-sm text-slate-600 flex-1">Cash Back</span>
              <span className="text-right min-w-[100px] flex justify-end">
                {!hideSensitiveData && hasData ? (
                  <span className="text-xs text-slate-500">
                    {groupedFeeItems.length} items
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs">{'\u2014'}</span>
                )}
              </span>
            </div>

            {/* Missing NS IDs warning */}
            {!hideSensitiveData && missingNS.length > 0 && (
              <div className="flex justify-between items-center min-h-[28px] py-0.5">
                <span className="text-sm text-orange-600 flex-1">Missing NS IDs</span>
                <span className="text-right min-w-[100px] flex justify-end">
                  <div className="flex items-center gap-1 text-orange-600">
                    <X className="h-4 w-4" />
                    <span className="text-xs font-medium">{missingNS.length}</span>
                  </div>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Proposed NetSuite Deposit (Right) */}
      <div className="p-4 bg-white rounded-lg border">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Proposed NetSuite Deposit</p>
          <p className={`text-2xl font-bold ${
            hasData
              ? overallMatch ? 'text-green-600' : 'text-orange-600'
              : 'text-muted-foreground'
          }`}>
            {hideSensitiveData ? (
              <span className="text-gray-500">{'••••••'}</span>
            ) : hasData ? (
              `${currency} ${depositTotal.toFixed(2)}`
            ) : (
              '\u2014'
            )}
          </p>
        </div>

        <div className="border-t pt-4">
          {/* Payments Section */}
          <div className="mb-3">
            <div className="flex justify-between items-center min-h-[28px] py-0.5">
              <span className="text-sm font-semibold text-slate-700 flex-1">Payments</span>
              <span className="text-sm font-medium text-right min-w-[100px]">
                {hideSensitiveData ? (
                  <span className="text-gray-500">{'••••••'}</span>
                ) : hasData ? (
                  `${currency} ${paymentsTabTotal.toFixed(2)}`
                ) : (
                  <span className="text-slate-400">{'\u2014'}</span>
                )}
              </span>
            </div>

            {/* Cash Sales */}
            {(depositCashSalesCount > 0 || hasData) && (
              <div className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                <span className="text-xs text-slate-500 flex-1">Cash Sales ({depositCashSalesCount})</span>
                <span className="text-xs font-medium text-right min-w-[100px]">
                  {hideSensitiveData ? (
                    <span className="text-gray-500">{'••••••'}</span>
                  ) : depositCashSalesTotal !== 0 ? (
                    `${currency} ${depositCashSalesTotal.toFixed(2)}`
                  ) : (
                    <span className="text-slate-400">{'\u2014'}</span>
                  )}
                </span>
              </div>
            )}

            {/* Refunds */}
            {depositRefundsCount > 0 && (
              <div className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                <span className="text-xs text-slate-500 flex-1">Refunds ({depositRefundsCount})</span>
                <span className="text-xs font-medium text-red-600 text-right min-w-[100px]">
                  {hideSensitiveData ? (
                    <span className="text-gray-500">{'••••••'}</span>
                  ) : (
                    `${currency} ${depositRefundsTotal.toFixed(2)}`
                  )}
                </span>
              </div>
            )}

            {/* Customer Payments */}
            {depositPaymentsCount > 0 && (
              <div className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                <span className="text-xs text-slate-500 flex-1">Customer Payments ({depositPaymentsCount})</span>
                <span className="text-xs font-medium text-right min-w-[100px]">
                  {hideSensitiveData ? (
                    <span className="text-gray-500">{'••••••'}</span>
                  ) : (
                    `${currency} ${depositPaymentsTotal.toFixed(2)}`
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Cash Back Section */}
          <div>
            <div className="flex justify-between items-center min-h-[28px] py-0.5">
              <span className="text-sm font-semibold text-slate-700 flex-1">Cash Back</span>
              <span className="text-sm font-medium text-red-600 text-right min-w-[100px]">
                {hideSensitiveData ? (
                  <span className="text-gray-500">{'••••••'}</span>
                ) : hasData ? (
                  `${currency} ${cashBackTotal.toFixed(2)}`
                ) : (
                  <span className="text-slate-400">{'\u2014'}</span>
                )}
              </span>
            </div>

            {/* Cash Back sub-items from groupedFeeItems */}
            {groupedFeeItems.map((feeItem, feeIdx) => (
              <div key={`fee-${feeIdx}`} className="flex justify-between items-center min-h-[24px] py-0.5 pl-4">
                <span className="text-xs text-slate-500 flex-1">- {feeItem.description}</span>
                <span className="text-xs font-medium text-red-600 text-right min-w-[100px]">
                  {hideSensitiveData ? (
                    <span className="text-gray-500">{'••••••'}</span>
                  ) : feeItem.netsuiteAmount !== 0 ? (
                    `-${currency} ${Math.abs(feeItem.netsuiteAmount).toFixed(2)}`
                  ) : (
                    <span className="text-slate-400">{'\u2014'}</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {transactionsWithNS.length === 0 && !hasData && (
            <p className="text-sm text-muted-foreground italic">
              No transactions matched yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
