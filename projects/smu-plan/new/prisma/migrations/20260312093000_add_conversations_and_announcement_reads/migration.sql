-- Add announcement read timestamp to users
ALTER TABLE "User" ADD COLUMN "lastReadAnnouncementAt" DATETIME;

-- Create conversation history table
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "messagesJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Conversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Conversation_userId_updatedAt_idx"
  ON "Conversation"("userId", "updatedAt");
