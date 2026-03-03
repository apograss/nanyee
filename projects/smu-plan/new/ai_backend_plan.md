# nanyee.de AI 驱动方案：CLIProxyAPI + New API 架构

## 背景

nanyee.de 站点目前通过 `AI_BASE_URL` + `AI_API_KEY` 环境变量调用 LongCat API（`api.longcat.chat`），底层使用 OpenAI SDK。由于 LongCat 是免费 API 池，存在以下问题：

- **不稳定**：Key 容易过期、被封
- **不可控**：无法管理配额、无法自动轮换 Key
- **单点故障**：一个 Key 挂了就全站 AI 瘫痪

**目标**：搭建 CLIProxyAPI → New API 的两层架构，实现批量 Key 负载均衡 + 统一网关管理，为站点提供稳定可靠的 AI 能力。

---

## 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        OVH VPS (4C/8GB)                        │
│                                                                │
│  ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐ │
│  │  nanyee.de   │────▶│    New API       │────▶│ CLIProxyAPI  │ │
│  │  (Next.js)   │     │  (统一网关)      │     │ (Key 池代理)  │ │
│  │  Port 3000   │     │  Port 3001      │     │ Port 3002    │ │
│  └─────────────┘     └─────────────────┘     └──────────────┘ │
│        │                     │                       │         │
│   AI_BASE_URL          生成无限配额 Key          批量导入       │
│   指向 New API          供站点使用              LongCat Keys   │
│                                                                │
└──────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户提问 → Next.js /api/ai/chat → OpenAI SDK(baseURL=New API)
  → New API 路由到 CLIProxyAPI 渠道
    → CLIProxyAPI 从 Key 池中轮换选择可用 Key
      → 实际调用上游 LLM API (LongCat / 其他)
        → 流式返回 → New API → Next.js SSE → 用户
```

### 三层各自职责

| 层级 | 组件 | 职责 |
|:---|:---|:---|
| **L1 应用层** | nanyee.de (Next.js) | 接收用户请求，执行 Function Calling，流式渲染 |
| **L2 网关层** | New API | 统一鉴权，配额管理，生成站点专用 Key，渠道路由，失败重试 |
| **L3 代理层** | CLIProxyAPI | 管理批量上游 Key，Round-Robin 负载均衡，Key 健康检查 |

---

## 分步部署指南

### Step 1：部署 CLIProxyAPI

CLIProxyAPI 是最底层，负责把你的批量 Key 池暴露为一个 OpenAI 兼容端点。

#### 1.1 Docker 部署

```bash
# SSH 进入 OVH VPS
ssh root@your-ovh-vps

# 创建工作目录
mkdir -p /opt/cliproxy && cd /opt/cliproxy

# 下载最新 release (Linux amd64)
# 去 https://github.com/router-for-me/CLIProxyAPI/releases 找最新版本
wget https://github.com/router-for-me/CLIProxyAPI/releases/download/vX.X.X/CLIProxyAPI-linux-amd64
chmod +x CLIProxyAPI-linux-amd64
```

#### 1.2 配置与启动

```bash
# 启动 CLIProxyAPI，监听 3002 端口
./CLIProxyAPI-linux-amd64 --port 3002
```

#### 1.3 批量导入 Key

CLIProxyAPI 提供了 Management API 来管理账号/Key。假设你有一批 LongCat 的 Key：

```bash
# 通过 Management API 添加上游 provider
# CLIProxyAPI 支持 OpenAI 兼容的上游 provider 配置
# 参考: https://help.router-for.me/

# 方式一：通过配置文件（config.json 或 config.yaml）
# 在配置文件中添加 upstream providers，填入你的批量 key
# 每个 key 作为一个 account，CLIProxyAPI 自动 round-robin

# 方式二：通过 Management API 动态添加
# POST http://localhost:3002/management/accounts
```

> [!IMPORTANT]
> CLIProxyAPI 的具体配置格式取决于版本。建议先访问 https://help.router-for.me/ 查阅最新文档，确认如何配置 OpenAI-compatible upstream provider（即把 LongCat API 作为上游）。
> 
> 核心配置项：
> - `upstream.baseURL`: `https://api.longcat.chat/openai/v1`
> - `upstream.keys`: 你的批量 LongCat Key 数组
> - `loadBalancing`: `round-robin`

#### 1.4 验证

```bash
curl http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "LongCat-Flash-Chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

### Step 2：部署 New API

New API 作为中间网关，提供统一的 Key 管理和配额控制。

#### 2.1 Docker 部署

```bash
# 使用 SQLite（轻量，适合单机）
docker run --name new-api -d --restart always \
  -p 3001:3000 \
  -e TZ=Asia/Shanghai \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -v /opt/new-api/data:/data \
  calciumion/new-api:latest
```

#### 2.2 初始配置

1. 访问 `http://your-vps-ip:3001` 完成初始管理员注册
2. 进入管理后台

#### 2.3 添加 CLIProxyAPI 为渠道（Channel）

在 New API 后台：

1. **渠道管理 → 添加渠道**
   - 类型：选择 `自定义渠道` 或 `OpenAI`
   - 名称：`CLIProxyAPI-LongCat`
   - Base URL：`http://localhost:3002`（同机部署，走 localhost）
   - 密钥：CLIProxyAPI 如果设置了 access key 则填入，否则留空或填任意值
   - 模型：手动添加 `LongCat-Flash-Chat`, `LongCat-Flash-Thinking` 等

2. **模型映射**（可选）
   - 可以把 `gpt-4o` 映射到实际的 `LongCat-Flash-Chat`
   - 这样站点代码不需要关心底层用的是什么模型名

#### 2.4 生成站点专用 Key（无限配额）

在 New API 后台：

1. **令牌管理 → 添加令牌**
   - 名称：`nanyee-site`
   - 配额：设置为 `无限制`（或设一个足够大的数）
   - 模型范围：选择上面配置的所有模型
   - 复制生成的 `sk-xxxx` 格式 Key

> [!TIP]
> 这个 Key 就是最终填入 nanyee.de `.env` 的 `AI_API_KEY`。
> 由于 New API 的 Key 由你自己控制，不会过期，配额无限，站点就不用担心 Key 失效问题了。

---

### Step 3：修改 nanyee.de 配置

这是最简单的一步——项目已经通过环境变量抽象了 AI Provider：

#### 3.1 修改 `.env`

```diff
 # AI Provider
-AI_BASE_URL="https://api.longcat.chat/openai/v1"
-AI_DEFAULT_MODEL="LongCat-Flash-Chat"
-AI_API_KEY="ak_2iM6Uw9EN8qZ95A6Xp24v3Zy5Oh2d"
+AI_BASE_URL="http://localhost:3001/v1"
+AI_DEFAULT_MODEL="LongCat-Flash-Chat"
+AI_API_KEY="sk-xxxxx"  # New API 生成的无限配额 Key
```

#### 3.2 代码无需修改

项目的 `src/lib/ai/client.ts` 已经通过 `process.env.AI_BASE_URL` 完成了解耦：

```typescript
// 这段代码完全不需要改
const AI_BASE_URL = process.env.AI_BASE_URL || "...";
export function createAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: AI_BASE_URL });
}
```

> [!NOTE]
> `AVAILABLE_MODELS` 数组中的模型名需要与 New API 渠道中配置的模型名一致。如果你在 New API 做了模型映射（比如把 `gpt-4o` 映射到 `LongCat-Flash-Chat`），那么这里也要同步修改。

---

## Nginx 配置建议

三个服务都跑在同一台 VPS 上，Nginx 只需要反代 Next.js 即可，New API 和 CLIProxyAPI 不需要对外暴露：

```nginx
server {
    listen 443 ssl;
    server_name nanyee.de;
    
    # ...SSL 由 Cloudflare 管理...

    location / {
        proxy_pass http://127.0.0.1:3000;  # Next.js
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
    }
    
    # New API 和 CLIProxyAPI 不需要 location 块
    # 它们只通过 localhost 内部通信
}
```

---

## 运维与扩展

### Key 池管理
- **补充 Key**：通过 CLIProxyAPI 的 Management API 动态添加新 Key，无需重启
- **Key 失效处理**：CLIProxyAPI 的 Round-Robin 会自动跳过失败的 Key
- **New API 渠道重试**：在 New API 后台设置「失败重试次数」，如果 CLIProxyAPI 整体不可用可以 fallback 到其他渠道

### 多源扩展

后续如果有其他 API 来源（比如 Codex Key、自己的 Claude Key），可以：
1. 在 CLIProxyAPI 加入新的 upstream provider
2. 或者在 New API 直接添加新渠道（不经过 CLIProxyAPI）
3. New API 支持渠道优先级和加权随机，自动路由

```
New API 渠道示例：
├── 渠道 1: CLIProxyAPI-LongCat (权重 80)  ← 主力
├── 渠道 2: CLIProxyAPI-Codex   (权重 10)  ← 备用
└── 渠道 3: 直连某付费 API      (权重 10)  ← 兜底
```

### 监控
- New API 后台自带调用量统计、错误日志、渠道健康状态
- 可以通过 `SearchLog` 表统计站点 AI 使用频率

---

## 总结：你的初步想法完全可行

你的思路 **「批量 Key → CLIProxyAPI → New API → 生成无限 Key → 站点使用」** 是最佳实践方案，具体对应关系：

| 你的想法 | 实际操作 |
|:---|:---|
| 导入批量 Key 到 CLIProxyAPI | CLIProxyAPI 配置 upstream keys，round-robin 轮换 |
| 本地反代到 New API | New API 添加渠道指向 `localhost:3002`（CLIProxyAPI） |
| 生成无限配额 Key | New API 令牌管理 → 创建无限额度令牌 |
| 站点使用 | `.env` 中 `AI_BASE_URL` 指向 New API，`AI_API_KEY` 填无限令牌 |

**站点代码零修改**，只需改 `.env` 配置即可完成切换。
