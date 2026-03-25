import { NextResponse } from 'next/server'

/**
 * Converts a nullable Date to an ISO string, or returns null.
 * Eliminates the repeated `toISO` one-liner across API routes.
 */
export const toISO = (date: Date | null | undefined) => (date ? date.toISOString() : null)

/**
 * Standard error handler for API routes.
 * Logs the error and returns a JSON error response.
 */
export function handleApiError(error: unknown, context: string, status = 500): NextResponse {
  console.error(`[${context}]`, error)
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'
  return NextResponse.json({ error: message }, { status })
}
