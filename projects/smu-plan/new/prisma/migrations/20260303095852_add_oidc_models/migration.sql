-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT NOT NULL,
    "grants" TEXT NOT NULL DEFAULT '["authorization_code"]',
    "scopes" TEXT NOT NULL DEFAULT '["openid","profile","email"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OidcCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "nonce" TEXT,
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OidcToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OidcCode_code_key" ON "OidcCode"("code");

-- CreateIndex
CREATE INDEX "OidcCode_code_idx" ON "OidcCode"("code");

-- CreateIndex
CREATE INDEX "OidcCode_expiresAt_idx" ON "OidcCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OidcToken_accessToken_key" ON "OidcToken"("accessToken");

-- CreateIndex
CREATE INDEX "OidcToken_accessToken_idx" ON "OidcToken"("accessToken");

-- CreateIndex
CREATE INDEX "OidcToken_expiresAt_idx" ON "OidcToken"("expiresAt");
