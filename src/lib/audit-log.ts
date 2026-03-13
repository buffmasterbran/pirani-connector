import { prisma } from './prisma'

/**
 * Log a transaction modification to the audit log.
 * Fire-and-forget — errors are logged but don't block the request.
 */
export function logTransactionChange(
  transactionId: string,
  payoutId: string,
  action: string,
  details?: Record<string, any>,
) {
  prisma.transactionAuditLog
    .create({
      data: { transactionId, payoutId, action, details: details ?? undefined },
    })
    .catch((err) => console.error('Audit log write failed:', err))
}
