# OAuth Registration And Nav Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make forum OAuth callback execution reliable, allow OAuth first-time registration without promoting password sign-up, and add an API link to the main-site nav.

**Architecture:** Keep the provider-side OIDC routes on `nanyee.de` unchanged, but harden the client integrations. Main-site changes stay in app code with tests. Forum-side changes are codified in deployment assets: a patched Flarum image plus explicit production settings updates.

**Tech Stack:** Next.js App Router, TypeScript, node:test, Flarum, MariaDB, Docker, PM2

---

### Task 1: Add failing tests for navigation normalization

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/site/nav.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/site-nav.test.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/Header.tsx`

**Step 1: Write the failing test**

Cover:
- default nav includes `https://api.nanyee.de`
- the API link is inserted after the forum link
- runtime normalization does not duplicate an existing API link

**Step 2: Run the targeted test**

Run: `node --test --import tsx tests/site-nav.test.ts`

Expected: FAIL because the nav helper does not exist yet.

### Task 2: Implement the main-site API nav link

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/site/nav.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/Header.tsx`

**Step 1: Write minimal implementation**

- move nav defaults into the helper
- normalize loaded nav settings by injecting the API link when missing

**Step 2: Re-run targeted test**

Run: `node --test --import tsx tests/site-nav.test.ts`

Expected: PASS

### Task 3: Codify the Flarum callback and locale patches

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/deploy/flarum/Dockerfile`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/deploy/flarum/forum-auth-tweaks.sql`

**Step 1: Patch the Flarum image**

- add `data-cfasync="false"` to the callback scripts used by auth and account linking
- patch Chinese locale strings so generic provider displays as `OAuth`

**Step 2: Add explicit production SQL**

- set `allow_sign_up = 1`
- set token/userinfo endpoints to `http://nanyee.de/...`
- set custom styling to hide local signup affordances

### Task 4: Deploy forum and setting changes

**Files:**
- Verify only

**Step 1: Build and restart the Flarum container**

Use the updated image and clear forum cache.

**Step 2: Apply SQL settings**

- allow sign-up for OAuth provisioning
- update endpoints
- apply UI suppression styling

**Step 3: Verify production forum behavior**

- callback popup returns a script with `data-cfasync="false"`
- homepage payload reports `allowSignUp: true`
- generic OAuth label reads `OAuth`

### Task 5: Run full verification

**Files:**
- Verify only

**Step 1: Local tests**

Run:
- `node --test --import tsx tests/site-nav.test.ts tests/auth-oidc.test.ts tests/ai-model-config.test.ts`
- `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`

**Step 2: Production checks**

Run:
- forum OAuth callback flow
- forum homepage payload inspection
- `https://api.nanyee.de/api/status`
- main-site homepage inspection for API nav
