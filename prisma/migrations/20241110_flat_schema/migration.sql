-- CreateTable
CREATE TABLE "OrderLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyOrderNumber" INTEGER,
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT,
    "currency" TEXT NOT NULL,
    "orderCreatedAt" DATETIME NOT NULL,
    "orderUpdatedAt" DATETIME,
    "orderSubtotal" REAL,
    "orderTax" REAL,
    "orderShipping" REAL,
    "orderDiscount" REAL,
    "orderTotal" REAL,
    "netsuiteSalesOrderId" TEXT,
    "netsuiteSalesOrderName" TEXT,
    "netsuiteCashSaleId" TEXT,
    "netsuiteCashSaleName" TEXT,
    "netsuiteRefundId" TEXT,
    "netsuiteRefundName" TEXT,
    "netsuiteDepositId" TEXT,
    "shopifyPayoutId" TEXT,
    "shopifyPayoutStatus" TEXT,
    "expectedPayoutAmount" REAL,
    "actualDepositAmount" REAL,
    "varianceAmount" REAL,
    "depositCreatedAt" DATETIME,
    "syncedShopifyAt" DATETIME,
    "syncedNetsuiteAt" DATETIME,
    "status" TEXT,
    "reconciliationStatus" TEXT,
    "paymentGatewayNames" TEXT,
    "shippingLines" TEXT,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "shippingAddress" TEXT,
    "lineItemId" TEXT NOT NULL,
    "lineItemSku" TEXT,
    "lineItemName" TEXT,
    "lineItemQuantity" INTEGER,
    "lineItemPrice" REAL,
    "lineItemTotal" REAL,
    "lineItemNet" REAL,
    "lineItemMetadata" TEXT,
    "isDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_shopifyOrderId_lineItemId_key" ON "OrderLine"("shopifyOrderId", "lineItemId");

-- CreateIndex
CREATE INDEX "OrderLine_shopifyPayoutId_idx" ON "OrderLine"("shopifyPayoutId");

-- CreateIndex
CREATE INDEX "OrderLine_netsuiteDepositId_idx" ON "OrderLine"("netsuiteDepositId");

-- CreateIndex
CREATE INDEX "OrderLine_status_idx" ON "OrderLine"("status");
