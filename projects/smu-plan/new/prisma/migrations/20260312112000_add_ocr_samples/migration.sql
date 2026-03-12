-- CreateTable
CREATE TABLE "OcrSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePage" TEXT NOT NULL,
    "imageBase64" TEXT NOT NULL,
    "correctedText" TEXT NOT NULL,
    "ocrText" TEXT,
    "userId" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OcrSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OcrSample_sourcePage_createdAt_idx" ON "OcrSample"("sourcePage", "createdAt");

-- CreateIndex
CREATE INDEX "OcrSample_userId_createdAt_idx" ON "OcrSample"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OcrSample_createdAt_idx" ON "OcrSample"("createdAt");
