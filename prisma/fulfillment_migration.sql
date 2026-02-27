-- Fulfillment table: tracks Item Fulfillments synced from NetSuite to Shopify
CREATE TABLE IF NOT EXISTS "Fulfillment" (
    "id" SERIAL PRIMARY KEY,
    "shopifyOrderId" TEXT NOT NULL,
    "netsuiteSoId" TEXT,
    "netsuiteIfId" TEXT NOT NULL UNIQUE,
    "shopifyFulfillmentId" TEXT,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "shippedDate" TIMESTAMP(3),
    "lineItems" JSONB,
    "status" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Fulfillment_shopifyOrderId_idx" ON "Fulfillment"("shopifyOrderId");
CREATE INDEX IF NOT EXISTS "Fulfillment_netsuiteSoId_idx" ON "Fulfillment"("netsuiteSoId");
CREATE INDEX IF NOT EXISTS "Fulfillment_status_idx" ON "Fulfillment"("status");
