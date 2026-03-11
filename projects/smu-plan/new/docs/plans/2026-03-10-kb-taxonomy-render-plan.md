# Knowledge Base Taxonomy & Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hierarchical wiki categories with admin/community edit rules and improve article Markdown presentation while preserving right-side paragraph comments.

**Architecture:** Introduce a `WikiCategory` data model plus category APIs, wire the editor and KB sidebar to the new taxonomy, and refresh article detail rendering/styling without removing the existing `data-article-body` comment anchor container.

**Tech Stack:** Next.js App Router, Prisma, SQLite, React, CSS Modules, node:test

---

### Task 1: Add category persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260310xxxxxx_add_wiki_categories/migration.sql`

**Step 1: Write the failing test**
- Add source-level assertions for `WikiCategory` support and article category binding.

**Step 2: Run test to verify it fails**
- Run: `node --test --import tsx tests/kb-taxonomy.test.ts`

**Step 3: Write minimal implementation**
- Add `WikiCategory` model and `Article.categoryId`.

**Step 4: Run test to verify it passes**
- Run the same test.

### Task 2: Add category query and mutation layer

**Files:**
- Modify: `src/lib/wiki/queries.ts`
- Create: `src/lib/wiki/categories.ts`
- Create: `src/app/api/wiki/categories/route.ts`
- Create: `src/app/api/wiki/categories/[id]/route.ts`

**Step 1: Write the failing test**
- Cover public tree fetch, community child permissions, and admin-only parent operations.

**Step 2: Run test to verify it fails**
- Run: `node --test --import tsx tests/kb-taxonomy.test.ts`

**Step 3: Write minimal implementation**
- Add tree query, counts, and permission-aware mutations.

**Step 4: Run test to verify it passes**
- Run the same test.

### Task 3: Wire taxonomy into editor and KB listing

**Files:**
- Modify: `src/app/(main)/editor/page.tsx`
- Modify: `src/app/api/wiki/route.ts`
- Modify: `src/app/api/wiki/[slug]/route.ts`
- Modify: `src/app/(main)/kb/page.tsx`
- Modify: `src/app/(main)/kb/KBSidebar.tsx`
- Modify: `src/components/organisms/ArticleList.tsx`
- Modify: `src/components/molecules/ArticleCard.tsx`

**Step 1: Write the failing test**
- Assert editor uses structured category selection and KB UI reads taxonomy data.

**Step 2: Run test to verify it fails**
- Run: `node --test --import tsx tests/kb-taxonomy.test.ts`

**Step 3: Write minimal implementation**
- Replace free-text category input with parent/child selection and inline child editing.
- Update list queries and cards to show structured category info.

**Step 4: Run test to verify it passes**
- Run the same test.

### Task 4: Add admin category management

**Files:**
- Modify: `src/app/admin/config.ts`
- Create: `src/app/admin/wiki-categories/page.tsx`
- Create: `src/app/admin/wiki-categories/page.module.css`

**Step 1: Write the failing test**
- Assert admin nav exposes category management and the page uses tree controls.

**Step 2: Run test to verify it fails**
- Run: `node --test --import tsx tests/kb-taxonomy.test.ts`

**Step 3: Write minimal implementation**
- Add parent/child management UI with admin-only parent controls.

**Step 4: Run test to verify it passes**
- Run the same test.

### Task 5: Improve article rendering

**Files:**
- Modify: `src/lib/wiki/render.ts`
- Modify: `src/app/(main)/kb/[slug]/page.tsx`
- Modify: `src/app/(main)/kb/page.module.css`

**Step 1: Write the failing test**
- Assert detail page keeps `data-article-body` and improved markdown output wrappers.

**Step 2: Run test to verify it fails**
- Run: `node --test --import tsx tests/kb-taxonomy.test.ts tests/wiki-admin-ui.test.ts`

**Step 3: Write minimal implementation**
- Enhance markdown rendering and article detail layout/styling while preserving comment hooks.

**Step 4: Run test to verify it passes**
- Run the same test.

### Task 6: Verify end-to-end

**Files:**
- Modify: `tests/kb-taxonomy.test.ts`

**Step 1: Run targeted verification**
- `node --test --import tsx tests/kb-taxonomy.test.ts tests/wiki-admin-ui.test.ts`

**Step 2: Run project verification**
- `node --test --import tsx tests/*.test.ts`
- `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd tsc --noEmit`
- `C:/Users/Liukai/scoop/apps/nodejs/current/npx.cmd prisma validate`
