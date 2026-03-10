# Admin UI Wiki Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix wiki editor crashes, restore admin locked-article management, and remove obsolete admin frontend surfaces.

**Architecture:** Extract small pure helper/config modules for editor options and admin navigation/dashboard state so they can be tested with `node:test`. Then update the editor and admin pages to consume those helpers and wire the existing admin article API into a lock/unlock action.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma, node:test, tsx

---

### Task 1: Add failing tests for the new UI contract

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

**Step 1: Write the failing test**

Cover:
- wiki editor config exposes `immediatelyRender: false`
- admin nav items do not include `/admin/audit`, `/admin/apikey`, `/admin/channels`, or the external New-API link
- admin dashboard cards do not include active key/token cards
- `canEditArticle` allows admins to edit locked articles and blocks contributors

**Step 2: Run test to verify it fails**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: FAIL because the helper/config modules do not exist yet.

### Task 2: Extract pure config/helper modules

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/WikiEditor/options.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/config.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/WikiEditor/WikiEditor.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/layout.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/page.tsx`

**Step 1: Implement minimal helpers**

- Move Tiptap options creation behind a helper that sets `immediatelyRender: false`
- Export a trimmed `ADMIN_NAV_ITEMS`
- Export a trimmed dashboard-card builder/config

**Step 2: Run targeted test**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: nav/editor/dashboard assertions pass; any page behavior assertions still fail until next tasks.

### Task 3: Fix editor auth/lock behavior

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/editor/page.tsx`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/WikiCreateButton.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/page.tsx`

**Step 1: Update editor page**

- Read the authenticated user with `useAuth`
- Allow admin users to continue when the article is locked
- Block anonymous users in the UI with a clear prompt instead of letting them reach a failing submit path

**Step 2: Update KB list page**

- Replace the always-visible create link with a client component that only renders for logged-in users

**Step 3: Run targeted test**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: permission helper assertions still green; no regressions.

### Task 4: Add lock/unlock to admin article management

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/articles/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/articles/page.module.css`

**Step 1: Extend the page model**

- Include `isLocked` in the local `ArticleItem` type
- Add a lock state badge/column
- Add row actions to toggle lock state through `/api/admin/articles/[id]`

**Step 2: Remove review-era copy**

- Rename labels/copy to reflect wiki management rather than article review

**Step 3: Run targeted test**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: tests still pass.

### Task 5: Remove obsolete admin frontend pages

**Files:**
- Delete: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/audit/page.tsx`
- Delete: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/apikey/page.tsx`
- Delete: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/admin/channels/page.tsx`

**Step 1: Delete the unused frontend pages**

- Keep backend APIs intact
- Let unlinked routes disappear from the admin surface

**Step 2: Build-check**

Run: `C:/Users/Liukai/scoop/apps/nodejs/current/npm.cmd run build`

Expected: build succeeds without references to deleted pages.

### Task 6: Full verification

**Files:**
- Verify only

**Step 1: Run tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/*.test.ts`

Expected: all tests pass.

**Step 2: Run build**

Run: `C:/Users/Liukai/scoop/apps/nodejs/current/npm.cmd run build`

Expected: build succeeds.

