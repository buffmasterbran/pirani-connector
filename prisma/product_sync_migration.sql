-- Product Sync Migration
-- Creates enums, tables, indexes, and foreign keys for the product sync module

-- CreateEnum
CREATE TYPE "ProductSyncMatchStatus" AS ENUM ('matched', 'unmatched', 'multiple_matches', 'error');

-- CreateEnum
CREATE TYPE "ProductSyncStatus" AS ENUM ('pending', 'success', 'error', 'skipped');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('full', 'incremental', 'manual_single', 'manual_all');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'completed', 'completed_with_errors', 'failed');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('scheduled', 'manual');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ProductSyncStoreConfig" (
    "id" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeLabel" TEXT,
    "shopifyDomain" TEXT NOT NULL,
    "shopifyAccessTokenEncrypted" TEXT NOT NULL,
    "shopifyApiVersion" TEXT NOT NULL DEFAULT '2025-10',
    "netsuiteFlagFieldId" TEXT NOT NULL,
    "netsuitePriceLevelId" INTEGER NOT NULL,
    "netsuiteComparePriceLevelId" INTEGER,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "lowStockIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "includeNonInventory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSyncStoreConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSyncLocationMapping" (
    "id" TEXT NOT NULL,
    "storeConfigId" TEXT NOT NULL,
    "netsuiteLocationId" INTEGER NOT NULL,
    "netsuiteLocationName" TEXT,
    "shopifyLocationId" TEXT NOT NULL,
    "shopifyLocationName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSyncLocationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSyncMapping" (
    "id" TEXT NOT NULL,
    "storeConfigId" TEXT NOT NULL,
    "netsuiteItemId" INTEGER NOT NULL,
    "netsuiteSku" TEXT NOT NULL,
    "netsuiteName" TEXT,
    "netsuiteColor" TEXT,
    "netsuiteSize" TEXT,
    "netsuiteItemType" TEXT,
    "shopifyProductId" TEXT,
    "shopifyVariantId" TEXT,
    "shopifyInventoryItemId" TEXT,
    "shopifyProductTitle" TEXT,
    "shopifyProductHandle" TEXT,
    "matchStatus" "ProductSyncMatchStatus" NOT NULL DEFAULT 'unmatched',
    "lastSyncedPrice" DECIMAL(10,2),
    "lastSyncedComparePrice" DECIMAL(10,2),
    "lastSyncedQuantity" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'pending',
    "lastSyncError" TEXT,
    "netsuiteFlagValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSyncMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSyncLog" (
    "id" TEXT NOT NULL,
    "storeConfigId" TEXT,
    "syncType" "SyncType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "SyncRunStatus" NOT NULL DEFAULT 'running',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "itemsErrored" INTEGER NOT NULL DEFAULT 0,
    "priceUpdates" INTEGER NOT NULL DEFAULT 0,
    "quantityUpdates" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSyncJob" (
    "id" TEXT NOT NULL,
    "storeConfigId" TEXT NOT NULL,
    "jobType" "SyncJobType" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'pending',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSyncStoreConfig_shopifyDomain_key" ON "ProductSyncStoreConfig"("shopifyDomain");

-- CreateIndex
CREATE INDEX "ProductSyncLocationMapping_storeConfigId_idx" ON "ProductSyncLocationMapping"("storeConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSyncLocationMapping_storeConfigId_netsuiteLocationId_key" ON "ProductSyncLocationMapping"("storeConfigId", "netsuiteLocationId", "shopifyLocationId");

-- CreateIndex
CREATE INDEX "ProductSyncMapping_netsuiteSku_idx" ON "ProductSyncMapping"("netsuiteSku");

-- CreateIndex
CREATE INDEX "ProductSyncMapping_matchStatus_idx" ON "ProductSyncMapping"("matchStatus");

-- CreateIndex
CREATE INDEX "ProductSyncMapping_lastSyncStatus_idx" ON "ProductSyncMapping"("lastSyncStatus");

-- CreateIndex
CREATE INDEX "ProductSyncMapping_storeConfigId_idx" ON "ProductSyncMapping"("storeConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSyncMapping_storeConfigId_netsuiteSku_key" ON "ProductSyncMapping"("storeConfigId", "netsuiteSku");

-- CreateIndex
CREATE INDEX "ProductSyncLog_storeConfigId_idx" ON "ProductSyncLog"("storeConfigId");

-- CreateIndex
CREATE INDEX "ProductSyncLog_startedAt_idx" ON "ProductSyncLog"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "ProductSyncJob_storeConfigId_idx" ON "ProductSyncJob"("storeConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSyncJob_storeConfigId_jobType_key" ON "ProductSyncJob"("storeConfigId", "jobType");

-- AddForeignKey
ALTER TABLE "ProductSyncLocationMapping" ADD CONSTRAINT "ProductSyncLocationMapping_storeConfigId_fkey" FOREIGN KEY ("storeConfigId") REFERENCES "ProductSyncStoreConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSyncMapping" ADD CONSTRAINT "ProductSyncMapping_storeConfigId_fkey" FOREIGN KEY ("storeConfigId") REFERENCES "ProductSyncStoreConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSyncLog" ADD CONSTRAINT "ProductSyncLog_storeConfigId_fkey" FOREIGN KEY ("storeConfigId") REFERENCES "ProductSyncStoreConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSyncJob" ADD CONSTRAINT "ProductSyncJob_storeConfigId_fkey" FOREIGN KEY ("storeConfigId") REFERENCES "ProductSyncStoreConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSyncJob" ADD CONSTRAINT "ProductSyncJob_lastRunLogId_fkey" FOREIGN KEY ("lastRunLogId") REFERENCES "ProductSyncLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
