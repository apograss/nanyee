# Nanyee.de 三阶段实施计划 (Plan A 渐进式)

> 综合 Codex 后端架构 + Gemini 前端架构
> 生成时间: 2026-02-28
> SESSION: Codex=019ca4c7, Gemini=194150a4

---

## Phase 1: Quick Wins (当前实施)

### T2: CSS 间距还原 ✅ 已完成
- 7 个 CSS 文件的 `var(--space-3xl)` 回退为 `var(--space-xl)`

### T4: 链接管理 - URL 元数据自动抓取

#### 后端 (Codex 方案)
**新增文件**: `src/app/api/admin/links/fetch-meta/route.ts`
**辅助文件**: `src/lib/metadata/fetch-meta.ts`

API: `POST /api/admin/links/fetch-meta`
- 请求: `{ url: string }`
- 响应: `{ title: string|null, description: string|null, favicon: string|null }`
- 行为:
  1. 验证 URL 格式，仅允许 http/https 协议
  2. DNS 解析 → 检查 IP 是否为内网 (SSRF 防护)
     - 禁止: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, ::1
  3. fetch HTML，5s 超时，512KB 最大响应体
  4. 最多 3 次重定向，每次重新验证目标 IP
  5. 解析 `<title>`, `meta[name=description]`, `link[rel~=icon]`
  6. 任何错误静默返回 `{ title: null, description: null, favicon: null }`

**安全**: requireAdmin, SSRF IP 检查, 超时限制, 响应大小限制

#### 前端 (Gemini 方案)
**修改文件**: `src/app/admin/links/page.tsx`

- URL 输入框旁添加 NeoButton "抓取信息"
- 状态: `isFetchingMeta` 控制加载态
- 覆盖逻辑: title/description 已有内容时 `confirm()` 确认
- 失败时显示 alert 或 toast

#### 文件清单
| 操作 | 文件 |
|------|------|
| 新增 | `src/app/api/admin/links/fetch-meta/route.ts` |
| 新增 | `src/lib/metadata/fetch-meta.ts` |
| 修改 | `src/app/admin/links/page.tsx` |

---

### T1-弹幕: 留言板弹幕滚动效果

#### 后端
无需修改。复用 `GET /api/board`，Message 模型字段 (id, content, authorId, createdAt) 满足需求。

#### 前端 (Gemini 方案)
**新增组件**: `src/components/organisms/DanmakuOverlay.tsx` + `.module.css`
**修改页面**: `src/app/(main)/guestbook/page.tsx`

Props 接口:
```typescript
interface DanmakuMessage {
  id: string;
  content: string;
  author?: string;
  color?: string;
}
interface DanmakuOverlayProps {
  messages: DanmakuMessage[];
  enabled: boolean;
  tracks?: number; // 默认 4
}
```

设计要求:
- 胶囊形状 (`border-radius: 999px`), `var(--neo-border)`, `var(--neo-shadow)`
- 多轨道 (4 行), 高度 `48px/行`
- CSS `@keyframes scroll`: `translateX(0) → translateX(calc(-100vw - 100%))`
- 随机速度 (10-15s) 和延迟 (0-5s) 通过 CSS 自定义属性
- 品牌色板随机: brand, success, warning, info
- `pointer-events: none` + `aria-hidden="true"`
- GPU 加速: `will-change: transform`
- Toggle 开关控制显示/隐藏

#### 文件清单
| 操作 | 文件 |
|------|------|
| 新增 | `src/components/organisms/DanmakuOverlay.tsx` |
| 新增 | `src/components/organisms/DanmakuOverlay.module.css` |
| 修改 | `src/app/(main)/guestbook/page.tsx` |
| 修改 | `src/app/(main)/guestbook/page.module.css` |

---

## Phase 2: 社区功能

### T6: CloudMail 邮箱认证集成

#### 后端
**新增文件**: `src/lib/cloudmail/client.ts`
**修改文件**: `src/app/api/auth/email/send/route.ts`, `src/app/api/auth/email/verify/route.ts`
**数据模型**: User 新增 `emailVerifiedAt DateTime?`

API 详情:
- `POST /api/auth/email/send`: 验证 @nanyee.de 域名 → 创建 EmailVerification → 调用 CloudMail REST API
- `POST /api/auth/email/verify`: 校验 code hash + TTL → 标记 User.emailVerifiedAt

CloudMail 集成: REST 调用 `https://mail.nanyee.de/api/auth/send-code`，通过 `CLOUDMAIL_API_KEY` 认证

#### 前端
**新增组件**: `src/components/atoms/VerificationCodeInput.tsx` + `.module.css`
**修改页面**: `src/app/(auth)/register/page.tsx`

6 位分离输入框, 自动焦点跳转, Neo-Brutalism 样式

### T1-BBS: 论坛功能

#### 后端
**新增文件**:
- `src/app/api/bbs/topics/route.ts` (GET 列表 + POST 创建)
- `src/app/api/bbs/topics/[id]/route.ts` (GET 详情 + PATCH 编辑 + DELETE)
- `src/app/api/bbs/topics/[id]/replies/route.ts` (POST 回复)

使用现有 BbsTopic + BbsReply 模型, 分页 (默认 20, 最大 50)
权限: requireUser 发帖回帖, requireAdmin 置顶/锁定

#### 前端
**新增页面**: `src/app/(main)/bbs/page.tsx`, `src/app/(main)/bbs/[id]/page.tsx`
**新增组件**: `BbsTopicCard`, `BbsReplyItem`
**修改**: Header 导航添加 BBS 入口

---

## Phase 3: 管理后台升级

### 数据模型变更 (Prisma)
- ApiChannel 扩展: `models String?`, `priority Int @default(0)`, `loadBalanceStrategy String @default("weight")`
- AuditLog 新增索引: `@@index([actorId, createdAt])`
- 可选: ContentRevision 模型 (版本历史)

### 新增后端 API
- `CRUD /api/admin/channels`
- `GET /api/admin/stats/usage?range=7d|30d|90d&groupBy=day|model|channel`
- `GET /api/admin/logs/requests?page=&limit=&model=&channelId=`
- `GET /api/admin/audit` (增强分页和过滤)

### 新增前端组件
- `NeoTable` (通用可分页表格, 支持列自定义渲染)
- `NeoChart` (recharts 包装, 强制 3px 线宽 + step 类型)
- `NeoTabs` (视图切换: 表格/时间线)
- `Timeline` (审计日志时间线视图)

### 新增前端页面
- `src/app/admin/channels/page.tsx`
- `src/app/admin/usage/page.tsx`
- `src/app/admin/logs/page.tsx`
- 更新 admin 侧边栏添加新入口

### 第三方依赖
- `recharts` — 图表 (React + SVG, 易于 Neo-Brutalism 样式覆盖)
- `lucide-react` — 图标 (strokeWidth=2.5 匹配粗边框美学)
- `sonner` — Toast 通知 (需自定义为 Neo 样式)

---

## 实施优先级总结

```
Phase 1 (独立, 无依赖):
  T4 fetch-meta API + 前端按钮  →  T1 弹幕组件 + 留言板集成

Phase 2 (依赖 Phase 1 完成后的稳定 auth):
  T6 CloudMail 集成  →  T1-BBS 论坛

Phase 3 (依赖 Phase 2 的用户体系):
  Prisma migration → Channels CRUD → Usage Stats → Logs → Audit 升级
```
