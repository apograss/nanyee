# nanyee.de MVP 综合实施计划

> 日期：2026-02-28
> 状态：待用户批准
> 来源：Codex 后端架构 + Gemini 前端架构 + Claude 综合编排

---

## 0. 架构总览

| 维度 | 决策 |
|------|------|
| 架构 | 单体 Next.js 15 App Router (standalone) |
| 语言 | TypeScript |
| 样式 | Vanilla CSS (CSS Modules + CSS Variables) |
| 数据库 | SQLite + Prisma + FTS5 |
| AI | OpenAI SDK → LongCat (api.longcat.chat/openai/v1/chat/completions) |
| 认证 | 自建 JWT (HttpOnly Cookie) |
| UI 风格 | Neo-Brutalism Hybrid (ChatGPT 极简布局 + 粗边框组件) |
| API Key | 上游监控 + 对外发放 (Scoped ApiToken) |
| 部署 | OVH US 4C/8GB + PM2 + Nginx + Cloudflare CDN |

---

## 1. 项目结构

```
new/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── xxxx_add_fts5/migration.sql
├── src/
│   ├── app/
│   │   ├── (main)/                    # 主站布局
│   │   │   ├── layout.tsx             # Header + Theme + Auth Provider
│   │   │   ├── page.tsx               # AI 搜索首页 + 对话 (Client)
│   │   │   ├── kb/
│   │   │   │   ├── page.tsx           # 知识库列表 (Server, ISR)
│   │   │   │   └── [slug]/page.tsx    # 文章详情 (Server, SSG)
│   │   │   ├── tools/
│   │   │   │   ├── layout.tsx         # 工具中心布局
│   │   │   │   ├── page.tsx           # 工具卡片列表 (Server)
│   │   │   │   ├── schedule/page.tsx  # 课表导出 (Client)
│   │   │   │   ├── grades/page.tsx    # 成绩查询 (Client)
│   │   │   │   └── enroll/page.tsx    # 自动选课 (Client)
│   │   │   ├── nav/page.tsx           # 校内导航 (Server)
│   │   │   └── guestbook/page.tsx     # 留言板 (Server + Client Island)
│   │   ├── (auth)/                    # 登录注册独立布局
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx         # Client
│   │   │   └── register/page.tsx      # Client
│   │   ├── admin/                     # 管理后台
│   │   │   ├── layout.tsx             # 侧栏导航 + 鉴权
│   │   │   ├── page.tsx               # Dashboard 概览
│   │   │   ├── audit/page.tsx         # 文章审核
│   │   │   └── apikey/page.tsx        # API Key 监控
│   │   ├── editor/page.tsx            # Markdown 投稿 (Client)
│   │   └── api/
│   │       ├── auth/                  # 认证 API
│   │       ├── ai/chat/route.ts       # AI SSE 对话
│   │       ├── wiki/                  # 知识库 CRUD
│   │       ├── board/                 # 留言板
│   │       ├── links/route.ts         # 校内导航
│   │       ├── tools/                 # 工具 API
│   │       ├── v1/                    # 对外 OpenAI 兼容 API
│   │       └── admin/                 # 管理后台 API
│   ├── components/
│   │   ├── atoms/                     # 原子组件
│   │   ├── molecules/                 # 分子组件
│   │   └── organisms/                 # 有机体组件
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth/                      # JWT + Session + Guard
│   │   ├── ai/                        # AI 客户端 + 工具定义
│   │   ├── keys/                      # ProviderKey 选择器
│   │   ├── tokens/                    # ApiToken 验证
│   │   ├── ratelimit.ts
│   │   └── tools/                     # 工具实现 (从 tools/ 迁移)
│   └── hooks/
│       ├── useChat.ts                 # SSE 对话 Hook
│       └── useAuth.ts                 # 认证 Hook
├── data/
│   ├── links.json
│   └── wiki/                          # Markdown 种子内容
└── package.json
```

---

## 2. 数据模型 (Prisma Schema)

共 18 个模型：

**用户与认证**：User, Session, EmailVerification, QuizQuestion, QuizAttempt
**内容**：Article, Message
**AI 与工具**：SearchLog, ToolRun
**上游 Key**：ProviderKey, KeyUsage, KeyHealth
**对外 Token**：ApiToken, ApiTokenScope, TokenUsage
**运维**：ApiChannel, AuditLog

关键设计：
- ProviderKey.keyCipher 加密存储上游 key
- ApiToken.tokenHash 哈希存储对外 token
- ApiTokenScope 支持 endpoint/tool/model 三种粒度
- FTS5 虚拟表通过迁移脚本创建，triggers 自动同步

完整 Schema 见 Codex 输出的 `backend-architecture-design.md`。

---

## 3. API 路由表

### 3.1 认证 (8 endpoints)
- POST `/api/auth/register` — 注册 (邮箱/答题)
- POST `/api/auth/login` — 登录
- POST `/api/auth/logout` — 注销
- POST `/api/auth/refresh` — 刷新 token
- GET `/api/auth/me` — 当前用户
- POST `/api/auth/email/send` — 发送验证码
- POST `/api/auth/email/verify` — 验证邮箱
- POST `/api/auth/quiz/attempt` — 答题验证

### 3.2 AI (1 endpoint)
- POST `/api/ai/chat` — SSE 流式对话 + function calling

### 3.3 知识库 (7 endpoints)
- GET/POST `/api/wiki` — 列表/投稿
- GET `/api/wiki/[slug]` — 详情
- PUT `/api/wiki/[id]` — 编辑
- POST `/api/wiki/[id]/submit` — 提交审核
- POST `/api/wiki/[id]/publish` — 发布
- POST `/api/wiki/[id]/reject` — 拒绝

### 3.4 留言板 (3 endpoints)
- GET/POST `/api/board` — 列表/发布
- DELETE `/api/board/[id]` — 删除

### 3.5 导航与工具 (4 endpoints)
- GET `/api/links`
- POST `/api/tools/schedule/convert`
- POST `/api/tools/grades`
- POST `/api/tools/enroll`

### 3.6 对外 API (2 endpoints)
- GET `/api/v1/models` — 模型列表 (ApiToken 认证)
- POST `/api/v1/chat/completions` — OpenAI 兼容 (ApiToken 认证)

### 3.7 管理后台 (14 endpoints)
- ProviderKey CRUD + rotate/disable/check/usage
- ApiToken CRUD + rotate/revoke/usage
- Channel 管理
- Audit Log
- Cron 健康检查

---

## 4. 前端组件体系 (Atomic Design)

### 原子组件 (src/components/atoms/)
| 组件 | 关键 Props |
|------|-----------|
| NeoButton | variant, size, isLoading |
| NeoInput | label, error, ...InputHTMLAttributes |
| SearchBar | onSearch, isStreaming |
| Badge | text, colorVariant |
| Avatar | src, fallback, size |
| ThemeToggle | (none) |

### 分子组件 (src/components/molecules/)
| 组件 | 关键 Props |
|------|-----------|
| ToolCard | title, desc, icon, href |
| ChatBubble | role, content, isStreaming |
| ReferenceCard | title, source, url |
| ArticleCard | title, excerpt, date, tags |
| MessageItem | author, content, time |

### 有机体组件 (src/components/organisms/)
| 组件 | 关键 Props |
|------|-----------|
| Header | user? |
| ChatStream | messages, isLoading, onStop |
| ToolGrid | tools |
| ArticleList | articles, pagination |
| KeyDashboard | usageData |

---

## 5. AI 搜索交互流程

状态机：`IDLE → TRANSITIONING → STREAMING → DONE`

- **IDLE**：全屏居中 Logo + 热门标签 + 搜索框
- **TRANSITIONING**：CSS transition 0.6s，Logo 缩小吸附左上，搜索框移至底部
- **STREAMING**：上方对话流（ChatStream），下方固定输入框，SSE 实时渲染
- **DONE**：展示完整回答 + 工具卡片 + 引用卡片 + 追问框

工具卡片通过 SSE 事件中的特定标记触发渲染。

---

## 6. CSS 主题 Token

浅色 + 深色完整变量定义，核心色彩：
- 品牌橘 #E8652B / 深色提亮 #FF7B3D
- 深蓝黑 #1D3557 / 深色背景 #121A2F
- 薄荷青 #A8DADC / 深色变种 #1D4C4F
- 纸张白 #FDF0D5

Neo-Brutalism token：3px 边框、4px 硬阴影、4px 圆角。

---

## 7. 分步实施计划

### Phase 1：项目初始化与基础设施
- 初始化 Next.js 15 项目 + TypeScript + ESLint
- Prisma schema + SQLite + FTS5 迁移
- globals.css + CSS Variables + 主题切换
- 目录结构搭建

### Phase 2：认证系统
- JWT 工具函数 (sign/verify/refresh)
- Session 管理
- 注册 (邮箱验证 + 答题) / 登录 / 注销 API
- Auth guard 中间件

### Phase 3：组件库
- 原子组件：NeoButton, NeoInput, SearchBar, Badge, Avatar, ThemeToggle
- 分子组件：ToolCard, ChatBubble, ReferenceCard, ArticleCard, MessageItem
- Header 有机体 + 主站布局

### Phase 4：AI 搜索核心
- LongCat AI 客户端 + function calling 工具定义
- `/api/ai/chat` SSE 路由
- ProviderKey 选择器 + KeyUsage 记录
- useChat Hook + ChatStream 组件
- 首页空态 → 对话过渡动画

### Phase 5：知识库
- Article CRUD API
- FTS5 搜索集成
- 知识库浏览页 + 文章详情页
- Markdown 编辑器 / 投稿页
- search_knowledge function calling 工具

### Phase 6：工具集成
- tools/ 代码迁移到主站 src/app/tools/ 路由
- 工具 API 路由
- ToolGrid + 工具中心页
- recommend_tool / convert_schedule function calling

### Phase 7：辅助功能
- 校内导航 (links.json)
- 留言板
- 搜索历史 (localStorage)

### Phase 8：API Key 管理
- ProviderKey 管理 API
- ApiToken 发放 + Scoped 权限 + 速率限制
- `/api/v1/*` 对外兼容 API
- TokenUsage 记录

### Phase 9：管理后台
- Admin 布局 + 侧栏导航
- 文章审核面板
- API Key 监控仪表盘 (图表 + 数据表格)
- 审计日志

### Phase 10：优化与交付
- Lighthouse 审查 (目标 > 90)
- 移动端 375px 真机调试
- 性能优化 (code splitting, next/image, font preload)
- Nginx + PM2 部署配置
- Cloudflare CDN 配置

---

## 8. 关键技术决策备忘

1. **SQLite 并发写**：启用 WAL 模式，异步日志写入
2. **FTS5 同步**：触发器自动同步，不需手动 rebuild
3. **JWT 策略**：Access 15min / Refresh 30days，rotation on refresh
4. **SSE 超时**：Nginx proxy_read_timeout 300s，前端心跳检测
5. **Key 加密**：AES-256-GCM，密钥从环境变量读取
6. **移动端阴影**：375px 断点将 shadow-offset 从 4px 缩至 2px
7. **工具安全**：function calling 严格白名单，结果限长截断
