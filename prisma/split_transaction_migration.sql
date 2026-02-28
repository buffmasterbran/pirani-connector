ALTER TABLE "PayoutTransaction" ADD COLUMN "parentTransactionId" TEXT
  REFERENCES "PayoutTransaction"("id") ON DELETE CASCADE;
CREATE INDEX "PayoutTransaction_parentTransactionId_idx"
  ON "PayoutTransaction"("parentTransactionId");
