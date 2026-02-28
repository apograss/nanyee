CREATE TABLE IF NOT EXISTS "BbsTopic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "authorId" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT 0,
  "locked" BOOLEAN NOT NULL DEFAULT 0,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "lastReplyAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BbsTopic_category_idx" ON "BbsTopic"("category");
CREATE INDEX IF NOT EXISTS "BbsTopic_pinned_createdAt_idx" ON "BbsTopic"("pinned", "createdAt");
CREATE INDEX IF NOT EXISTS "BbsTopic_authorId_idx" ON "BbsTopic"("authorId");

CREATE TABLE IF NOT EXISTS "BbsReply" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "content" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("topicId") REFERENCES "BbsTopic"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "BbsReply_topicId_createdAt_idx" ON "BbsReply"("topicId", "createdAt");
CREATE INDEX IF NOT EXISTS "BbsReply_authorId_idx" ON "BbsReply"("authorId");
