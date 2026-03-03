# Implementation Plan: AI Backend Architecture + Hand-written OIDC Provider

## Overview

Two features to implement:
- **Feature A**: AI Backend — CLIProxyAPI → New API → nanyee.de 三层架构
- **Feature B**: OIDC Provider — nanyee.de 作为 IdP，手写 OIDC 端点（jose + Prisma）

---

## Feature A: AI Backend Architecture

### A1. Deployment Configuration (infra, not code)

This is primarily ops work on the OVH VPS. The plan documents (`ai_backend_plan.md`) cover deployment steps well. Code changes needed in nanyee.de are minimal.

### A2. Code Changes in nanyee.de

#### A2.1 Fix ProviderKey Priority Issue

**Problem**: `selector.ts:16-26` — ProviderKey table takes priority over `AI_API_KEY` env var. If the production database has any active ProviderKey rows, `.env` changes alone won't switch the AI backend.

**Solution**: When switching to New API, the admin should either:
1. Disable all existing ProviderKey rows (set status = "disabled"), OR
2. We add a `.env` flag `AI_FORCE_ENV_KEY=true` that bypasses the DB lookup

**Implementation**: Add `AI_FORCE_ENV_KEY` support to `src/lib/keys/selector.ts`:

```typescript
// At the top of selectProviderKey():
if (process.env.AI_FORCE_ENV_KEY === "true" && AI_API_KEY_FALLBACK) {
  return { id: "env-fallback", apiKey: AI_API_KEY_FALLBACK };
}
```

**Files**: `src/lib/keys/selector.ts`

#### A2.2 Make AVAILABLE_MODELS Configurable

**Problem**: `client.ts:15-20` hardcodes LongCat model names. When New API does model mapping, these names must match.

**Solution**: Read from env var with fallback to current defaults.

```typescript
// src/lib/ai/client.ts
const MODELS_FROM_ENV = process.env.AI_AVAILABLE_MODELS; // comma-separated
export const AVAILABLE_MODELS = MODELS_FROM_ENV
  ? MODELS_FROM_ENV.split(",").map(s => s.trim())
  : ["LongCat-Flash-Chat", "LongCat-Flash-Thinking", ...];
```

**Files**: `src/lib/ai/client.ts`

**Note**: The `ModelId` type becomes `string` instead of a const tuple union, since models are now dynamic. Callers that use `ModelId` must be updated.

#### A2.3 Update .env.example

Add missing keys:

```
AI_API_KEY="sk-xxx"
AI_FORCE_ENV_KEY="false"
AI_AVAILABLE_MODELS=""
```

**Files**: `.env.example`

#### A2.4 Summary of Feature A Code Changes

| File | Change |
|:---|:---|
| `src/lib/keys/selector.ts` | Add `AI_FORCE_ENV_KEY` bypass at top of `selectProviderKey()` |
| `src/lib/ai/client.ts` | Make `AVAILABLE_MODELS` env-configurable, relax `ModelId` type |
| `.env.example` | Add `AI_API_KEY`, `AI_FORCE_ENV_KEY`, `AI_AVAILABLE_MODELS` |
| Callers of `ModelId` type | Update if needed (search for `ModelId` usages) |

---

## Feature B: Hand-written OIDC Provider

### Architecture Decision

Use existing `jose` library (already a dependency) to hand-write a minimal OIDC Authorization Code Flow. No new npm dependencies needed.

Key design choices:
- **RS256** asymmetric signing for `id_token` (OIDC spec requires asymmetric for third-party verification)
- **JWKS endpoint** exposing the public key
- **Authorization Code Flow** only (no implicit, no client credentials)
- **Prisma + SQLite** for storing OAuth clients, authorization codes, and tokens
- **Independent OIDC session** — reuse nanyee.de's existing login session (access_token cookie) to identify the user during `/authorize`, but issue separate OIDC tokens
- **PKCE support** for public clients (CloudMail on Workers)

### B1. Prisma Schema — New Models

Add to `prisma/schema.prisma`:

```prisma
// ═══════════════════════════════════════
// OAuth / OIDC
// ═══════════════════════════════════════

model OAuthClient {
  id            String   @id @default(cuid())
  clientId      String   @unique
  clientSecret  String?                   // bcrypt hash; null for public clients (PKCE)
  name          String                    // Display name: "CloudMail 邮箱"
  redirectUris  String                    // JSON array: ["https://mail.nanyee.de/..."]
  grants        String   @default("[\"authorization_code\"]")
  scopes        String   @default("[\"openid\",\"profile\",\"email\"]")
  createdAt     DateTime @default(now())
}

model OidcCode {
  id              String    @id @default(cuid())
  code            String    @unique
  clientId        String
  userId          String
  redirectUri     String
  scope           String
  codeChallenge   String?                 // PKCE
  codeChallengeMethod String?             // "S256"
  expiresAt       DateTime
  consumedAt      DateTime?
  createdAt       DateTime  @default(now())

  @@index([code])
  @@index([expiresAt])
}

model OidcToken {
  id            String    @id @default(cuid())
  accessToken   String    @unique
  tokenType     String    @default("Bearer")
  clientId      String
  userId        String
  scope         String
  expiresAt     DateTime
  createdAt     DateTime  @default(now())

  @@index([accessToken])
  @@index([expiresAt])
}
```

**Design notes**:
- `OidcCode` stores authorization codes (10-minute TTL, single-use via `consumedAt`)
- `OidcToken` stores OIDC access tokens (for `/userinfo` endpoint verification)
- No refresh token for OIDC — clients re-authorize when needed
- `id_token` is a signed JWT, stateless, not stored in DB

**Files**: `prisma/schema.prisma`

### B2. RSA Key Pair Management

Generate and store an RSA-2048 key pair for signing `id_token` JWTs.

**File**: `src/lib/oidc/keys.ts`

```
- On first startup, generate RSA-2048 key pair
- Store in file system: `.oidc-keys/private.pem` + `.oidc-keys/public.pem`
- Or store as env vars: OIDC_RSA_PRIVATE_KEY / OIDC_RSA_PUBLIC_KEY
- Export helpers: getPrivateKey(), getPublicKey(), getJWKS()
- JWKS format: { keys: [{ kty: "RSA", kid: "...", n: "...", e: "...", use: "sig", alg: "RS256" }] }
```

**Implementation approach**:
- Use `crypto.generateKeyPairSync("rsa", ...)` for generation
- Use `jose.importPKCS8` / `jose.importSPKI` for jose-compatible key objects
- Use `jose.exportJWK` to produce JWKS format
- `kid` = SHA-256 thumbprint of the public key (first 8 chars)

### B3. OIDC Endpoints

#### B3.1 Discovery — `GET /.well-known/openid-configuration`

**File**: `src/app/.well-known/openid-configuration/route.ts`

Returns static JSON:
```json
{
  "issuer": "https://nanyee.de",
  "authorization_endpoint": "https://nanyee.de/api/oauth/authorize",
  "token_endpoint": "https://nanyee.de/api/oauth/token",
  "userinfo_endpoint": "https://nanyee.de/api/oauth/userinfo",
  "jwks_uri": "https://nanyee.de/api/oauth/jwks",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "claims_supported": ["sub", "username", "email", "nickname", "role"],
  "code_challenge_methods_supported": ["S256"]
}
```

#### B3.2 JWKS — `GET /api/oauth/jwks`

**File**: `src/app/api/oauth/jwks/route.ts`

Returns the RSA public key in JWK Set format. Uses `getJWKS()` from `keys.ts`.

#### B3.3 Authorize — `GET /api/oauth/authorize`

**File**: `src/app/api/oauth/authorize/route.ts`

Flow:
1. Parse query params: `client_id`, `redirect_uri`, `response_type`, `scope`, `state`, `code_challenge`, `code_challenge_method`
2. Validate `client_id` exists in `OAuthClient` table
3. Validate `redirect_uri` matches registered URIs
4. Validate `response_type` === `"code"`
5. Check user is logged in (read `access_token` cookie → `verifyAccessToken`)
   - If not logged in → redirect to `/login?next=/api/oauth/authorize?...` (preserve all query params)
6. If logged in → redirect to `/oauth/consent?...` (consent page) with all params + `userId`

#### B3.4 Consent Page — `/oauth/consent`

**File**: `src/app/oauth/consent/page.tsx` (Client Component)

UI:
- Shows: "[App Name] 想要访问你的 nanyee.de 账户"
- Shows requested scopes in human-readable form
- Shows current user info (username, avatar)
- [允许] button → POST to `/api/oauth/authorize/confirm`
- [拒绝] button → redirect back to client with `error=access_denied`

#### B3.5 Authorize Confirm — `POST /api/oauth/authorize/confirm`

**File**: `src/app/api/oauth/authorize/confirm/route.ts`

Flow:
1. Verify user is logged in
2. Validate all params again (client_id, redirect_uri, etc.)
3. Generate random authorization code (32 bytes, hex)
4. Store in `OidcCode` table (TTL: 10 minutes)
5. Redirect to `redirect_uri?code=xxx&state=yyy`

#### B3.6 Token — `POST /api/oauth/token`

**File**: `src/app/api/oauth/token/route.ts`

Flow:
1. Parse body: `grant_type`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`
2. Validate `grant_type` === `"authorization_code"`
3. Look up `OidcCode` by `code`
4. Verify not expired, not consumed
5. Verify `client_id` matches
6. Verify `redirect_uri` matches
7. If client has `clientSecret` → verify with bcrypt
8. If PKCE → verify `code_verifier` against stored `code_challenge` (SHA-256)
9. Mark code as consumed (`consumedAt = now()`)
10. Generate OIDC access token (random 32 bytes hex), store in `OidcToken` (TTL: 1 hour)
11. Sign `id_token` JWT (RS256) with claims: `sub`, `aud` (client_id), `iss`, `iat`, `exp`, `nonce` (if provided)
12. Return: `{ access_token, token_type: "Bearer", expires_in: 3600, id_token }`

#### B3.7 UserInfo — `GET /api/oauth/userinfo`

**File**: `src/app/api/oauth/userinfo/route.ts`

Flow:
1. Extract Bearer token from `Authorization` header
2. Look up `OidcToken` by `accessToken`
3. Verify not expired
4. Look up `User` by `userId` from token
5. Return claims based on scope:
   - `openid` → `{ sub: userId }`
   - `profile` → `+ { username, nickname, role }`
   - `email` → `+ { email }`

### B4. Consent Page Styles

**File**: `src/app/oauth/consent/page.module.css`

Follow existing neo-brutalism design system (same as login page).

### B5. Seed Data — Pre-register OAuth Clients

**File**: `prisma/seed.ts` (modify existing)

Add two client registrations:
1. `cloudmail` — for CloudMail (public client, PKCE, no client_secret)
2. `newapi` — for New API (confidential client, with client_secret)

### B6. Login Redirect Support

**Current state**: Login page at `/login` redirects to `/` after success.

**Change**: Support `?next=` query param to redirect back to OAuth authorize endpoint after login.

**Files**: `src/app/(main)/login/page.tsx` or wherever login form lives — add `next` param handling.

### B7. Token Cleanup (Housekeeping)

Add a cleanup function to periodically delete expired `OidcCode` and `OidcToken` rows.

**File**: `src/lib/oidc/cleanup.ts`

Can be called from existing cron health check endpoint or a new scheduled route.

### B8. .env Changes

New env vars:
```
# OIDC Provider
OIDC_RSA_PRIVATE_KEY=""    # PEM format, or auto-generated
OIDC_RSA_PUBLIC_KEY=""     # PEM format, or auto-generated
```

**Files**: `.env.example`

---

## Feature B (External): CloudMail OIDC Client

### CM1. New Routes

**File**: CloudMail `src/server/routes/auth.ts`

Add two new routes:

1. `GET /api/auth/oidc/login`
   - Generate `state` (random UUID) + `code_verifier` (PKCE)
   - Store `state` + `code_verifier` in cookie (short-lived, httpOnly)
   - Redirect to `https://nanyee.de/api/oauth/authorize?client_id=cloudmail&redirect_uri=...&response_type=code&scope=openid+profile+email&state=...&code_challenge=...&code_challenge_method=S256`

2. `GET /api/auth/oidc/callback`
   - Verify `state` from cookie matches query param
   - Exchange `code` for tokens: POST `https://nanyee.de/api/oauth/token`
   - Verify `id_token` signature against JWKS (`https://nanyee.de/api/oauth/jwks`)
   - Extract `sub`, `username`, `email` from id_token claims
   - Find or create local user (D1) linked to `nanyee_sub`
   - Issue CloudMail JWT session
   - Redirect to frontend homepage

### CM2. Middleware Update

**File**: CloudMail `src/server/index.ts`

Ensure `/api/auth/oidc/*` routes are excluded from JWT auth middleware.

### CM3. Frontend Login Button

**File**: CloudMail `src/client/src/pages/Login.tsx`

Add a "使用 nanyee.de 登录" button:
```tsx
<a href="/api/auth/oidc/login" className="oidc-login-btn">
  使用 nanyee.de 登录
</a>
```

### CM4. D1 Schema Update

Add `nanveeSub` column to users table for OIDC-linked accounts:
```sql
ALTER TABLE users ADD COLUMN nanyee_sub TEXT;
CREATE UNIQUE INDEX idx_users_nanyee_sub ON users(nanyee_sub);
```

### CM5. Wrangler Config

**File**: CloudMail `wrangler.toml`

Add env vars:
```toml
[vars]
OIDC_CLIENT_ID = "cloudmail"
OIDC_ISSUER = "https://nanyee.de"
OIDC_REDIRECT_URI = "https://mail.nanyee.de/api/auth/oidc/callback"
```

---

## New API OIDC Configuration

New API has native OIDC support. No code changes — just fill in the admin UI:

| Setting | Value |
|:---|:---|
| OIDC Display Name | `nanyee.de` |
| Client ID | `newapi` |
| Client Secret | (generated, stored hashed in OAuthClient) |
| Authorization URL | `https://nanyee.de/api/oauth/authorize` |
| Token URL | `https://nanyee.de/api/oauth/token` |
| UserInfo URL | `https://nanyee.de/api/oauth/userinfo` |
| Scope | `openid profile email` |
| Username Claim | `username` |

---

## Execution Order

### Phase 1: Feature A (AI Backend) — Low risk, high impact

1. Add `AI_FORCE_ENV_KEY` to selector.ts
2. Make `AVAILABLE_MODELS` env-configurable in client.ts
3. Update `.env.example`
4. Deploy CLIProxyAPI + New API on VPS (ops)
5. Switch `.env` to point to New API

### Phase 2: Feature B (OIDC Provider) — nanyee.de side

1. Add Prisma schema (OAuthClient, OidcCode, OidcToken) + migrate
2. Implement RSA key management (`src/lib/oidc/keys.ts`)
3. Implement discovery endpoint (`/.well-known/openid-configuration`)
4. Implement JWKS endpoint (`/api/oauth/jwks`)
5. Implement authorize endpoint (`/api/oauth/authorize`)
6. Implement consent page (`/oauth/consent`)
7. Implement authorize confirm endpoint (`/api/oauth/authorize/confirm`)
8. Implement token endpoint (`/api/oauth/token`)
9. Implement userinfo endpoint (`/api/oauth/userinfo`)
10. Add login redirect support (`?next=` param)
11. Seed OAuth clients
12. Add token cleanup
13. Update `.env.example`

### Phase 3: Feature B (OIDC Clients) — External services

14. CloudMail: Add OIDC login/callback routes
15. CloudMail: Update middleware, frontend, D1 schema
16. New API: Configure OIDC in admin UI

---

## New Files Summary

| File | Purpose |
|:---|:---|
| `src/lib/oidc/keys.ts` | RSA key pair management + JWKS export |
| `src/lib/oidc/cleanup.ts` | Expired code/token cleanup |
| `src/app/.well-known/openid-configuration/route.ts` | OIDC Discovery |
| `src/app/api/oauth/jwks/route.ts` | JWKS endpoint |
| `src/app/api/oauth/authorize/route.ts` | Authorization endpoint |
| `src/app/api/oauth/authorize/confirm/route.ts` | Authorization confirm (POST) |
| `src/app/api/oauth/token/route.ts` | Token exchange |
| `src/app/api/oauth/userinfo/route.ts` | UserInfo endpoint |
| `src/app/oauth/consent/page.tsx` | Consent UI page |
| `src/app/oauth/consent/page.module.css` | Consent page styles |

## Modified Files Summary

| File | Change |
|:---|:---|
| `prisma/schema.prisma` | Add OAuthClient, OidcCode, OidcToken models |
| `prisma/seed.ts` | Add OAuth client seed data |
| `src/lib/keys/selector.ts` | Add AI_FORCE_ENV_KEY bypass |
| `src/lib/ai/client.ts` | Env-configurable AVAILABLE_MODELS |
| `.env.example` | Add AI_API_KEY, AI_FORCE_ENV_KEY, AI_AVAILABLE_MODELS, OIDC_RSA_* |
| Login page | Support `?next=` redirect param |

## Security Considerations

1. Authorization codes: single-use, 10-minute expiry, PKCE for public clients
2. Client secrets: bcrypt hashed in DB
3. id_token: RS256 signed, includes `aud` + `iss` + `exp` claims
4. Redirect URI: strict exact-match validation against registered URIs
5. State parameter: required, validated on callback to prevent CSRF
6. HTTPS: all production endpoints behind Cloudflare (already enforced)
7. No implicit flow: only authorization code grant
8. Token storage: OIDC access tokens are opaque random strings, not JWTs (can be revoked by deleting DB row)
