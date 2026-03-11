-- AlterTable
ALTER TABLE "Article" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Article" ADD COLUMN "pinnedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Article_isPinned_pinnedAt_publishedAt_idx" ON "Article"("isPinned", "pinnedAt", "publishedAt");
