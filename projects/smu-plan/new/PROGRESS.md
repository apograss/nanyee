# nanyee.de — 项目进度

> 最后更新：2026-02-28

---

## 当前状态：tools 子系统已完成 ✅

独立工具站点已上线运行（`tools/` 目录），提供课表导出、成绩查询、自动选课三大功能。

---

## 已完成

### 📅 课表导出
- [x] 登录教务系统 + SSO 跳转
- [x] 拉取课表数据
- [x] 导出 WakeUp 格式 + ICS 日历格式
- [x] 分享码机制
- [x] **自动验证码识别 + 一键导出（3 次重试）**

### 📊 成绩查询
- [x] 拉取全部课程成绩
- [x] GPA 计算（加权 + 必修）
- [x] 每门课排名查询
- [x] 学期筛选
- [x] **自动验证码识别 + 一键查询（3 次重试）**

### ⚡ 自动选课
- [x] 登录教务系统
- [x] 拉取选课类型 + 课程列表
- [x] 多志愿优先级选课
- [x] 定时抢课
- [x] 实时日志
- [x] **自动验证码识别 + 一键登录（3 次重试）**

### 🤖 验证码 OCR 模型
- [x] 采集 200 张学校验证码
- [x] 人工标注 4 位数字
- [x] 训练 CNN 模型（按列分割法：67% 准确率）
- [x] ONNX 导出（770KB，浏览器推理 15ms）
- [x] ONNX Runtime Web 替换 Tesseract.js

### 🛡️ IP 风控
- [x] 服务端代理 `/api/tools/proxy`
- [x] VPS 抢课代理（119.29.161.78:8080，systemd 托管）
- [x] `NEXT_PUBLIC_ENROLL_PROXY` 环境变量配置
- [x] 随机延迟抖动 150-350ms
- [x] 自动 fallback 到本地代理

### 🔧 基础设施
- [x] Next.js 项目搭建
- [x] 暗色主题 UI 设计
- [x] Cloudflare DNS + 域名 nanyee.de
- [x] CF Worker 代理（proxy.nanyee.de）

---

## 待开发

### P0：主站 MVP（implementation_plan.md）

| 功能 | 状态 | 说明 |
|------|------|------|
| AI 搜索首页 | 🔲 | ChatGPT 空态风格，极简全屏 |
| AI 对话 | 🔲 | Perplexity 风格，SSE 流式，function calling |
| 知识库 | 🔲 | Markdown 文章 + FTS5 搜索 |
| 用户系统 | 🔲 | 教育邮箱验证 / 校内答题注册 |
| 留言板 | 🔲 | 扁平列表，无嵌套 |
| 校内导航 | 🔲 | links.json 驱动 |

### P1：体验优化

| 功能 | 状态 |
|------|------|
| 深色/浅色切换 | 🔲 |
| 搜索历史 | 🔲 |
| 热门问题统计 | 🔲 |

### 工具增强

| 功能 | 状态 |
|------|------|
| 验证码 OCR 准确率提升（采集更多数据重训练） | 🔲 |
| 选课结果通知（微信/邮件） | 🔲 |
| 多人并发抢课队列 | 🔲 |

---

## 技术栈

| 层级 | 选型 |
|:---|:---|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| 样式 | Vanilla CSS |
| 验证码 OCR | ONNX Runtime Web (自训练 CNN) |
| VPS 代理 | Python 3 (http.server + urllib) |
| 部署 | 开发中用本地 / 生产用 OVH VPS |
| CDN | Cloudflare |

---

## 目录结构

```
new/
├── implementation_plan.md    # 主站完整规划
├── PROGRESS.md               # ← 本文件
└── tools/                    # 独立工具站（Next.js）
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx              # 课表导出
    │   │   └── tools/
    │   │       ├── enroll/page.tsx    # 自动选课
    │   │       └── grades/page.tsx   # 成绩查询
    │   └── lib/
    │       ├── captcha-ocr.ts        # ONNX 验证码识别
    │       ├── enroll-client.ts      # 选课逻辑 + VPS代理
    │       └── smu-auth.ts           # 登录认证
    ├── captcha-model/                # OCR 模型训练
    │   ├── train_split.py            # 训练脚本（按列分割）
    │   ├── captchas/                 # 标注数据
    │   └── model/captcha_model.onnx  # 导出模型
    ├── vps-proxy/                    # VPS 抢课代理
    │   ├── deploy.py                 # 一键部署脚本
    │   └── README.md
    └── public/
        └── captcha_model.onnx        # 浏览器加载
```
