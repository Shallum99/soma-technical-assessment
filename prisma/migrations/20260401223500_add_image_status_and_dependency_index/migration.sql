-- AlterTable
ALTER TABLE "Todo" ADD COLUMN "imageStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Todo" ADD COLUMN "imageError" TEXT;

-- Backfill existing rows so the status matches the current data.
UPDATE "Todo"
SET "imageStatus" = CASE
  WHEN "imageUrl" IS NOT NULL THEN 'ready'
  ELSE 'unavailable'
END;

-- CreateIndex
CREATE INDEX "TodoDependency_dependsOnId_idx" ON "TodoDependency"("dependsOnId");
