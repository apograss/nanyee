-- CreateTable
CREATE TABLE "EvalTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "smuAccount" TEXT NOT NULL,
    "smuPasswordEnc" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastRunStatus" TEXT,
    "lastRunLog" TEXT,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "totalEvaluated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EvalTask_userId_key" ON "EvalTask"("userId");

-- CreateIndex
CREATE INDEX "EvalTask_enabled_lastRunAt_idx" ON "EvalTask"("enabled", "lastRunAt");
