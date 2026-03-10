ALTER TABLE "EmailVerification" ADD COLUMN "requestId" TEXT;

CREATE INDEX "EmailVerification_email_purpose_requestId_usedAt_expiresAt_idx"
ON "EmailVerification"("email", "purpose", "requestId", "usedAt", "expiresAt");

CREATE INDEX "EmailVerification_requestId_idx"
ON "EmailVerification"("requestId");
