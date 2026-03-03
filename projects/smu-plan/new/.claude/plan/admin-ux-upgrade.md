# Admin & UX Upgrade Plan

## 执行顺序
T4首页UX → T5 KB投稿 → T6 Profile → T1 内容管理 → T3 可调控 → T2 New-API

---

## T4: 首页UX优化 [S]

### 改动
**文件**: `src/app/(main)/page.tsx` + `page.module.css`

1. **删除热门标签**: 删除 `HOT_TAGS` 常量、`handleTagClick`、`.tags` JSX区块和CSS
2. **工具区改为3列grid**:
   - `.toolsGrid` 改为 `display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-md);`
   - 每张卡片改为垂直布局(图标居中→标题→描述)
   - 图标用SVG替代emoji，带3px黑描边
3. **hover动画**: `transform: translate(-4px, -4px); box-shadow: 8px 8px 0px var(--border-color);`
   - 过渡: `transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);`
4. **移动端**: 3列→1列 `@media (max-width: 768px)`

---

## T5: KB投稿入口 [S]

### 改动
**文件**: `src/app/(main)/kb/page.tsx`

1. 页面顶部标题栏右侧添加 `NeoButton`(primary, href="/editor") 文字"投稿"
2. 需import NeoButton和Link

---

## T6: 用户Profile [M]

### 后端API
**新文件**:
- `src/app/api/auth/profile/route.ts` — GET(个人信息+统计) / PATCH(改昵称)
- `src/app/api/auth/password/route.ts` — POST(改密码, 需旧密码bcrypt验证)
- `src/app/api/auth/profile/posts/route.ts` — GET(我的帖子, 分页)
- `src/app/api/auth/profile/articles/route.ts` — GET(我的文章, 分页)
- `src/app/api/auth/profile/messages/route.ts` — GET(我的留言, 分页)

### 前端页面
**新文件**:
- `src/app/(main)/profile/page.tsx` + `page.module.css`

### 布局
- requireUser认证守卫
- 左侧: 身份卡(头像placeholder, 昵称, 邮箱状态badge, 注册时间)
- 改昵称: inline NeoInput + 保存按钮
- 改密码: 折叠表单(旧密码+新密码+确认)
- 右侧: Tabs切换(帖子/文章/留言) + 分页列表

### Header添加入口
- `src/components/organisms/Header.tsx` — 登录后显示用户名dropdown或/profile链接

---

## T1: 内容管理增强 [L]

### 后端API
**新文件**:
- `src/app/api/admin/articles/route.ts` — GET(全状态文章列表, 分页+搜索+status筛选)
- `src/app/api/admin/articles/[id]/route.ts` — PATCH(编辑title/content/tags/status) / DELETE(软删除status='hidden')
- `src/app/api/admin/guestbook/route.ts` — GET(留言列表, 分页)
- `src/app/api/admin/guestbook/[id]/route.ts` — DELETE(硬删除)
- `src/app/api/admin/bbs/topics/route.ts` — GET(帖子列表, 分页+搜索)
- `src/app/api/admin/bbs/topics/[id]/route.ts` — DELETE / PATCH(pin/lock)
- `src/app/api/admin/bbs/replies/route.ts` — GET(回复列表, 分页)
- `src/app/api/admin/bbs/replies/[id]/route.ts` — DELETE

### 前端页面
**新文件**:
- `src/app/admin/articles/page.tsx` + `page.module.css` — 文章管理表格+编辑弹窗+状态筛选
- `src/app/admin/guestbook/page.tsx` + `page.module.css` — 留言管理表格+删除
- `src/app/admin/bbs/page.tsx` + `page.module.css` — 帖子管理+置顶/锁定toggle+回复抽屉
- `src/app/admin/tools/page.tsx` + `page.module.css` — 工具配置(SiteSetting key=toolsConfig, JSON)

### Schema改动
- Article model: status字段添加 'hidden' 值（无需migration，字符串类型）

### Admin Layout更新
- `src/app/admin/layout.tsx` — 添加4个导航项: 文章管理、留言管理、论坛管理、工具管理

---

## T3: Halo式可调控 [M]

### 后端
- SiteSetting扩展key:
  - `navLinks` — JSON: `[{label, href, external?}]`
  - `footerContent` — HTML/Markdown字符串
  - `homeSections` — JSON: `{announcement: true, searchHistory: true, tools: true}`
- `/api/admin/settings` 已有GET/PATCH，无需新路由

### 前端
**新文件**:
- `src/app/admin/appearance/page.tsx` + `page.module.css`
  - 导航编辑器: 动态列表(label+href+添加/删除)
  - 页脚内容: textarea
  - 首页区块开关: NeoToggle组件

**修改文件**:
- `src/components/organisms/Header.tsx` — 从API读取navLinks配置
- `src/components/organisms/Footer.tsx` — 从API读取footerContent
- `src/app/(main)/page.tsx` — 读取homeSections配置决定渲染区块

### Admin Layout
- 添加"外观设置"导航项

---

## T2: New-API对接 [S]

### 改动
- `src/app/admin/layout.tsx` — 侧栏添加外链项: `{ href: "http://VPS_IP:3000", label: "API 管理 (New-API)", icon: "🔌", external: true }`
- Link标签添加 `target="_blank" rel="noopener noreferrer"`
- 图标带↗标识区分外链

---

## 总计新增文件: ~25个
## 总计修改文件: ~8个
