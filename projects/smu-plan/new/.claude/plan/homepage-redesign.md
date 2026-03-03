# Homepage Redesign Plan — 方案 B 混合

> 架构重塑 + 暖色基因 | 基于 Gemini 分析 + Claude 综合规划

## 目标

解决首页 7 大 UI/UX 问题：版面空转、视觉层级倒置、栅格割裂、颜色老旧、
对比度不足、交互反馈弱、AI 定位空洞。

## 影响范围

| 文件 | 操作 |
|------|------|
| `src/app/globals.css` | **改**：CSS 变量调优（边框/圆角/阴影/底色/字色） |
| `src/app/(main)/page.tsx` | **重写**：首页布局 + 新增 PromptChips + 工具轻量化 |
| `src/app/(main)/page.module.css` | **重写**：全新首页样式 |
| `src/components/organisms/Header.module.css` | **微调**：边框变细自动生效 |

不改动：Header.tsx 逻辑、后端 API、其他页面组件。

---

## Step 1：CSS Variables 调优 (`globals.css`)

### 1.1 背景底色
```
--color-paper: #FDF0D5  →  #FFFAED（极浅暖白，保留温度但更现代）
```

### 1.2 边框体系
```
--neo-border-width: 3px  →  2px（全局变细，所有组件自动受益）
```

### 1.3 圆角体系（新增分级）
```
--neo-radius: 4px  →  12px（默认）
新增 --neo-radius-sm: 8px
新增 --neo-radius-lg: 16px
新增 --neo-radius-pill: 9999px（胶囊形）
```

### 1.4 阴影体系
```
--neo-shadow-offset: 4px  →  3px
--neo-shadow-sm: 3px 3px 0px  →  2px 2px 0px
新增 --soft-shadow: 0 2px 8px rgba(29,53,87,0.06)（现代软阴影）
新增 --soft-shadow-lg: 0 4px 16px rgba(29,53,87,0.1)
```

### 1.5 文字对比度
```
--text-muted: #7B97AE  →  #5C7A92（加深，满足 WCAG AA on #FFFAED）
```

### 1.6 Dark Mode 同步
```
--neo-border-width: 保持 2px
--neo-shadow-offset: 2px
--bg-primary: #181818 → #111111（略深）
```

---

## Step 2：首页布局重写 (`page.tsx`)

### 新组件树
```
<div.idle>                          ← 全屏 flex column, justify-center
  <AnnouncementToast />             ← 浮动公告（absolute定位，可关闭）
  <div.hero>                        ← 核心区域，max-width 680px
    <div.greeting>                  ← 小型品牌文字 "向 Nanyee 提问"
    <form.searchBox>                ← 一体化搜索组件（大圆角容器）
      <input />                     ← 主输入框
      <div.searchActions>           ← 输入框内右侧
        <ModelSwitch />             ← 内嵌模型切换
        <SubmitButton />            ← 发送按钮
    <div.promptChips>               ← 示例问题芯片（横排）
      <button.chip> × 4
    <div.toolStrip>                 ← 轻量工具入口（横排小卡）
      <Link.toolMini> × 3
  </div.hero>
</div.idle>
```

### 关键变更
1. **移除** 巨大 Logo SVG + h1 "Nanyee.de" + p "南医的 AI Agent"
2. **替换为** 简洁的问候语 "向 Nanyee 提问" 或 "有什么可以帮你？"
3. **搜索框** 成为视觉 C 位，带大圆角容器包装
4. **模型切换** 内嵌在搜索框右侧（发送按钮左边），不再游离
5. **新增 PromptChips**：4 个示例问题（如"今天有什么课"、"GPA 怎么算"等）
6. **工具卡片** 从 3 列重卡 → 横排轻量入口
7. **搜索历史** 改为搜索框聚焦时的下拉面板（而非占空间的块级列表）
8. **公告** 改为浮动 toast，5 秒后自动折叠，可手动关闭

---

## Step 3：首页样式重写 (`page.module.css`)

### 3.1 Idle 主容器
- `display: flex; flex-direction: column; align-items: center; justify-content: center`
- `min-height: calc(100vh - var(--header-height))`
- 搜索区域居于视觉中心偏上（padding-bottom 大于 padding-top）

### 3.2 SearchBox 一体化
- 外层容器：`border: var(--neo-border); border-radius: var(--neo-radius-lg); background: var(--bg-secondary)`
- Focus 状态：`border-color: var(--color-brand); box-shadow: 0 0 0 3px var(--color-brand-light)`
- 输入框无独立边框，完全融入容器
- 发送按钮圆形/胶囊形，在容器内部右侧

### 3.3 PromptChips
- `display: flex; flex-wrap: wrap; gap: 8px; justify-content: center`
- 每个芯片：`border-radius: var(--neo-radius-pill); border: 1.5px solid var(--border-light); padding: 6px 14px`
- Hover：`background: var(--color-brand-lighter); border-color: var(--color-brand); color: var(--color-brand)`

### 3.4 ToolStrip
- `display: flex; gap: 12px; justify-content: center`
- 每个入口：紧凑的 pill 按钮，icon + label，无重型边框阴影
- Hover：轻微上浮 + 软阴影

### 3.5 AnnouncementToast
- `position: fixed; top: calc(var(--header-height) + 12px); left: 50%; transform: translateX(-50%)`
- 胶囊形，毛玻璃背景，带关闭按钮
- 入场动画：从上方滑入
- 5 秒后自动淡出

### 3.6 HistoryDropdown
- `position: absolute; top: 100%; width: 100%`
- 仅在搜索框聚焦且有历史时显示
- 背景白色，软阴影，圆角

### 3.7 响应式
- **≤768px**：搜索框占满宽度，PromptChips 横向滚动，ToolStrip 堆叠
- **≤375px**：字号微缩，间距压缩

---

## Step 4：交互细节

| 交互 | 实现 |
|------|------|
| 搜索框聚焦 | 容器边框变品牌色 + 外发光 + 展开历史下拉 |
| 模型切换 | 内嵌切换，active 状态高亮 |
| 示例芯片点击 | 填入输入框并自动提交 |
| 工具入口 hover | 软阴影 + 微上浮 |
| 发送按钮 hover | 背景加深 + scale(1.05) |
| 发送按钮 active | scale(0.95) 按压 |
| 公告关闭 | 淡出 + localStorage 记住状态 |

---

## 执行顺序

1. globals.css — 变量调优（影响全局，最先做）
2. page.module.css — 完整重写
3. page.tsx — 结构重写
4. 验证 — 检查 dark mode、responsive、交互反馈
