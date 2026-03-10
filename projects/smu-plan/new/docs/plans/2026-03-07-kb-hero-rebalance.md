# KB Hero Rebalance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the KB landing page hero so the collaborative message stays clear without the current oversized, left-heavy presentation.

**Architecture:** Keep the page data flow unchanged and refactor only the KB landing page composition. Move the hero content into a slightly richer config shape so the layout remains testable without browser-only assertions.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, node:test, tsx

---

### Task 1: Update KB config tests first

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

**Step 1: Write the failing test**

Add assertions for:
- a dedicated KB collaboration panel title
- exactly three collaboration panel items
- the hero title copy staying present while the supporting cards remain at length 3

**Step 2: Run the test to verify it fails**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: FAIL because the new config fields do not exist yet.

### Task 2: Expand KB config for the calmer hero structure

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/config.ts`

**Step 1: Add the minimal config needed**

- keep hero kicker/title/description
- add one collaboration panel heading
- add three collaboration panel rows
- tighten copy to match the more editorial layout

**Step 2: Re-run the targeted test**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

Expected: PASS for the new config assertions.

### Task 3: Rebuild the KB hero structure

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/page.tsx`

**Step 1: Restructure the hero markup**

- replace the dual metric-card aside with a single collaboration panel
- add one compact stat row inside the hero copy instead of a large standalone metric block
- keep the two CTA actions

**Step 2: Keep article list and highlight cards intact**

- preserve the latest articles section and data fetching
- keep the collaboration highlights below the hero

### Task 4: Rebalance the CSS

**Files:**
- Modify: `C:/Users/Liukai/.codex/projects/smu-plan/new/src/app/(main)/kb/page.module.css`

**Step 1: Reduce hero headline dominance**

- shrink title scale
- reduce text weights where possible
- improve line length and vertical rhythm

**Step 2: Strengthen the right panel and soften support cards**

- add one stronger panel style for the collaboration aside
- make the support cards lighter and more uniform
- simplify the hero background back into the warm site palette

### Task 5: Verify

**Files:**
- Verify only

**Step 1: Targeted tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/wiki-admin-ui.test.ts`

**Step 2: Full tests**

Run: `node --test --import tsx C:/Users/Liukai/.codex/projects/smu-plan/new/tests/*.test.ts`

**Step 3: TypeScript**

Run: `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`
