# KB Frontend Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the knowledge-base frontend with a polished collaborative homepage, a Chinese editor with preview mode, and a stronger edit CTA.

**Architecture:** Introduce small pure config and rendering helpers for editor modes, KB hero content, and preview rendering so the UI behavior stays testable with `node:test`. Then update the KB list page, editor page, and article detail page to consume those helpers.

**Tech Stack:** Next.js App Router, React 19, TypeScript, node:test, tsx, marked, sanitize-html

---

### Task 1: Add failing tests for editor/KB UI config

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

**Step 1: Write the failing test**

Add assertions for:
- editor mode config exposes `编辑` and `预览`
- KB hero config contains collaboration-focused items
- article preview renderer returns HTML for markdown and safe HTML content

**Step 2: Run the test to verify it fails**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: FAIL because the new helper modules do not exist yet.

### Task 2: Add testable KB frontend helpers

**Files:**
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/config.ts`
- Create: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/lib/wiki/render.ts`

**Step 1: Implement minimal helpers**

- Export KB hero title/subtitle/highlight items
- Export editor mode config
- Export a shared article rendering helper for preview/detail rendering

**Step 2: Re-run targeted tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: helper-level assertions pass.

### Task 3: Polish the editor page

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/editor/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/editor/page.module.css`

**Step 1: Add preview mode**

- Add local state for `edit | preview`
- Render the preview panel with the shared renderer helper

**Step 2: Clean Chinese copy**

- Replace the remaining garbled/loading/placeholder text with correct Chinese copy
- Keep login and locked-article flows intact

**Step 3: Re-run targeted tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: PASS

### Task 4: Upgrade the KB landing page and article edit CTA

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/page.module.css`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/[slug]/page.tsx`
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/[slug]/ArticleEditButton.tsx`

**Step 1: Add collaboration hero**

- Introduce a stronger visual hero and collaboration highlights
- Keep the article list below it

**Step 2: Make the edit CTA prominent**

- Turn the edit action into a clear button
- Keep history as a secondary action

**Step 3: Re-run targeted tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: PASS

### Task 5: Full verification

**Files:**
- Verify only

**Step 1: Run full tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/*.test.ts`

Expected: all tests pass

**Step 2: Run TypeScript**

Run: `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`

Expected: no type errors

### Task 6: Validate AI search using the provided key

**Files:**
- Verify only

**Step 1: Temporarily provide the LongCat key in the validation command**

Use the existing `/api/ai/chat` route or a direct API call with one or two campus-knowledge prompts.

**Step 2: Record outcome**

- If the upstream call succeeds, summarize the search quality briefly.
- If it fails, include the exact failure mode and whether it is app-side or upstream-side.

