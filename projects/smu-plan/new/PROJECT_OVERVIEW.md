# Nanyee.de 项目概况报告

> **最后更新**: 2026-03-07  
> **版本**: v0.1.0  
> **项目地位**: MVP 已完成，主站功能部分实现

---

## 📋 项目概要

### 项目定位
**nanyee.de** 是一个面向南方医科大学的 **AI 智能助手 + 校园工具平台**，以 ChatGPT 风格的 AI 对话为核心入口，整合课表导出、成绩查询、自动选课等实用工具，打造校园生活一站式解决方案。

### 核心价值主张
- 🤖 **AI 优先**: Perplexity 风格智能搜索，自动理解需求并推荐工具
- ⚡ **极致效率**: 3 秒导出课表，毫秒级抢课，自动识别验证码
- 🎨 **精致体验**: 暗色主题 + 拟态设计，ChatGPT 级别的交互流畅度
- 🔒 **安全可靠**: 完整的 OAuth 认证体系，JWT 双令牌方案，数据加密存储

---

## 🏗️ 技术架构

### 技术栈总览

```
┌────────────────────────────────────────────────────────────┐
│                      前端层                                │
│  Next.js 15 + React 19 + TypeScript 5.8                   │
│  CSS Modules + 暗色主题 + 原子设计模式                      │
│  SSE 流式通信 + ONNX Runtime Web                           │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│                     应用层                                  │
│  Next.js API Routes + Middleware                           │
│  认证守卫 + 速率限制 + 权限控制                             │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│                     服务层                                  │
│  AI 服务: OpenAI SDK + Function Calling                    │
│  爬虫服务: 教务系统登录 + 数据抓取 + OCR                    │
│  认证服务: JWT + Session + OAuth2.0/OIDC                   │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│                     数据层                                  │
│  Prisma ORM + SQLite (dev) / PostgreSQL (prod)            │
│  FTS5 全文搜索 + Redis 缓存（规划中）                       │
└────────────────────────────────────────────────────────────┘
```

### 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证相关页面（登录/注册）
│   ├── (main)/                   # 主站页面（首页/知识库/BBS）
│   │   ├── page.tsx             # AI 对话首页
│   │   ├── tools/               # 工具中心
│   │   │   ├── schedule/        # 课表导出
│   │   │   ├── grades/          # 成绩查询
│   │   │   └── enroll/          # 自动选课
│   │   ├── kb/                  # 知识库
│   │   ├── bbs/                 # 论坛
│   │   └── guestbook/           # 留言板
│   ├── api/                      # API 路由
│   │   ├── ai/chat/             # AI 对话 SSE 接口
│   │   ├── auth/                # 认证 API（登录/注册/刷新）
│   │   ├── tools/               # 工具 API（课表/成绩/选课）
│   │   ├── oauth/               # OAuth2.0/OIDC 端点
│   │   └── admin/               # 管理后台 API
│   ├── admin/                    # 管理后台页面
│   └── middleware.ts             # 全局中间件（认证/路由）
├── components/                   # React 组件
│   ├── atoms/                    # 原子组件（按钮/输入框）
│   ├── molecules/                # 分子组件（卡片/气泡）
│   └── organisms/                # 生物体组件（Header/ChatStream）
├── hooks/                        # 自定义 Hooks
│   ├── useChat.ts                # AI 对话逻辑
│   ├── useAuth.ts                # 认证状态
│   └── useSearchHistory.ts       # 搜索历史
└── lib/                          # 核心业务逻辑
    ├── ai/                       # AI 工具定义与执行
    ├── auth/                     # JWT/Session/OIDC
    ├── smu-auth.ts               # 教务系统认证
    ├── schedule.ts               # 课表爬取
    ├── grades.ts                 # 成绩查询
    ├── course-enroll.ts          # 选课逻辑
    ├── captcha-ocr.ts            # 验证码识别
    └── prisma.ts                 # 数据库客户端
```

---

## ✅ 已完成功能

### 工具子系统（tools/）⭐

| 功能 | 状态 | 亮点 |
|------|------|------|
| **📅 课表导出** | ✅ 完整 | • 自动 OCR 识别验证码（CNN 模型，67% 准确率）<br>• 支持 WakeUp + ICS 双格式<br>• 3 次重试 + 分享码机制 |
| **📊 成绩查询** | ✅ 完整 | • GPA 计算（加权 + 必修）<br>• 每门课排名查询<br>• 学期筛选 + 趋势图 |
| **⚡ 自动选课** | ✅ 完整 | • 毫秒级抢课（时间校准）<br>• 多志愿优先级<br>• VPS 代理防风控（119.29.161.78:8080）|

### 认证系统 🔐

- ✅ JWT 双令牌方案（Access Token 15 分钟 + Refresh Token 30 天）
- ✅ Session 管理（支持撤销 + IP 日志）
- ✅ 邮箱验证注册
- ✅ 问卷验证注册（防止恶意注册）
- ✅ OAuth2.0/OIDC 服务端实现（authorize/token/userinfo/jwks 端点）
- ✅ 认证中间件守卫（requireUser/requireAdmin）

### AI 功能 🤖

- ✅ OpenAI SDK 集成（兼容 LongCat API）
- ✅ Function Calling（3 个工具）
  - `search_knowledge`: 搜索知识库
  - `recommend_tool`: 推荐工具卡片
  - `convert_schedule`: 课表转换
- ✅ SSE 流式响应
- ✅ 中文 System Prompt（规范 AI 行为）

### 验证码处理 🛡️

- ✅ 采集 200 张学校验证码
- ✅ 训练 CNN 模型（准确率 67%）
- ✅ ONNX 导出（770KB，浏览器端 15ms 推理）
- ✅ 浏览器端 ONNX Runtime Web

### IP 风控绕过 🌐

- ✅ VPS 抢课代理（Python http.server，systemd 托管）
- ✅ Cloudflare Worker 代理
- ✅ 随机延迟抖动（150-350ms）
- ✅ 自动 fallback 机制

### 基础设施 ⚙️

- ✅ Prisma + SQLite（开发）/ PostgreSQL（生产）
- ✅ 速率限制（全局 + 学生级）
- ✅ API Key 管理（加密存储 + 轮转策略）
- ✅ Zod 表单验证
- ✅ 暗色主题 UI

---

## 🚧 待开发功能（P0 优先级）

### 主站 MVP

| 功能 | 状态 | 说明 |
|------|------|------|
| AI 搜索首页 | 🔸 部分完成 | ChatGPT 空态风格，已实现基础交互 |
| 知识库系统 | 🔸 部分完成 | Article 模型已定义，缺少投稿审核流程 |
| 留言板 | 🔸 基础版 | Message 模型已定义，UI 待优化 |
| 校内导航 | ⚪ 未开始 | 需要 links.json 数据收集 |
| BBS 论坛 | 🔸 部分完成 | 帖子 CRUD 已完成，缺少楼层嵌套 |

### 体验优化（P1）

| 功能 | 状态 |
|------|------|
| 深色/浅色切换 | ⚪ 未开始 |
| 搜索历史 | 🔸 已有 Hook，未接入 UI |
| 热门问题统计 | ⚪ 未开始 |

### 工具增强（P2）

| 功能 | 状态 |
|------|------|
| 验证码 OCR 准确率提升 | ⚪ 需采集更多数据重训练 |
| 选课结果通知（微信/邮件） | ⚪ 未开始 |
| 多人并发抢课队列 | ⚪ 未开始 |

---

## 📊 核心数据模型

### 用户系统

```prisma
User {
  id              String       # 用户 ID
  email           String?      # 邮箱（可选）
  username        String       # 用户名
  passwordHash    String       # bcrypt 加密
  role            String       # contributor | admin
  status          String       # active | banned
  emailVerifiedAt DateTime?
  sessions[]      Session[]
  apiTokens[]     ApiToken[]
}

Session {
  userId           String
  refreshTokenHash String       # Refresh Token Hash
  ip               String?
  userAgent        String?
  expiresAt        DateTime
  revokedAt        DateTime?
}
```

### 内容系统

```prisma
Article {
  title       String
  slug        String @unique
  content     String           # Markdown
  category    String?
  tags        String?          # JSON
  status      String           # draft | pending | published | rejected
  viewCount   Int
  authorId    String
}

Message {
  content     String
  authorId    String
  createdAt   DateTime
}
```

### AI 与工具

```prisma
SearchLog {
  query       String
  toolUsed    String?
  userId      String?
  ip          String?
}

ToolRun {
  toolName    String
  input       String           # JSON
  output      String?          # JSON
  latencyMs   Int?
  success     Boolean
}
```

### Key 管理

```prisma
ProviderKey {
  provider     String          # longcat | openai
  keyPrefix    String
  keyCipher    String          # AES-256-GCM 加密
  status       String          # active | degraded | disabled
  weight       Int             # 轮转权重
  usages[]     KeyUsage[]
}

KeyUsage {
  model            String
  promptTokens     Int
  completionTokens Int
  costUsd          Float?
  latencyMs        Int?
}
```

---

## 🔑 核心 API 端点

### 认证 API

```
POST   /api/auth/register          # 注册
POST   /api/auth/login             # 登录
POST   /api/auth/logout            # 登出
POST   /api/auth/refresh           # 刷新令牌
GET    /api/auth/me                # 当前用户
PUT    /api/auth/profile           # 更新资料
POST   /api/auth/password          # 修改密码
POST   /api/auth/email             # 邮箱验证
POST   /api/auth/quiz              # 问卷验证
```

### AI API

```
POST   /api/ai/chat                # AI 对话（SSE 流式）
```

### 工具 API

```
POST   /api/tools/schedule         # 课表导出
POST   /api/tools/grades           # 成绩查询
POST   /api/tools/enroll           # 自动选课
GET    /api/tools/captcha          # 验证码识别
POST   /api/tools/proxy            # IP 代理
```

### OAuth API

```
GET    /api/oauth/authorize        # 授权端点
POST   /api/oauth/token            # 令牌端点
GET    /api/oauth/userinfo         # 用户信息
GET    /api/oauth/jwks             # JWKS 公钥
GET    /.well-known/openid-configuration  # OIDC 元数据
```

---

## 🌟 技术亮点

### 1. AI Function Calling 架构

```typescript
// 工具定义
const tools = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "搜索知识库文章",
      parameters: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
];

// 执行流程
1. 用户提问 → AI 分析 → 生成 function call
2. 执行工具（如 FTS5 搜索）
3. 结果注入 context → AI 生成最终回答
4. SSE 流式返回前端
```

### 2. 验证码 OCR 浏览器端推理

```typescript
import * as ort from 'onnxruntime-web';

// 加载模型（770KB）
const session = await ort.InferenceSession.create('/model.onnx');

// 预处理验证码图片
const tensor = preprocessImage(imgElement); // 128x48 灰度图

// 推理（15ms）
const output = await session.run({ input: tensor });

// 解码（每列分类 → 4 位数字）
const code = decodeOutput(output);
```

### 3. 自动选课时间校准

```typescript
// 测量客户端与服务器时差
async function calibrateTime() {
  const t1 = Date.now();
  const serverTime = await fetch('/api/time').then(r => r.json());
  const t2 = Date.now();
  const offset = serverTime - (t1 + t2) / 2;
  return offset;
}

// 精准抢课
const targetTime = new Date('2024-09-01 10:00:00');
const offset = await calibrateTime();
const delay = targetTime.getTime() - Date.now() - offset;
setTimeout(() => enrollCourse(), delay);
```

### 4. Key 轮转策略

```typescript
// 基于权重的 Round-Robin
function selectKey(keys: ProviderKey[]) {
  const activeKeys = keys.filter(k => k.status === 'active');
  const totalWeight = activeKeys.reduce((sum, k) => sum + k.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const key of activeKeys) {
    random -= key.weight;
    if (random <= 0) return key;
  }
}
```

---

## 🔒 安全特性

- ✅ **认证**: JWT 双令牌 + HttpOnly Cookie
- ✅ **授权**: 中间件守卫 + 角色权限（contributor/admin）
- ✅ **加密**: bcryptjs 密码哈希 + AES-256-GCM Key 加密
- ✅ **防护**: CSRF 保护（Next.js 内置）+ 速率限制
- ✅ **日志**: Session IP + User-Agent 记录
- ✅ **撤销**: 支持 Session 撤销（登出时清理）

---

## 📈 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 验证码 OCR | 15ms | 浏览器端 ONNX Runtime |
| AI 对话首 token | <2s | 依赖上游 API |
| 课表导出 | <5s | 含 OCR + 爬虫 |
| 成绩查询 | <8s | 含并行排名查询 |
| 选课单次尝试 | <200ms | 含随机延迟 |
| SQLite 查询 | <50ms | 含索引 |

---

## 🚀 部署架构

```
┌──────────────────────────────────────────────────┐
│          Cloudflare (CDN + DNS)                 │
└──────────────────────────────────────────────────┘
                      ↓ HTTPS
┌──────────────────────────────────────────────────┐
│          OVH VPS (4C/8GB US)                    │
│  ┌────────────────────────────────────┐         │
│  │   Nginx (反向代理)                  │         │
│  └────────────────────────────────────┘         │
│              ↓                                   │
│  ┌────────────────────────────────────┐         │
│  │   Next.js (Port 3000)              │         │
│  │   PM2 托管                          │         │
│  └────────────────────────────────────┘         │
│              ↓                                   │
│  ┌────────────────────────────────────┐         │
│  │   SQLite / PostgreSQL              │         │
│  └────────────────────────────────────┘         │
└──────────────────────────────────────────────────┘
```

---

## 🎯 后续规划

### 短期（1-2 周）

- [ ] 完善知识库投稿审核流程
- [ ] 优化 AI 对话 UI（引用来源显示）
- [ ] 添加深色/浅色主题切换
- [ ] 采集更多验证码数据重训练模型

### 中期（1-2 月）

- [ ] 迁移到 PostgreSQL + Redis
- [ ] 实现选课结果通知（邮件/微信）
- [ ] 添加 E2E 测试覆盖
- [ ] 日志系统（Winston/Pino）

### 长期（3-6 月）

- [ ] 移动端 App（React Native）
- [ ] 更多工具（考试倒计时、校医院导航）
- [ ] 社区功能增强（私信、关注）
- [ ] 数据分析看板

---

## 📚 文档索引

- [实施计划](./implementation_plan.md) - 主站 MVP 详细方案
- [AI 后端方案](./ai_backend_plan.md) - CLIProxyAPI + New API 架构
- [OIDC 认证方案](./oidc_auth_plan.md) - OAuth2.0/OIDC 实现细节
- [进度追踪](./PROGRESS.md) - 功能完成状态

---

## 📞 联系信息

- **项目域名**: nanyee.de
- **技术栈**: Next.js 15 + Prisma + SQLite + OpenAI SDK
- **部署**: OVH VPS + Cloudflare CDN
- **最后更新**: 2026-03-07
