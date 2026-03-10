# Maintenance, CloudMail, And Flarum Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put the main site into maintenance mode without breaking auth/OIDC, route verification emails through CloudMail, deploy Flarum on the VPS, and connect the clients to the main-site OIDC provider.

**Architecture:** Keep `nanyee.de` as the OIDC provider and auth authority. Add a narrow maintenance-mode allowlist at nginx, move verification email sending to a CloudMail internal gateway, and deploy Flarum as a separate Docker stack behind nginx on `chat.nanyee.de`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Hono on Cloudflare Workers, nginx, PM2, Docker Compose, Flarum, MariaDB

---

### Task 1: Add tests for maintenance and CloudMail gateway config

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/deployment-rollout.test.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/middleware.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/mail/cloudmail.ts`

**Step 1: Write the failing test**

Add assertions for:
- maintenance-mode allowlist decisions
- CloudMail verification gateway config resolution

**Step 2: Run the targeted tests**

Run: `node --test --import tsx tests/deployment-rollout.test.ts`

Expected: FAIL because the helper module or behavior does not exist yet.

### Task 2: Implement main-site maintenance and CloudMail client changes

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/mail/cloudmail.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/mail/resend.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/auth/register/challenges/route.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/auth/email/send/route.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/middleware.ts` only if a shared helper is appropriate

**Step 1: Add CloudMail gateway client**

- resolve base URL + shared secret from env
- POST verification email payloads to CloudMail
- fall back cleanly when the gateway is not configured in local development

**Step 2: Repoint verification mail sending**

- stop direct Resend usage from the main site
- use the CloudMail client helper instead

**Step 3: Add a maintenance-mode helper if useful for tests**

- keep nginx as the real enforcement point
- only add app-side helper code if it meaningfully improves testability or banner behavior

### Task 3: Add CloudMail internal verification gateway

**Files:**
- Modify: `C:/Users/Liukai/.gemini/antigravity/scratch/cloudmail/src/server/types.ts`
- Modify: `C:/Users/Liukai/.gemini/antigravity/scratch/cloudmail/src/server/index.ts`
- Modify: `C:/Users/Liukai/.gemini/antigravity/scratch/cloudmail/src/server/routes/invite-gateway.ts`
- Modify: `C:/Users/Liukai/.gemini/antigravity/scratch/cloudmail/wrangler.toml`

**Step 1: Add shared-secret config**

- define a dedicated gateway secret variable

**Step 2: Add internal email endpoint**

- verify shared secret header
- accept verification-email payloads
- send through existing provider selection

**Step 3: Deploy CloudMail**

- run the worker deploy command from the CloudMail project
- verify the route responds correctly

### Task 4: Prepare VPS maintenance mode and Flarum stack

**Files:**
- Create on VPS: maintenance HTML
- Modify on VPS: nginx site config for `nanyee.de`
- Create locally and/or on VPS: Flarum Docker Compose stack and env files

**Step 1: Add maintenance allowlist in nginx**

- keep auth and OIDC routes live
- serve maintenance page for normal frontend routes

**Step 2: Deploy updated main site**

- sync source/build to `/opt/nanyee`
- restart PM2 process

**Step 3: Deploy Flarum**

- provision compose stack, database, persistent volumes
- bring up containers
- wire nginx `chat.nanyee.de` to Flarum

### Task 5: Configure and verify OIDC clients

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/prisma/seed.ts`
- Verify live NewAPI OIDC settings
- Configure Flarum auth extension on VPS

**Step 1: Ensure OAuth client definitions are present**

- run seed or an equivalent upsert path on production

**Step 2: Verify NewAPI**

- point it at `https://nanyee.de/.well-known/openid-configuration`
- verify callback and login flow

**Step 3: Configure Flarum**

- install the chosen auth extension
- set issuer, client id, secret, scopes, and callback
- verify login behavior or report the exact extension blocker

### Task 6: Full verification

**Files:**
- Verify only

**Step 1: Local verification**

Run:
- `node --test --import tsx tests/deployment-rollout.test.ts`
- `node --test --import tsx tests/*.test.ts`
- `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`

**Step 2: Production verification**

Check:
- `https://nanyee.de/` shows maintenance page
- `https://nanyee.de/login` remains usable
- `https://nanyee.de/.well-known/openid-configuration` returns valid discovery JSON
- `api.nanyee.de` OIDC login works
- `chat.nanyee.de` serves Flarum and its auth integration is either working or reported with a precise blocker
