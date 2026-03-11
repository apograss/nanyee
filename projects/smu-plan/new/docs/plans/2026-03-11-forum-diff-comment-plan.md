# Forum, Diff, and Comment Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the five remaining release blockers around forum preview, header text, Wiki diff, comment usability, and forum navigation polish.

**Architecture:** Keep the current deployment model intact. Forum data continues to flow through the main site's preview API, Wiki comparison stays on the history page with `jsdiff`, and comment fixes preserve the existing paragraph-anchor system while making failures visible.

**Tech Stack:** Next.js App Router, React, Prisma, Flarum JSON:API, `diff` (jsdiff), CSS modules, node:test, TypeScript.

---

### Task 1: Wire Homepage Forum Preview To Real Flarum Data

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/forum/latest.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/wiki/queries.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/page.tsx`
- Test: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/home-forum-preview.test.ts`

**Steps:**
1. Write/adjust failing test for homepage preview wiring.
2. Make the helper request `include=user,lastPostedUser` and parse `included`.
3. Normalize author and last-activity fields.
4. Keep graceful fallback when the forum returns no discussions.
5. Run the forum preview test.

### Task 2: Remove Mojibake From Header And Navigation

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/Header.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/site/nav.ts`
- Test: add/extend nav/header label test file

**Steps:**
1. Add a failing test for visible Chinese labels.
2. Replace garbled strings in header and nav config.
3. Verify desktop and mobile nav labels in code/tests.

### Task 3: Add Wiki Revision Diff View

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/package.json`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/[slug]/history/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/[slug]/history/history.module.css`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/wiki/[slug]/revisions/[revId]/route.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/WikiDiffView/WikiDiffView.tsx`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/WikiDiffView/WikiDiffView.module.css`
- Test: new diff-view test file

**Steps:**
1. Add a failing test for revision detail/diff wiring.
2. Install `diff`.
3. Add a revision detail endpoint.
4. Build a diff component using `diffWords` for short fields and `diffLines` for body text.
5. Integrate the compare panel into the history page without breaking revert.
6. Run the new diff tests and history-page tests.

### Task 4: Fix Paragraph Comment Placement And Publishing

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/CommentSystem/CommentSystem.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/CommentSystem/CommentSystem.module.css`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/wiki/[slug]/comments/route.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/api/wiki/[slug]/comments/[id]/route.ts`
- Test: new focused comment-system regression test

**Steps:**
1. Reproduce the publishing failure and capture the actual response.
2. Add a failing test that covers the discovered cause or at least the surfaced error path.
3. Move the paragraph icon left so it stays inside the article frame.
4. Surface POST/DELETE failures in the UI instead of swallowing them.
5. Verify create/delete flow after the fix.

### Task 5: Make Forum Entry Same-Tab And More Cohesive

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/site/nav.ts`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/components/organisms/Header.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/bbs/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/bbs/[id]/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/bbs/new/page.tsx`
- Test: extend BBS bridge/navigation tests

**Steps:**
1. Add a failing test for same-tab forum navigation and preserved context.
2. Remove forced new-tab behavior for forum entry points.
3. Redesign `/bbs` as a main-site-styled bridge page.
4. Keep `/bbs/[id]` and `/bbs/new` intent-aware.
5. Verify navigation behavior by test and browser flow.

### Task 6: Full Verification And Deploy

**Files:**
- Verify the modified files above

**Steps:**
1. Run focused tests for forum preview, diff, comments, and forum navigation.
2. Run `node --test --import tsx tests/*.test.ts`.
3. Run `npx tsc --noEmit`.
4. Run `npx prisma validate`.
5. Build locally if the environment allows it.
6. Deploy to VPS, restart PM2, and verify homepage, KB, preview API, and history routes.
