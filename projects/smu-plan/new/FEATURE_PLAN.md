# 新功能实施计划

> **日期**: 2026-03-07
> **涉及模块**: 知识库共建 + Flarum 论坛

---

## 功能一：知识库 Wiki 化共建

### 1.1 目标

将当前「投稿 → 审核 → 发布」的知识库改造为 **Wiki 式开放协作**：

- 所有已登录用户可**直接编辑任何已发布文章**，无需审核
- 所有已登录用户可**新建文章**，创建即发布
- 引入**版本历史**，支持查看和回滚任意修改
- 编辑器从纯 Markdown textarea 升级为 **所见即所得（WYSIWYG）**，小白友好
- 管理员保留**回滚**和**锁定文章**的权限

### 1.2 现状分析

| 方面 | 当前 | 目标 |
|------|------|------|
| 权限 | 作者写 draft → 管理员审核 → 发布 | 所有登录用户直接编辑/创建，即时生效 |
| 编辑器 | 纯 `<textarea>` + Markdown | WYSIWYG 富文本编辑器 |
| 版本控制 | 无 | 每次保存创建版本快照，可回滚 |
| 文章状态 | draft → pending → published/rejected | published（默认） / locked（管理员锁定） |
| 内容格式 | Markdown only | HTML（编辑器输出） + 兼容渲染旧 Markdown |

### 1.3 编辑器选型

对比主流开源 WYSIWYG 编辑器：

| 编辑器 | 包大小 | 特点 | 推荐度 |
|--------|--------|------|--------|
| **Tiptap** (ProseMirror) | ~150KB gz | 模块化、可扩展、社区活跃、Vue/React 都支持 | ⭐⭐⭐⭐⭐ |
| Quill | ~43KB gz | 简单易用，但定制性差、维护缓慢 | ⭐⭐⭐ |
| Lexical (Meta) | ~30KB gz | 新、性能好，但生态不够成熟 | ⭐⭐⭐ |
| Editor.js | ~60KB gz | Block 式、JSON 输出，但不是传统 WYSIWYG | ⭐⭐⭐ |
| CKEditor 5 | ~200KB gz | 功能强但开源版受限，商业授权复杂 | ⭐⭐ |

**推荐方案：Tiptap**

理由：
1. 基于 ProseMirror，久经考验的编辑内核
2. React 原生支持（`@tiptap/react`），与 Next.js 完美集成
3. 模块化扩展：标题、列表、代码块、图片、表格等按需加载
4. 协作编辑（yjs）预留扩展能力
5. Markdown 快捷键支持（输入 `# ` 自动转为 H1，`- ` 自动转为列表）
6. 输出 HTML，渲染零解析成本

### 1.4 数据模型变更

#### 修改 Article 模型

```prisma
model Article {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
- content     String    // Markdown
+ content     String    // HTML（Tiptap 输出）
+ format      String    @default("html") // "html" | "markdown"（兼容旧文章）
  summary     String?
  category    String?
  tags        String?   // JSON string
- status      String    @default("draft") // draft | pending | published | rejected
+ status      String    @default("published") // published | locked
  viewCount   Int       @default(0)
  authorId    String                    // 原始创建者
  author      User      @relation(fields: [authorId], references: [id])
- reviewerId  String?
+ lastEditorId String?                  // 最后编辑者
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  publishedAt DateTime?
+ lockedAt    DateTime?                 // 管理员锁定时间
+ lockedBy    String?                   // 锁定者 ID

+ revisions   ArticleRevision[]

  @@index([status])
  @@index([category])
  @@index([publishedAt])
}
```

#### 新增 ArticleRevision 模型

```prisma
model ArticleRevision {
  id          String   @id @default(cuid())
  articleId   String
  article     Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  title       String
  content     String                  // 编辑前的完整内容快照
  format      String   @default("html")
  summary     String?
  editorId    String                  // 执行编辑的用户 ID
  editSummary String?                 // 编辑摘要（可选，如"修正了第三节的错别字"）
  createdAt   DateTime @default(now())

  @@index([articleId, createdAt])
  @@index([editorId])
}
```

### 1.5 API 变更

#### 简化后的知识库 API

```
GET    /api/wiki                     # 列表（已发布，带搜索）— 不变
GET    /api/wiki/[slug]              # 文章详情 — 不变
POST   /api/wiki                     # 创建文章（登录用户）— 改为直接发布
PUT    /api/wiki/[id]                # 编辑文章（登录用户）— 放开权限
DELETE /api/wiki/[id]                # 删除文章（仅管理员）

GET    /api/wiki/[id]/revisions      # 查看版本历史
POST   /api/wiki/[id]/revert/[revId] # 回滚到指定版本（仅管理员）
PATCH  /api/wiki/[id]/lock           # 锁定/解锁文章（仅管理员）
```

#### 权限对照表

| 操作 | 匿名 | 登录用户 | 管理员 |
|------|------|---------|--------|
| 浏览文章 | ✅ | ✅ | ✅ |
| 创建文章 | ❌ | ✅ 直接发布 | ✅ |
| 编辑任意文章 | ❌ | ✅ 未锁定的文章 | ✅ 包括锁定的 |
| 删除文章 | ❌ | ❌ | ✅ |
| 查看版本历史 | ✅ | ✅ | ✅ |
| 回滚版本 | ❌ | ❌ | ✅ |
| 锁定文章 | ❌ | ❌ | ✅ |

### 1.6 前端实现方案

#### 安装依赖

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image \
  @tiptap/extension-table @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-code-block-lowlight @tiptap/extension-highlight \
  @tiptap/extension-underline @tiptap/extension-text-align \
  @tiptap/pm lowlight
```

#### 编辑器组件设计

```
src/components/
├── organisms/
│   └── WikiEditor/
│       ├── WikiEditor.tsx          # 主编辑器组件（Tiptap 实例）
│       ├── WikiEditor.module.css   # 编辑器样式
│       ├── Toolbar.tsx             # 工具栏（加粗/标题/列表/图片…）
│       └── extensions.ts           # Tiptap 扩展配置
```

#### 编辑器能力清单

```
基础格式:
├── 标题 (H1-H3)
├── 粗体、斜体、下划线、删除线
├── 有序列表、无序列表
├── 引用块
├── 分割线
├── 文本对齐 (左/中/右)

高级功能:
├── 代码块（语法高亮）
├── 表格（增删行列）
├── 图片插入（上传 / URL）
├── 链接
├── 高亮文本

快捷键（Markdown 习惯兼容）:
├── # + 空格 → H1
├── ## + 空格 → H2
├── - + 空格 → 无序列表
├── 1. + 空格 → 有序列表
├── > + 空格 → 引用块
├── ``` → 代码块
├── Ctrl+B → 粗体
└── Ctrl+I → 斜体
```

#### 页面改造清单

| 页面 | 变更 |
|------|------|
| `/kb` 列表页 | 增加「新建文章」按钮（登录可见）；移除审核状态标签 |
| `/kb/[slug]` 详情页 | 所有登录用户显示「编辑」按钮；增加「版本历史」链接 |
| `/editor` 编辑页 | textarea 替换为 Tiptap WikiEditor；移除提交审核流程 |
| `/kb/[slug]/history` | 新增：版本历史页面（diff 对比 + 回滚按钮） |

### 1.7 旧内容迁移

现有 Markdown 文章需要兼容处理：

```typescript
// 渲染时检查 format 字段
function renderArticle(article: Article) {
  if (article.format === "markdown") {
    // 旧文章：用 marked 渲染 Markdown → HTML
    return marked(article.content);
  }
  // 新文章：直接返回 HTML
  return article.content;
}

// 编辑旧文章时：自动转换
function loadForEdit(article: Article) {
  if (article.format === "markdown") {
    // 将 Markdown 转为 HTML 后加载到 Tiptap
    return { content: marked(article.content), format: "html" };
  }
  return { content: article.content, format: article.format };
}
```

保存时统一输出 HTML，`format` 字段更新为 `"html"`。旧 Markdown 文章在首次编辑后自动迁移。

### 1.8 防滥用措施

尽管取消审核，仍需防止恶意破坏：

| 措施 | 说明 |
|------|------|
| **版本历史** | 每次编辑自动保存全量快照，任何破坏行为可一键回滚 |
| **管理员锁定** | 关键文章（如校规解读）可锁定，仅管理员编辑 |
| **速率限制** | 每用户每分钟最多 10 次编辑操作 |
| **编辑日志** | 记录编辑者 ID + IP + 时间，方便审计 |
| **内容长度限制** | 单篇文章最大 50,000 字符 |
| **XSS 防护** | Tiptap 输出 HTML 需在服务端过滤（sanitize-html） |

### 1.9 实施步骤

```
Phase 1: 数据模型升级（0.5 天）
├── 修改 Article schema（加 format/lastEditorId/lockedAt/lockedBy）
├── 新增 ArticleRevision 模型
├── 运行 prisma migrate dev
└── 更新现有文章 format="markdown"

Phase 2: 后端 API 改造（1 天）
├── POST /api/wiki → 创建即发布（status="published"）
├── PUT /api/wiki/[id] → 放开编辑权限 + 自动创建 revision
├── GET /api/wiki/[id]/revisions → 版本历史列表
├── POST /api/wiki/[id]/revert/[revId] → 回滚（admin only）
├── PATCH /api/wiki/[id]/lock → 锁定切换（admin only）
└── DELETE /api/wiki/[id] → 删除（admin only）

Phase 3: 编辑器集成（1.5 天）
├── 安装 Tiptap + 扩展依赖
├── 实现 WikiEditor 组件 + Toolbar
├── 图片上传接口（/api/wiki/upload）
├── 改造 /editor 页面
└── 适配暗色主题样式

Phase 4: 前端页面改造（1 天）
├── /kb 列表页 → 增加新建按钮，移除审核标签
├── /kb/[slug] → 放开编辑按钮，处理 locked 状态
├── 新增 /kb/[slug]/history 版本历史页
├── 旧 Markdown 内容渲染兼容
└── 编辑旧文章时自动迁移格式

Phase 5: 安全加固（0.5 天）
├── 服务端 HTML sanitize（sanitize-html 库）
├── 编辑速率限制
├── XSS 测试
└── 集成测试
```

**预估总工作量：4.5 天**

---

## 功能二：Flarum 论坛部署

### 2.1 目标

用 Flarum 替代当前自建的简陋 BBS，部署到 **chat.nanyee.de** 子站：

- 开箱即用的现代论坛体验（实时通知、@提及、搜索、标签…）
- 通过 SSO 对接主站认证（用户只需在 nanyee.de 登录一次）
- 独立部署，不影响主站稳定性
- 保留主站 BBS 数据（可选迁移）

### 2.2 Flarum 简介

[Flarum](https://flarum.org) 是一个现代化、轻量级的开源论坛软件：

| 特性 | 说明 |
|------|------|
| **技术栈** | PHP 8.1+ / Laravel + MySQL/MariaDB / Mithril.js 前端 |
| **开箱功能** | 标签分类、@提及、实时通知、搜索、表情、Markdown |
| **扩展生态** | 300+ 官方与社区扩展（SSO、OAuth、夜间模式、投票…） |
| **授权协议** | MIT |
| **部署方式** | Composer 安装（类似 npm） |

### 2.3 部署架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Cloudflare DNS                            │
│  nanyee.de      → VPS:3000  (Next.js 主站)                  │
│  chat.nanyee.de → VPS:8080  (Flarum 论坛)                   │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                   OVH VPS (4C/8GB)                          │
│                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐        │
│  │     Nginx           │     │     Nginx            │       │
│  │  nanyee.de          │     │  chat.nanyee.de      │       │
│  │  → proxy 3000       │     │  → php-fpm :9000     │       │
│  └─────────────────────┘     └─────────────────────┘        │
│          ↓                           ↓                       │
│  ┌─────────────────────┐     ┌─────────────────────┐        │
│  │   Next.js           │     │   PHP-FPM 8.3       │        │
│  │   Port 3000         │     │   (Flarum)           │       │
│  │   SQLite/PG         │     │   MySQL 8.0          │       │
│  └─────────────────────┘     └─────────────────────┘        │
│                                                              │
│         ←———— SSO (OAuth2.0/OIDC) ————→                    │
│     nanyee.de 作为 OIDC Provider                             │
│     Flarum 作为 OIDC Client                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 SSO 单点登录方案

你的主站已经实现了完整的 **OIDC Provider**（authorize/token/userinfo/jwks 端点），这是巨大的优势——Flarum 可以直接对接。

#### Flarum 端：安装 OAuth 扩展

```bash
# Flarum 社区有多个 OAuth/OIDC 登录扩展
composer require fof/oauth           # FriendsOfFlarum OAuth（推荐）
# 或
composer require maicol07/flarum-oidc-client  # 通用 OIDC 客户端
```

#### 配置流程

**Step 1: 在 nanyee.de 注册 Flarum 为 OAuth Client**

在主站数据库的 `OAuthClient` 表中插入：

```sql
INSERT INTO OAuthClient (id, clientId, clientSecret, name, redirectUris, grants, scopes) VALUES (
  'flarum-client-001',
  'flarum-chat',
  '$2b$10$... (bcrypt hash of secret)',  -- 生成一个强随机密钥
  'Flarum 论坛',
  '["https://chat.nanyee.de/auth/callback"]',
  '["authorization_code"]',
  '["openid","profile","email"]'
);
```

**Step 2: Flarum 管理后台配置 OAuth**

```
Provider: Custom OAuth / OIDC
─────────────────────────────────────
Client ID:          flarum-chat
Client Secret:      (上面生成的密钥明文)
Authorization URL:  https://nanyee.de/api/oauth/authorize
Token URL:          https://nanyee.de/api/oauth/token
Userinfo URL:       https://nanyee.de/api/oauth/userinfo

Scopes:             openid profile email
Button Label:       用 nanyee.de 账号登录
Button Icon:        fas fa-graduation-cap
```

**Step 3: 用户登录流程**

```
1. 用户访问 chat.nanyee.de
2. 点击「用 nanyee.de 账号登录」
3. 跳转到 nanyee.de/api/oauth/authorize
   → 如果已登录主站：直接授权
   → 如果未登录：先登录再授权
4. 授权后回调 chat.nanyee.de/auth/callback?code=xxx
5. Flarum 用 code 换 token → 取 userinfo
6. 自动创建/关联 Flarum 账号
7. 登录成功，进入论坛
```

### 2.5 服务端环境准备

OVH VPS 需要安装以下组件（如果尚未安装）：

#### PHP 环境

```bash
# 安装 PHP 8.3 + 必要扩展
sudo apt update
sudo apt install -y php8.3-fpm php8.3-mbstring php8.3-xml php8.3-zip \
  php8.3-gd php8.3-curl php8.3-mysql php8.3-tokenizer php8.3-dom

# 安装 Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

#### MySQL 数据库

```bash
# 安装 MySQL 8.0
sudo apt install -y mysql-server

# 创建 Flarum 数据库和用户
sudo mysql -e "
  CREATE DATABASE flarum CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'flarum'@'localhost' IDENTIFIED BY '<strong_password_here>';
  GRANT ALL PRIVILEGES ON flarum.* TO 'flarum'@'localhost';
  FLUSH PRIVILEGES;
"
```

### 2.6 Flarum 安装步骤

```bash
# 创建 Flarum 目录
sudo mkdir -p /var/www/flarum
cd /var/www/flarum

# Composer 安装 Flarum
composer create-project flarum/flarum . --stability=stable

# 设置文件权限
sudo chown -R www-data:www-data /var/www/flarum
sudo chmod -R 755 /var/www/flarum/storage
```

### 2.7 Nginx 配置

```nginx
# /etc/nginx/sites-available/chat.nanyee.de

server {
    listen 80;
    server_name chat.nanyee.de;

    # Cloudflare SSL termination → 这里用 HTTP
    # 若需要 Full SSL，加 listen 443 ssl + 证书

    root /var/www/flarum/public;
    index index.php;

    # Flarum URL 重写
    include /var/www/flarum/.nginx.conf;

    location ~ \.php$ {
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/chat.nanyee.de /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2.8 Flarum 推荐扩展

| 扩展 | 用途 | 安装命令 |
|------|------|---------|
| **fof/oauth** | SSO 对接 nanyee.de | `composer require fof/oauth` |
| **fof/nightmode** | 暗色主题（与主站统一） | `composer require fof/nightmode` |
| **flarum/markdown** | Markdown 支持 | 内置 |
| **flarum/mentions** | @提及通知 | 内置 |
| **flarum/tags** | 标签分类 | 内置 |
| **flarum/likes** | 点赞 | 内置 |
| **flarum/subscriptions** | 帖子订阅 | 内置 |
| **fof/upload** | 图片/文件上传 | `composer require fof/upload` |
| **fof/formatting** | 富文本格式化 | `composer require fof/formatting` |
| **flarum-lang/chinese-simplified** | 中文语言包 | `composer require flarum-lang/chinese-simplified` |

### 2.9 Cloudflare DNS 配置

```
Type: CNAME
Name: chat
Content: nanyee.de (或 VPS IP 的 A 记录)
Proxy: Proxied (橙色云)
```

### 2.10 主站 BBS 数据迁移（可选）

如果需要把现有 BBS 数据迁移到 Flarum：

```typescript
// tools/migrate-bbs-to-flarum.ts

// 1. 读取现有 BBS 数据
const topics = await prisma.bbsTopic.findMany({ include: { replies: true } });

// 2. 通过 Flarum REST API 或直接写 MySQL 导入
for (const topic of topics) {
  // Flarum discussions 表
  await flarumDb.query(`
    INSERT INTO discussions (title, slug, comment_count, ...)
    VALUES (?, ?, ?, ...)
  `, [topic.title, slugify(topic.title), topic.replyCount + 1]);

  // 主楼 + 回复 → Flarum posts 表
  // ...
}
```

> **建议**: 现有 BBS 数据量不大的话，手动迁移或直接新起跑更省事。

### 2.11 主站改造

迁移到 Flarum 后，主站 BBS 模块需要调整：

| 改动 | 说明 |
|------|------|
| Header 导航 | 「论坛」链接改为 `https://chat.nanyee.de` |
| 移除 `/bbs` 路由 | 或保留一个跳转页：「论坛已迁移到 chat.nanyee.de」 |
| 移除 BBS API | `/api/bbs/*` 可以废弃（保留一段时间做 301 重定向） |
| AI 工具联动 | AI function calling 中若有 BBS 相关工具，更新链接 |

### 2.12 实施步骤

```
Phase 1: 服务端环境（0.5 天）
├── 安装 PHP 8.3 + FPM
├── 安装 MySQL 8.0
├── 创建数据库 + 用户
└── 安装 Composer

Phase 2: Flarum 部署（0.5 天）
├── Composer 安装 Flarum
├── Web 安装向导
├── Nginx 配置 chat.nanyee.de
├── Cloudflare DNS 添加 CNAME
└── HTTPS 验证

Phase 3: 扩展与主题（0.5 天）
├── 安装中文语言包
├── 安装 fof/oauth + 配置 SSO
├── 安装 fof/nightmode + 适配暗色风格
├── 安装 fof/upload（图片上传）
├── 配置标签/分类（general/study/life/trade/question）
└── 自定义 CSS（与主站视觉统一）

Phase 4: SSO 对接（0.5 天）
├── 在主站 OAuthClient 表中注册 Flarum 客户端
├── 验证 OIDC 流程：authorize → callback → userinfo
├── 测试：新用户首次 SSO 登录
├── 测试：已有用户 SSO 登录
└── 测试：未登录时重定向

Phase 5: 迁移与上线（0.5 天）
├── （可选）迁移现有 BBS 数据
├── 主站 Header 链接更新
├── /bbs 页面改为跳转页
├── 通知公告：论坛已迁移
└── 监控运行状态

Phase 6: 清理（后续）
├── 移除主站 BBS API 代码
├── 移除 BbsTopic / BbsReply 模型（确认无用后）
└── 清理相关组件
```

**预估总工作量：2.5 天**

---

## 整体实施时间线

```
 Day 1    ┃ 知识库 Phase 1-2: 数据模型升级 + API 改造
 Day 2    ┃ 知识库 Phase 3: Tiptap 编辑器集成
 Day 3    ┃ 知识库 Phase 4-5: 前端改造 + 安全加固
 Day 4    ┃ AI 搜索 Phase 1: Prompt 调优 + FTS5 替代全表扫描
 Day 5    ┃ AI 搜索 Phase 2-3: 排序优化 + 缓存 + 效果验证
 Day 6    ┃ Flarum Phase 1-3: 环境准备 + 部署 + 扩展安装
 Day 7    ┃ Flarum Phase 4-5: SSO 对接 + 上线
          ┃
 Day 8+   ┃ 集成测试 & 迭代
```

---

## 风险与注意事项

### 知识库

| 风险 | 应对 |
|------|------|
| 恶意用户大面积破坏文章 | 版本历史 + 管理员一键回滚 + 速率限制 |
| XSS 注入（HTML 内容） | 服务端 sanitize-html 过滤 + CSP 策略 |
| Tiptap 包体积影响首屏 | dynamic import + React.lazy 按需加载编辑器 |
| 旧 Markdown 文章兼容 | format 字段区分，渲染时分别处理 |

### Flarum

| 风险 | 应对 |
|------|------|
| PHP 环境与 Node.js 共存 | 分端口部署，Nginx 按域名分流 |
| VPS 内存压力（MySQL + PHP-FPM + Node） | MySQL 限制 buffer_pool_size；PHP-FPM 限制 max_children=5 |
| SSO 登录失败 | OIDC 端点已测试，确保 redirect_uri 精确匹配 |
| Flarum 升级兼容性 | 锁定 composer.lock，升级前备份 |
| 与主站视觉风格不统一 | 通过 Flarum 自定义 CSS + fof/nightmode 尽量对齐 |

---

## 功能三：AI 搜索知识库优化

### 3.1 现状问题分析

通过阅读 `src/lib/ai/executor.ts`、`src/lib/ai/client.ts`（System Prompt）和 `src/lib/ai/tools.ts` 的完整源码，发现以下核心问题：

#### 问题 1：强制全盘搜索 ❌

System Prompt 写死了「**收到用户提问后，你必须首先调用 search_knowledge**」，导致：

```
用户: "你好"               → AI 强行搜索 "你好"      → 无意义，浪费 token
用户: "帮我导出课表"        → AI 先搜索 "导出课表"    → 应该直接推荐工具
用户: "谢谢你"             → AI 强行搜索 "谢谢"      → 荒谬
用户: "刚才的结果对吗？"    → AI 搜索 "结果对吗"      → 应该看对话上下文
```

**每次对话固定多一轮 function call → 多一次 AI API 请求 → 延迟翻倍 + token 翻倍**

#### 问题 2：根本没用 FTS5 ❌

虽然项目配置了 FTS5 虚拟表（`prisma/fts5.sql`），但 AI 搜索工具的实际逻辑是：

```typescript
// executor.ts 中的实现 —— 全量内存扫描！
const allPublished = await prisma.article.findMany({
  where: { status: "published" },
  select: { id: true, title: true, summary: true, content: true, slug: true },
});
// 然后用 JavaScript 的 .includes() 逐篇文章匹配
```

**每次搜索加载全部文章到内存 → O(N×M) 暴力匹配 → 文章越多越慢**

FTS5 只在 `/api/wiki?q=xxx`（知识库列表页搜索）中使用，AI 工具完全没调用它。

#### 问题 3：中文分词粗糙 ❌

```typescript
// 2 字符滑窗，噪声极大
"图书馆开放时间" → ["图书", "书馆", "馆开", "开放", "放时", "时间"]
                          ^^^^          ^^^^
                         噪声关键词：匹配到无关文章
```

`"馆开"` `"放时"` 这种无意义的 2-gram 会导致误匹配，降低搜索精度。

#### 问题 4：评分模型原始 ❌

```typescript
// 只算命中几个关键词，不区分权重
for (const kw of keywords) {
  if (searchable.includes(kw.toLowerCase())) {
    score++;  // 标题命中和内容命中同权？"图书" 和 "时间" 同权？
  }
}
```

没有 TF-IDF，没有字段权重（标题 > 摘要 > 正文），没有位置加权。

### 3.2 优化方案

#### 方案总览

```
                        ┌───────────────┐
                        │   用户提问     │
                        └──────┬────────┘
                               ↓
                    ┌─────────────────────┐
         改动 1 →   │  AI 自主判断意图      │ ← 去掉强制搜索
                    │  (system prompt 调优) │
                    └──────┬──────────────┘
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
         闲聊/问候    工具操作意图    需要知识的问题
         直接回复     recommend_tool  search_knowledge
                                          │
                                          ↓
                              ┌─────────────────────┐
                   改动 2 →   │  FTS5 搜索替代全表扫描 │
                              └──────────┬──────────┘
                                         ↓
                              ┌─────────────────────┐
                   改动 3 →   │  加权排序 + 摘要裁剪   │
                              └──────────┬──────────┘
                                         ↓
                              ┌─────────────────────┐
                   改动 4 →   │  结果缓存（热门问题）  │
                              └─────────────────────┘
```

---

#### 改动 1：System Prompt 重写 — 让 AI 自主判断

**核心思路**：不再强制搜索，而是教 AI 什么时候该搜、什么时候不该搜。

```
现有 Prompt（问题）:
  "收到用户提问后，你必须首先调用 search_knowledge 搜索知识库"

优化后 Prompt:
  "根据用户意图选择合适的行为"
```

**新 System Prompt 草案**：

```markdown
你是 nanyee.de 的 AI 助手，服务南方医科大学师生。

## 行为决策树

收到用户消息后，按以下优先级判断：

1. **闲聊/问候/致谢** → 直接回复，不调用任何工具
   示例: "你好" "谢谢" "再见" "能做什么"

2. **工具操作意图** → 调用 recommend_tool，不搜索
   关键词映射:
   - 课表/导出/WakeUp/ICS → recommend_tool(intent="schedule")
   - 成绩/GPA/绩点/排名 → recommend_tool(intent="grades")
   - 选课/抢课/退补选 → recommend_tool(intent="enroll")

3. **校园知识问题** → 调用 search_knowledge 搜索
   示例: "图书馆几点开门" "转专业条件" "奖学金评选"
   搜索技巧: 提取核心名词 2-4 个词，不加冗余修饰

4. **追问/澄清** → 结合对话上下文回答
   如果上一轮已搜索过知识库，优先使用已有结果
   只有需要新信息时才再次搜索

## 搜索结果处理
- 有结果 → 基于搜索结果回答，附来源链接
- 无结果 → 用你的知识回答，注明"知识库中暂无该信息"
- 不确定 → 明确告知，不编造

## 格式
- Markdown 格式（标题、列表、粗体）
- 默认中文
```

**预期效果**：

| 用户输入 | 优化前 | 优化后 |
|---------|--------|--------|
| "你好" | 搜索 → 空结果 → 回复（2 轮 API 调用） | 直接回复（1 轮） |
| "帮我导课表" | 搜索 → 再推荐工具（2 轮） | 直接推荐工具（1 轮） |
| "图书馆开门时间" | 搜索 → 回答（2 轮，不变） | 搜索 → 回答（2 轮，不变） |
| "刚才说的对吗" | 搜索 "对吗" → 空（2 轮） | 看上下文直接回复（1 轮） |

**Token 节省估算**：约 40-60% 的对话可以跳过搜索步骤，每次节省约 500-1500 token。

---

#### 改动 2：搜索引擎升级 — FTS5 替代全表扫描

**核心改造**：`executor.ts` 中的 `search_knowledge` 从内存暴力匹配改为 FTS5 查询。

**改造前**：

```typescript
// ❌ 加载全部文章到内存，JS 逐篇 .includes() 匹配
const allPublished = await prisma.article.findMany({ where: { status: "published" } });
const results = allPublished.filter(a => keywords.some(kw => a.content.includes(kw)));
```

**改造后**：

```typescript
// ✅ 直接查询 FTS5 虚拟表
async function searchKnowledge(query: string): Promise<SearchResult[]> {
  // 1. 构建 FTS5 查询表达式
  const ftsQuery = buildFtsQuery(query);
  // 例: "图书馆 OR 开放 OR 时间"

  // 2. FTS5 查询（利用 SQLite 内建倒排索引，毫秒级）
  const hits = await prisma.$queryRawUnsafe<FtsHit[]>(`
    SELECT
      f.article_id,
      f.title,
      f.summary,
      f.slug,
      rank                          -- FTS5 内建 BM25 评分
    FROM article_fts f
    WHERE article_fts MATCH ?
    ORDER BY rank                   -- BM25 自动排序：标题命中 > 正文命中
    LIMIT 5
  `, ftsQuery);

  // 3. 如果 FTS5 结果不足，fallback 到 LIKE 模糊匹配
  if (hits.length < 2) {
    const likeHits = await fallbackLikeSearch(query);
    hits.push(...likeHits);
  }

  return hits;
}
```

**FTS5 查询构建器**：

```typescript
function buildFtsQuery(query: string): string {
  // 按空格和标点分词
  const tokens = query
    .split(/[\s,，。？！、；：·\-/\\]+/)
    .filter(t => t.length >= 2);

  if (tokens.length === 0) return query;

  // 用 OR 连接所有 token（宽松匹配，提升召回率）
  // FTS5 的 BM25 评分会自动处理相关性排序
  return tokens.map(t => `"${t}"`).join(" OR ");
}
```

**性能对比**：

| 指标 | 全表扫描（现在） | FTS5（优化后） |
|------|----------------|---------------|
| 100 篇文章 | ~50ms | ~2ms |
| 1,000 篇文章 | ~500ms | ~3ms |
| 10,000 篇文章 | ~5s（不可用） | ~5ms |
| 内存占用 | 加载全量 content 到内存 | 仅返回匹配结果 |
| 相关性排序 | 关键词命中数 | BM25（学术级算法） |

---

#### 改动 3：搜索结果优化 — 字段加权 + 智能摘要

**FTS5 字段权重配置**：

```sql
-- 升级 FTS5 表定义，添加列权重
-- 在 fts5.sql 中修改
CREATE VIRTUAL TABLE article_fts USING fts5(
  title,
  summary,
  content,
  slug UNINDEXED,
  article_id UNINDEXED,
  -- 列权重: 标题 10x，摘要 5x，正文 1x
  -- 通过 rank 函数指定
);
```

查询时使用权重化的 BM25 排序：

```sql
SELECT article_id, title, summary, slug,
  bm25(article_fts, 10.0, 5.0, 1.0) AS score
  --                 ^标题  ^摘要  ^正文 权重
FROM article_fts
WHERE article_fts MATCH ?
ORDER BY score
LIMIT 5
```

**智能摘要裁剪** — 搜索结果只返回相关片段，减少注入 context 的 token 量：

```typescript
// 改造前：固定截取前 300 字
contentSnippet = article.content.slice(0, 300);

// 改造后：提取命中关键词附近的片段
function extractSnippet(content: string, keywords: string[], maxLen = 200): string {
  // 找到第一个关键词出现的位置
  let bestPos = 0;
  for (const kw of keywords) {
    const idx = content.toLowerCase().indexOf(kw.toLowerCase());
    if (idx !== -1) { bestPos = idx; break; }
  }

  // 以该位置为中心，前后各取 100 字符
  const start = Math.max(0, bestPos - 100);
  const end = Math.min(content.length, bestPos + 100);
  const snippet = content.slice(start, end);

  return (start > 0 ? "…" : "") + snippet + (end < content.length ? "…" : "");
}
```

**Token 消耗对比**：

| 方面 | 现在 | 优化后 |
|------|------|--------|
| 每篇文章注入 context | ~300 字符 × 5 篇 = 1500 字符 | ~200 字符 × 3 篇 = 600 字符 |
| 无关文章干扰 | 高（滑窗噪声匹配） | 低（BM25 精确排序） |
| 返回结果数 | 固定 5 篇 | 动态：高相关 3 篇，低相关时少返回 |

---

#### 改动 4：热门查询缓存

对高频问题的搜索结果缓存，避免重复计算：

```typescript
// 简单的内存 LRU 缓存（适合 SQLite 单实例部署）
const searchCache = new Map<string, { result: SearchResult[]; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟
const CACHE_MAX = 200;             // 最多缓存 200 个查询

async function cachedSearch(query: string): Promise<SearchResult[]> {
  const key = query.trim().toLowerCase();

  // 命中缓存
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.result;
  }

  // 执行搜索
  const result = await searchViaFts5(query);

  // 写入缓存（淘汰最旧的）
  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
  searchCache.set(key, { result, ts: Date.now() });

  return result;
}
```

**文章更新时清除缓存**：

```typescript
// 在 PUT /api/wiki/[id] 中
searchCache.clear(); // 文章更新后清空全部缓存
```

---

#### 改动 5（可选进阶）：语义搜索 — Embedding 向量检索

如果后续知识库规模增长（>500 篇）或用户的提问方式多样化（同义词、口语化表达），可以引入向量搜索：

**方案**：调用模型生成 embedding → 存入向量索引 → 余弦相似度检索

```
用户: "大学附近哪里看病方便"
                 │
  关键词搜索 ×   │  FTS5 搜不到"看病"对应"校医院"
  语义搜索 ✓   │  embedding 相似度匹配到"校医院就诊指南"
```

**轻量实现路径**（无需外部向量数据库）：

```typescript
// 1. 文章入库时生成 embedding
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",  // 1536 维，成本极低
  input: `${article.title} ${article.summary}`
});
// 存入 Article 表的 embedding 列（JSON 字符串）

// 2. 搜索时：先 FTS5 粗筛，再 embedding 精排
async function hybridSearch(query: string) {
  // 第一级：FTS5 召回 Top 20
  const candidates = await fts5Search(query, 20);

  // 第二级：embedding 精排
  const queryEmb = await getEmbedding(query);
  const ranked = candidates
    .map(c => ({ ...c, sim: cosineSim(queryEmb, c.embedding) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);

  return ranked;
}
```

> **注意**：这个改动可以作为 Phase 2 或更后期的优化，当前 FTS5 + BM25 对中等规模知识库已足够好。

---

### 3.3 改动影响范围

| 文件 | 改动内容 |
|------|---------|
| `src/lib/ai/client.ts` | 重写 System Prompt |
| `src/lib/ai/executor.ts` | search_knowledge 改用 FTS5 + 智能摘要 + 缓存 |
| `src/lib/ai/tools.ts` | 调整 search_knowledge 的 description（去掉"必须首先调用"） |
| `prisma/fts5.sql` | BM25 权重配置（可选） |
| `src/app/api/ai/chat/route.ts` | 无需改动（function calling 流程不变） |
| `src/hooks/useChat.ts` | 无需改动 |

### 3.4 实施步骤

```
Phase 1: Prompt 调优 + 搜索引擎替换（1 天）
├── 重写 System Prompt（改动 1）
├── executor.ts 中 search_knowledge 改用 FTS5（改动 2）
├── tools.ts description 去掉强制搜索措辞
├── 实现 buildFtsQuery() 查询构建器
├── 实现 extractSnippet() 智能摘要
└── 测试：闲聊 / 工具意图 / 知识问题三类场景

Phase 2: 排序优化 + 缓存（0.5 天）
├── FTS5 BM25 列权重配置（改动 3）
├── 实现 LRU 搜索缓存（改动 4）
├── 文章更新时清除缓存
└── 对比测试：搜索相关性 + 响应延迟

Phase 3: 效果验证（0.5 天）
├── 拿 SearchLog 历史查询数据做回测
├── 统计 token 消耗变化
├── 统计平均搜索延迟变化
└── 调整 Prompt / 权重参数

Phase 4（可选，后期）: 语义搜索
├── 引入 embedding 模型
├── 文章入库时生成 embedding
├── 实现 FTS5 粗筛 + embedding 精排
└── 适用于知识库 > 500 篇时
```

**预估工作量：2 天（Phase 1-3）**

### 3.5 预期收益

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 平均 API 调用轮数 | 2 轮（强制搜索） | 1.3 轮（40% 跳过搜索） | **-35%** |
| 每次对话 token 消耗 | ~2000 token | ~1200 token | **-40%** |
| 搜索延迟（100 篇） | ~50ms | ~2ms | **-96%** |
| 搜索精度（主观） | 低（滑窗噪声） | 高（BM25 排序） | 显著提升 |
| 首次响应延迟 | ~3s（搜索+回答） | ~1.5s（跳过搜索时） | **-50%** |

---

## 整体实施时间线

### 知识库新增依赖

```json
{
  "@tiptap/react": "^2.x",
  "@tiptap/starter-kit": "^2.x",
  "@tiptap/extension-image": "^2.x",
  "@tiptap/extension-table": "^2.x",
  "@tiptap/extension-table-row": "^2.x",
  "@tiptap/extension-table-cell": "^2.x",
  "@tiptap/extension-table-header": "^2.x",
  "@tiptap/extension-link": "^2.x",
  "@tiptap/extension-placeholder": "^2.x",
  "@tiptap/extension-code-block-lowlight": "^2.x",
  "@tiptap/extension-highlight": "^2.x",
  "@tiptap/extension-underline": "^2.x",
  "@tiptap/extension-text-align": "^2.x",
  "@tiptap/pm": "^2.x",
  "lowlight": "^3.x",
  "sanitize-html": "^2.x"
}
```

### Flarum 服务端依赖

```
PHP 8.1+
MySQL 8.0+ / MariaDB 10.4+
Composer 2.x
Nginx / Apache
```
