-- TikTok Payout Reconciliation Migration
-- Run this against the production database to add TikTok payout tables.

CREATE TABLE IF NOT EXISTS "TikTokPayout" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" TEXT,
    "currency" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "netSales" DOUBLE PRECISION,
    "shipping" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "adjustments" DOUBLE PRECISION,
    "reserveAmount" DOUBLE PRECISION,
    "payableAmount" DOUBLE PRECISION,
    "payoutDate" TIMESTAMP(3),
    "netsuiteDepositId" TEXT,
    "pushedToNsBy" TEXT,
    "pushedToNsAt" TIMESTAMP(3),
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokPayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TikTokPayoutTransaction" (
    "id" TEXT NOT NULL,
    "tiktokPayoutId" TEXT NOT NULL,
    "tiktokOrderId" TEXT,
    "type" TEXT,
    "skuId" TEXT,
    "quantity" INTEGER,
    "productName" TEXT,
    "skuName" TEXT,
    "totalSettlementAmount" DOUBLE PRECISION,
    "grossSales" DOUBLE PRECISION,
    "grossSalesRefund" DOUBLE PRECISION,
    "sellerDiscount" DOUBLE PRECISION,
    "shippingAmount" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "transactionFee" DOUBLE PRECISION,
    "referralFee" DOUBLE PRECISION,
    "affiliateCommission" DOUBLE PRECISION,
    "adjustmentAmount" DOUBLE PRECISION,
    "adjustmentReason" TEXT,
    "customerPayment" DOUBLE PRECISION,
    "customerRefund" DOUBLE PRECISION,
    "orderCreatedDate" TIMESTAMP(3),
    "orderShipmentDate" TIMESTAMP(3),
    "orderDeliveryDate" TIMESTAMP(3),
    "shopifyOrderId" TEXT,
    "shopifyOrderName" TEXT,
    "netsuiteTransactionId" TEXT,
    "netsuiteTransactionName" TEXT,
    "netsuiteTransactionType" TEXT,
    "netsuiteAmount" DOUBLE PRECISION,
    "matchStatus" TEXT,
    "matchError" TEXT,
    "includeInNetSuite" BOOLEAN NOT NULL DEFAULT true,
    "amountDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TikTokPayoutTransaction_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TikTokPayout_paymentId_idx" ON "TikTokPayout"("paymentId");
CREATE INDEX IF NOT EXISTS "TikTokPayout_uploadBatchId_idx" ON "TikTokPayout"("uploadBatchId");
CREATE INDEX IF NOT EXISTS "TikTokPayoutTransaction_tiktokPayoutId_idx" ON "TikTokPayoutTransaction"("tiktokPayoutId");
CREATE INDEX IF NOT EXISTS "TikTokPayoutTransaction_tiktokOrderId_idx" ON "TikTokPayoutTransaction"("tiktokOrderId");
CREATE INDEX IF NOT EXISTS "TikTokPayoutTransaction_shopifyOrderId_idx" ON "TikTokPayoutTransaction"("shopifyOrderId");
CREATE INDEX IF NOT EXISTS "TikTokPayoutTransaction_matchStatus_idx" ON "TikTokPayoutTransaction"("matchStatus");

-- Foreign key
ALTER TABLE "TikTokPayoutTransaction" ADD CONSTRAINT "TikTokPayoutTransaction_tiktokPayoutId_fkey"
    FOREIGN KEY ("tiktokPayoutId") REFERENCES "TikTokPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
