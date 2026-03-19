import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Transaction, FeesDescriptionOption } from "./types"

interface DescriptionSelectProps {
  transaction: Transaction
  feesDescriptionOptions: FeesDescriptionOption[]
  loadingFeesOptions: boolean
  onToggleInclude?: (transactionId: string, include: boolean) => Promise<void>
}

interface AmountDescriptionSelectProps extends DescriptionSelectProps {
  onUpdateAmountDescription: (transactionId: string, description: string | null) => Promise<void>
}

interface FeeDescriptionSelectProps extends DescriptionSelectProps {
  onUpdateFeeDescription: (transactionId: string, description: string | null) => Promise<void>
}

interface OtherFeesDescriptionSelectProps extends DescriptionSelectProps {
  onUpdateOtherFeesDescription: (transactionId: string, description: string | null) => Promise<void>
}

// Shared logic for resolving the current select value from transaction description
function resolveSelectValue(
  description: string | null | undefined,
  includeInNetSuite: boolean | undefined,
  feesDescriptionOptions: FeesDescriptionOption[]
): string {
  if (includeInNetSuite === false) return '__ignore__'
  if (!description) return '__none__'

  const matchingOption = feesDescriptionOptions.find(opt => {
    if (opt.description && opt.description === description) return true
    if (opt.netsuiteId && opt.netsuiteId.trim() !== '' && opt.netsuiteId === description) return true
    return false
  })

  if (matchingOption) {
    if (matchingOption.netsuiteId && matchingOption.netsuiteId.trim() !== '') {
      return matchingOption.netsuiteId
    } else {
      return `opt_${matchingOption.id}_${matchingOption.description || 'unknown'}`
    }
  }

  return description
}

// Shared logic for handling value changes in description selects
async function handleDescriptionChange(
  value: string,
  transactionId: string,
  feesDescriptionOptions: FeesDescriptionOption[],
  includeInNetSuite: boolean | undefined,
  onUpdate: (transactionId: string, description: string | null) => Promise<void>,
  onToggleInclude?: (transactionId: string, include: boolean) => Promise<void>
) {
  if (value === '__ignore__') {
    if (onToggleInclude) {
      await onToggleInclude(String(transactionId), false)
    }
    await onUpdate(String(transactionId), null)
    return
  }

  if (includeInNetSuite === false && onToggleInclude) {
    await onToggleInclude(String(transactionId), true)
  }

  if (value === '__none__') {
    await onUpdate(String(transactionId), null)
    return
  }

  const selectedOption = feesDescriptionOptions.find(opt => {
    if (opt.netsuiteId && opt.netsuiteId.trim() !== '' && opt.netsuiteId === value) return true
    const expectedValue = `opt_${opt.id}_${opt.description || 'unknown'}`
    if (expectedValue === value) return true
    return false
  })

  if (!selectedOption) {
    console.warn('Selected option not found for value:', value)
    return
  }

  const valueToStore = selectedOption.netsuiteId && selectedOption.netsuiteId.trim() !== ''
    ? selectedOption.netsuiteId
    : (selectedOption.description || null)

  await onUpdate(String(transactionId), valueToStore)
}

function DescriptionSelectDropdown({
  selectKey,
  value,
  onValueChange,
  feesDescriptionOptions,
  loadingFeesOptions,
}: {
  selectKey: string
  value: string
  onValueChange: (value: string) => void
  feesDescriptionOptions: FeesDescriptionOption[]
  loadingFeesOptions: boolean
}) {
  return (
    <Select
      key={selectKey}
      value={value}
      onValueChange={onValueChange}
      disabled={loadingFeesOptions}
    >
      <SelectTrigger className="h-7 w-[140px] text-xs border border-gray-300">
        <SelectValue placeholder={loadingFeesOptions ? "Loading..." : "Select..."} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        <SelectItem value="__ignore__">Ignore</SelectItem>
        {feesDescriptionOptions.length === 0 && !loadingFeesOptions ? (
          <SelectItem value="__no_options__" disabled>No options available</SelectItem>
        ) : (
          feesDescriptionOptions.map((option) => {
            const optValue = option.netsuiteId && option.netsuiteId.trim() !== ''
              ? option.netsuiteId
              : `opt_${option.id}_${option.description || 'unknown'}`
            const display = option.description || option.netsuiteId || 'Unknown'
            return (
              <SelectItem key={option.id} value={optValue}>
                {display}
              </SelectItem>
            )
          })
        )}
      </SelectContent>
    </Select>
  )
}

export function AmountDescriptionSelect({
  transaction,
  feesDescriptionOptions,
  loadingFeesOptions,
  onUpdateAmountDescription,
  onToggleInclude,
}: AmountDescriptionSelectProps) {
  // Show value from whichever description field is populated (auto-assign may set any of them)
  const activeDescription = transaction.amountDescription || transaction.otherFeesDescription || transaction.feeDescription
  const value = resolveSelectValue(
    activeDescription,
    transaction.includeInNetSuite,
    feesDescriptionOptions
  )

  return (
    <DescriptionSelectDropdown
      selectKey={`amount-desc-${transaction.id}-${activeDescription || 'none'}`}
      value={value}
      onValueChange={async (val) => {
        await handleDescriptionChange(
          val,
          transaction.id,
          feesDescriptionOptions,
          transaction.includeInNetSuite,
          onUpdateAmountDescription,
          onToggleInclude
        )
      }}
      feesDescriptionOptions={feesDescriptionOptions}
      loadingFeesOptions={loadingFeesOptions}
    />
  )
}

export function FeeDescriptionSelect({
  transaction,
  feesDescriptionOptions,
  loadingFeesOptions,
  onUpdateFeeDescription,
  onToggleInclude,
}: FeeDescriptionSelectProps) {
  const value = resolveSelectValue(
    transaction.feeDescription,
    transaction.includeInNetSuite,
    feesDescriptionOptions
  )

  return (
    <DescriptionSelectDropdown
      selectKey={`fee-desc-${transaction.id}-${transaction.feeDescription || 'none'}`}
      value={value}
      onValueChange={async (val) => {
        await handleDescriptionChange(
          val,
          transaction.id,
          feesDescriptionOptions,
          transaction.includeInNetSuite,
          onUpdateFeeDescription,
          onToggleInclude
        )
      }}
      feesDescriptionOptions={feesDescriptionOptions}
      loadingFeesOptions={loadingFeesOptions}
    />
  )
}

export function OtherFeesDescriptionSelect({
  transaction,
  feesDescriptionOptions,
  loadingFeesOptions,
  onUpdateOtherFeesDescription,
  onToggleInclude,
}: OtherFeesDescriptionSelectProps) {
  const value = resolveSelectValue(
    transaction.otherFeesDescription,
    transaction.includeInNetSuite,
    feesDescriptionOptions
  )

  return (
    <DescriptionSelectDropdown
      selectKey={`other-fees-desc-${transaction.id}-${transaction.otherFeesDescription || 'none'}`}
      value={value}
      onValueChange={async (val) => {
        await handleDescriptionChange(
          val,
          transaction.id,
          feesDescriptionOptions,
          transaction.includeInNetSuite,
          onUpdateOtherFeesDescription,
          onToggleInclude
        )
      }}
      feesDescriptionOptions={feesDescriptionOptions}
      loadingFeesOptions={loadingFeesOptions}
    />
  )
}
