# 四项功能改进实施计划

## 任务概览

| # | 任务 | 优先级 | 复杂度 |
|---|------|--------|--------|
| 1 | AI搜索修复 (FTS5) | P0 | 中 |
| 2 | 链接分类标签可编辑 | P2 | 高 |
| 3 | 文章永久删除 | P1 | 低 |
| 4 | 关于页面HTML编辑 | P1 | 中 |

---

## 任务 1: AI搜索修复

### 根因
`article_fts` 虚拟表和 3 个 SQLite trigger 从未被创建。`prisma/apply-fts5.ts` 是独立脚本，未纳入迁移流程。`search_knowledge` 工具每次调用都报 `no such table: article_fts`。

### 实施步骤

**Step 1.1: 集成 FTS5 到 Prisma seed**
- 修改 `prisma/seed.ts`（或新建）：在 seed 末尾调用 apply-fts5 逻辑
- 或者修改 `src/lib/prisma.ts`：在 prisma 初始化时执行 FTS5 健康检查

**Step 1.2: 启动时自动创建 FTS5**
- 文件：`src/lib/prisma.ts`
- 在 prisma client 初始化后，执行 `CREATE VIRTUAL TABLE IF NOT EXISTS article_fts ...` 和 3 个 trigger
- 使用 `$executeRawUnsafe` 执行 fts5.sql 中的语句

**Step 1.3: 回填已发布文章**
- 在 FTS5 创建后，执行回填：
  ```sql
  INSERT OR IGNORE INTO article_fts(title, summary, content, slug, article_id)
  SELECT title, COALESCE(summary,''), content, slug, id FROM Article WHERE status='published'
  ```

**Step 1.4: 扩大系统提示词触发范围**
- 文件：`src/lib/ai/client.ts`
- 修改 SYSTEM_PROMPT 规则 2：
  - 旧："对于校规、流程、指南等问题，调用 search_knowledge"
  - 新："对于任何与南方医科大学相关的具体问题（校规、流程、指南、校园生活、设施、社团、食堂等），优先调用 search_knowledge 搜索知识库"

**Step 1.5: 修改 search_knowledge 工具描述**
- 文件：`src/lib/ai/tools.ts`
- 旧 description："搜索校园知识库文章。用于回答关于校规、流程、指南等问题。"
- 新："搜索校园知识库文章。当用户询问任何与南医大校园相关的问题时调用，包括校规、流程、指南、校园生活、设施、社团等。"

**Step 1.6: executor 错误降级**
- 文件：`src/lib/ai/executor.ts`
- search_knowledge 的 catch 块中，返回更友好的降级文案："知识库暂时不可用，我将基于已有知识回答。"

### 修改文件
- `src/lib/prisma.ts` — 添加 FTS5 初始化
- `src/lib/ai/client.ts` — 扩大 prompt
- `src/lib/ai/tools.ts` — 扩大工具描述
- `src/lib/ai/executor.ts` — 错误降级

---

## 任务 2: 链接分类标签可编辑 (LinkCategory 表)

### 实施步骤

**Step 2.1: Prisma schema 新增 LinkCategory**
- 文件：`prisma/schema.prisma`
```prisma
model LinkCategory {
  id    String @id @default(cuid())
  name  String @unique
  icon  String @default("📎")
  order Int    @default(0)
  links Link[]
}

model Link {
  // ... 现有字段
  categoryId  String?
  category_   LinkCategory? @relation(fields: [categoryId], references: [id])
  // 保留 category 字符串字段做兼容
}
```

**Step 2.2: 数据迁移**
- `npx prisma migrate dev`
- 迁移脚本：聚合现有 `Link.category` 字符串为 LinkCategory 记录
- 更新每个 Link 的 categoryId

**Step 2.3: 公开 API 返回分类**
- 文件：`src/app/api/links/route.ts`
- GET 返回 `{ links: [...], categories: [...] }`

**Step 2.4: Admin API — CRUD LinkCategory**
- 新建：`src/app/api/admin/links/categories/route.ts` (GET/POST)
- 新建：`src/app/api/admin/links/categories/[id]/route.ts` (PATCH/DELETE)

**Step 2.5: 前端 — 移除硬编码，从 API 读取分类**
- 文件：`src/app/(main)/links/page.tsx`
- 移除 `CATEGORY_ICONS` 硬编码
- 新增 `categories` state，从 API 获取
- 按 `categories` 分组显示（使用 category.icon 和 category.name）

**Step 2.6: 前端 — 编辑模式增加分类管理**
- 文件：`src/app/(main)/links/page.tsx`
- 编辑模式下新增"管理分类"按钮
- 展开行内面板：列出所有分类，支持编辑名称/图标/排序、新增、删除

### 修改文件
- `prisma/schema.prisma` — 新增 LinkCategory 模型
- `src/app/api/links/route.ts` — 返回分类
- 新增 `src/app/api/admin/links/categories/route.ts`
- 新增 `src/app/api/admin/links/categories/[id]/route.ts`
- `src/app/(main)/links/page.tsx` — 分类动态化 + 分类管理UI
- `src/app/(main)/links/links.module.css` — 分类管理面板样式

---

## 任务 3: 文章永久删除

### 实施步骤

**Step 3.1: 后端 — 修改 DELETE API 支持永久删除**
- 文件：`src/app/api/admin/articles/[id]/route.ts`
- 检查 URL query `?permanent=true`
- 有 permanent=true：执行 `prisma.article.delete()` + 清理 FTS5 + 审计日志 `article.delete`
- 无 permanent：保持现有软删除行为（status="hidden"）

**Step 3.2: 前端 — 新增永久删除按钮 + 标题确认**
- 文件：`src/app/admin/articles/page.tsx`
- 新增 `handleHardDelete` 方法
- 使用 `window.prompt` 要求输入文章标题确认
- 匹配成功后调用 `DELETE /api/admin/articles/{id}?permanent=true`
- 在操作列增加"永久删除"按钮（NeoButton variant="danger"）

### 修改文件
- `src/app/api/admin/articles/[id]/route.ts` — 支持 permanent 参数
- `src/app/admin/articles/page.tsx` — 新增按钮和处理函数

---

## 任务 4: 关于页面 HTML 编辑

### 实施步骤

**Step 4.1: 后端 — SiteSetting 白名单新增 aboutHtml**
- 文件：`src/app/api/admin/settings/route.ts`
- ALLOWED_KEYS 新增 `"aboutHtml"`
- 增大该 key 的 max 限制（HTML 可能较大）：z.string().max(50000)

**Step 4.2: 公开 settings API 也返回 aboutHtml**
- 文件：`src/app/api/settings/route.ts`（公开端点，无需 admin auth）
- 确认 aboutHtml 在公开 GET 中可读

**Step 4.3: 前端 — 关于页面动态渲染**
- 文件：`src/app/(main)/about/page.tsx`
- 改为 client component（需要 useEffect fetch）
- 逻辑：fetch /api/settings → 有 aboutHtml → dangerouslySetInnerHTML；无内容 → fallback 显示现有硬编码

**Step 4.4: Admin 外观设置 — 新增 aboutHtml 编辑器**
- 文件：`src/app/admin/appearance/page.tsx`
- 新增 section：textarea 编辑 HTML + 实时预览面板
- 保存时写入 aboutHtml 配置

### 修改文件
- `src/app/api/admin/settings/route.ts` — 白名单 + 大小限制
- `src/app/api/settings/route.ts` — 确认公开可读
- `src/app/(main)/about/page.tsx` — 动态渲染
- `src/app/admin/appearance/page.tsx` — HTML 编辑器

---

## 实施顺序

1. **任务 1** (AI搜索) — 最高优先级，其他功能不依赖此项
2. **任务 3** (文章删除) — 改动最小，可快速完成
3. **任务 4** (关于页面) — 中等改动
4. **任务 2** (分类标签) — 改动最大，涉及 schema 迁移
