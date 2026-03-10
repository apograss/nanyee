# Auth And OIDC Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair registration reliability, make mail sending lazy and cloudmail-inspired, add OIDC discovery, and align OAuth client definitions for NewAPI and Flarum.

**Architecture:** Introduce small pure helpers for verification mail config, OIDC discovery metadata, and OAuth client seeds so the behavior stays testable without route-level mocking. Then wire those helpers into the existing auth and OAuth routes.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, node:test, tsx

---

### Task 1: Add failing tests for mail/OIDC helpers

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/auth-oidc.test.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

**Step 1: Write the failing tests**

Add assertions for:
- verification mail config does not require a key at import time and can resolve from `RESEND_API_KEYS`
- OIDC discovery metadata points to the correct provider endpoints
- default OAuth client seeds include `newapi` and `flarum-chat`
- the KB hero test should stop pinning a stale exact title string

**Step 2: Run the targeted tests**

Run: `node --test --import tsx tests/auth-oidc.test.ts tests/wiki-admin-ui.test.ts`

Expected: FAIL because the helper modules or updated expectations do not yet exist.

### Task 2: Implement lazy verification mail sending

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/mail/resend.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/auth/register/challenges/route.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/auth/register/challenges/[id]/verify/route.ts`

**Step 1: Replace eager provider initialization**

- resolve mail config lazily
- support direct Resend fetch using one configured key
- expose a small helper to check whether verification mail is configured

**Step 2: Fix registration-related Chinese strings**

- replace mojibake in route messages and email subjects/bodies with clean Chinese

**Step 3: Re-run targeted tests**

Run: `node --test --import tsx tests/auth-oidc.test.ts tests/wiki-admin-ui.test.ts`

Expected: PASS for mail helper and KB expectation updates.

### Task 3: Add OIDC discovery and client seed helpers

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/oidc/config.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/oidc/clients.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/.well-known/openid-configuration/route.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/prisma/seed.ts`

**Step 1: Add pure helpers**

- build the OIDC discovery document from an issuer
- centralize default OAuth client definitions

**Step 2: Wire helpers into routes and seed**

- expose the discovery route
- align `newapi` redirect URI to `https://api.nanyee.de/oauth/oidc`
- keep `flarum-chat` seeded with a provisional callback

### Task 4: Verify flows and static checks

**Files:**
- Verify only

**Step 1: Targeted test run**

Run: `node --test --import tsx tests/auth-oidc.test.ts tests/wiki-admin-ui.test.ts`

**Step 2: Full test run**

Run: `node --test --import tsx tests/*.test.ts`

**Step 3: TypeScript**

Run: `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`

**Step 4: Runtime verification**

Run local checks for:
- `/api/auth/register/challenges` loading without mail secrets
- login/session flow
- `/.well-known/openid-configuration`
