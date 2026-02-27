-- WebhookLog table: stores last 50 incoming webhook requests with full payloads
CREATE TABLE IF NOT EXISTS "WebhookLog" (
    "id" SERIAL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "responseStatus" INTEGER,
    "durationMs" INTEGER,
    "source" TEXT,
    "itemCount" INTEGER,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WebhookLog_endpoint_idx" ON "WebhookLog"("endpoint");
CREATE INDEX IF NOT EXISTS "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt" DESC);
