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

  // Load order source mappings to resolve friendly names to appId/sourceName
  const orderSourceMappings = await prisma.orderSourceMapping.findMany({
    where: { isActive: true },
  })

  const transactions = await prisma.payoutTransaction.findMany({
    where: { payoutId },
    include: { orderLine: { select: { sourceName: true, appId: true } } },
  })

  let applied = 0
  let skipped = 0
  const details: AutoAssignResult['details'] = []

  for (const txn of transactions) {
    // Skip if any dropdown already assigned
    if (txn.amountDescription) {
      skipped++
      continue
    }

    // Skip excluded transactions
    if (txn.includeInNetSuite === false) {
      continue
    }

    // Find first matching rule (priority order)
    const matchedRule = rules.find(rule => matchesRule(rule, txn, orderSourceMappings))

    if (matchedRule) {
      // Store the same value format as manual dropdown selection:
      // netsuiteId if available, otherwise description
      const mapping = matchedRule.targetMapping
      const valueToStore = mapping.netsuiteId && mapping.netsuiteId.trim() !== ''
        ? mapping.netsuiteId
        : (mapping.description || null)

      if (!valueToStore) continue

      // Always write to amountDescription — same field the manual dropdown uses
      await prisma.payoutTransaction.update({
        where: { id: txn.id },
        data: { amountDescription: valueToStore },
      })

      applied++
      details.push({
        transactionId: txn.id,
        ruleName: matchedRule.name,
        field: 'amountDescription',
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
  txn: { type: string | null; adjustmentReason: string | null; orderLine?: { sourceName: string | null; appId: number | null } | null },
  orderSourceMappings: Array<{ appId: number | null; sourceName: string | null; friendlyName: string }>
): boolean {
  if (rule.conditionType && txn.type !== rule.conditionType) return false
  if (rule.conditionAdjustmentReason && txn.adjustmentReason !== rule.conditionAdjustmentReason) return false
  if (rule.conditionSourceName) {
    // conditionSourceName stores the friendlyName — resolve via order source mappings
    const matching = orderSourceMappings.filter(m => m.friendlyName === rule.conditionSourceName)
    const txnAppId = txn.orderLine?.appId
    const txnSourceName = txn.orderLine?.sourceName
    const sourceMatches = matching.some(m =>
      (m.appId && txnAppId && m.appId === txnAppId) ||
      (m.sourceName && txnSourceName && m.sourceName === txnSourceName)
    )
    if (!sourceMatches) return false
  }
  return true
}
