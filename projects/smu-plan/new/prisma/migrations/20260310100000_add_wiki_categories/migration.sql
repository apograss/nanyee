-- Add structured wiki categories and bind articles to category ids.

CREATE TABLE "WikiCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "icon" TEXT,
  "parentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WikiCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WikiCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WikiCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WikiCategory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WikiCategory_slug_key" ON "WikiCategory"("slug");
CREATE INDEX "WikiCategory_parentId_sortOrder_idx" ON "WikiCategory"("parentId", "sortOrder");

ALTER TABLE "Article" ADD COLUMN "categoryId" TEXT REFERENCES "WikiCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Article_categoryId_idx" ON "Article"("categoryId");
