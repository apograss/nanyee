# Grok Admin Token Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `check.nanyee.de` 的 Grok 监控优先使用 `grok2api` 管理接口返回的 token 状态。

**Architecture:** 采集器先请求 `grok2api /v1/admin/tokens`，将返回的 token 项转换成 `AiAccountState`；管理口失败时降级到本地 `token.json`，最后再退到 `result_grok` 文本解析。这样能保证线上有实时状态，同时保留容灾路径。

**Tech Stack:** Next.js 15, TypeScript, Prisma, Node test runner, `tsx`

---

### Task 1: 补齐解析测试

**Files:**
- Modify: `tests/check-monitor.test.ts`
- Modify: `src/lib/check/monitor-core.ts`

**Step 1: Write the failing test**

增加 admin token payload 测试，覆盖：
- `note + token` 作为账号标识
- `quota <= 0` -> `rate_limited`
- `status=disabled` 或失败原因为鉴权错误 -> `invalid`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/check-monitor.test.ts`

**Step 3: Write minimal implementation**

扩展 token 解析逻辑，支持没有邮箱时仍解析出账号。

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/check-monitor.test.ts`

### Task 2: 接入采集器

**Files:**
- Modify: `src/lib/check/config.ts`
- Modify: `src/lib/check/collector.ts`

**Step 1: Write the failing test**

用最小单元测试或解析测试证明 admin token payload 可转为 `AiAccountState`。

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/check-monitor.test.ts`

**Step 3: Write minimal implementation**

新增 `CHECK_GROK_ADMIN_BASE_URL` / `CHECK_GROK_ADMIN_API_KEY`，采集器优先请求 admin tokens。

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/check-monitor.test.ts`

### Task 3: 回归与部署

**Files:**
- Modify: `src/lib/check/collector.ts`
- Modify: `docs/check-subsite-deploy.md`

**Step 1: Run local verification**

Run:
- `node --import tsx --test tests/check-monitor.test.ts`
- `npm run build`

**Step 2: Deploy minimal changed files**

同步新的 `standalone/static` 到 VPS，补上 `CHECK_GROK_ADMIN_*` 环境变量并重启。

**Step 3: Verify production**

Run:
- 触发 `POST /api/internal/check/collect`
- 验证 `https://check.nanyee.de/api/check/summary`
- 验证中文页面未回退
