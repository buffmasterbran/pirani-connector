import { prisma } from '@/lib/prisma'

interface AutoAssignResult {
  applied: number
  skipped: number
  details: Array<{ transactionId: string; ruleName: string; field: string }>
}

export async function runAutoAssignRules(payoutId: string): Promise<AutoAssignResult> {
  const rules = await prisma.autoAssignRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
    include: { targetMapping: true },
  })

  if (rules.length === 0) return { applied: 0, skipped: 0, details: [] }

  const transactions = await prisma.payoutTransaction.findMany({
    where: { payoutId },
    include: { orderLine: { select: { sourceName: true, appId: true } } },
  })

  let applied = 0
  let skipped = 0
  const details: AutoAssignResult['details'] = []

  for (const txn of transactions) {
    // Skip if any dropdown already assigned
    if (txn.amountDescription || txn.feeDescription || txn.otherFeesDescription) {
      skipped++
      continue
    }

    // Skip excluded transactions
    if (txn.includeInNetSuite === false) {
      continue
    }

    // Find first matching rule (priority order)
    const matchedRule = rules.find(rule => matchesRule(rule, txn))

    if (matchedRule) {
      // Store the same value format as manual dropdown selection:
      // netsuiteId if available, otherwise description
      const mapping = matchedRule.targetMapping
      const valueToStore = mapping.netsuiteId && mapping.netsuiteId.trim() !== ''
        ? mapping.netsuiteId
        : (mapping.description || null)

      if (!valueToStore) continue

      const updateData: Record<string, string> = {}
      updateData[matchedRule.targetField] = valueToStore

      await prisma.payoutTransaction.update({
        where: { id: txn.id },
        data: updateData,
      })

      applied++
      details.push({
        transactionId: txn.id,
        ruleName: matchedRule.name,
        field: matchedRule.targetField,
      })
    }
  }

  if (applied > 0) {
    console.log(`Auto-assign for payout ${payoutId}: applied ${applied}, skipped ${skipped}`)
  }

  return { applied, skipped, details }
}

function matchesRule(
  rule: { conditionType: string | null; conditionAdjustmentReason: string | null; conditionSourceName: string | null },
  txn: { type: string | null; adjustmentReason: string | null; orderLine?: { sourceName: string | null; appId: number | null } | null }
): boolean {
  if (rule.conditionType && txn.type !== rule.conditionType) return false
  if (rule.conditionAdjustmentReason && txn.adjustmentReason !== rule.conditionAdjustmentReason) return false
  if (rule.conditionSourceName) {
    const sourceName = txn.orderLine?.sourceName
    if (sourceName !== rule.conditionSourceName) return false
  }
  return true
}
