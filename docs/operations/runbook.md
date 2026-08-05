# 生产运行手册（上线前草案）

本文件只描述候选环境操作，不授权执行旧站停机、生产部署、数据库删除、Cloudflare/Azure 资源创建或远端 `main` 覆盖。执行这些动作前需逐项确认精确目标。

## 候选环境准备

1. 安装 Docker Engine 与 Compose 插件，防火墙只允许 SSH、HTTP 和 HTTPS；Compose 网关只绑定 `127.0.0.1:8080`。
2. 复制 `.env.production.example` 为未纳入版本控制的 `.env.production`，逐项替换占位符。Session Secret、数据库密码与本地主密钥分别随机生成，禁止复用。
3. 由宿主机已有 TLS 反向代理（Cloudflare 之后）把 `nanyee.de` 与 `www.nanyee.de` 转发到 `127.0.0.1:8080`，并保留客户端 IP 头（`X-Forwarded-For` / `X-Real-IP`）。Compose 内 `NANYEE_TRUSTED_PROXY_IPS` 已预置为 gateway 的固定内网地址（`172.28.0.10`），一般无需改动；只有调整宿主代理链路时才需要核对。Compose 的 gateway 镜像已包含前端构建产物（`web/dist`）并直接服务静态文件，`/api` 由 gateway 反代到 `api:8000`，宿主 nginx 无需再服务前端或区分 `/api`。
4. 先运行配置渲染与镜像构建，再运行迁移任务；任何一步失败都不启动 API/Worker。

```bash
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml config
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml build
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml run --rm migrate
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml up -d api worker gateway
```

## 切换现状（执行前必读）

以下为当前生产事实，切换 `nanyee.de` 前必须逐项确认：

- `nanyee.de` 当前由 PM2 托管的 Next.js 旧站占用（监听 `:3000`），宿主 TLS nginx 现转发到该端口。**用户已确认旧站（含 `chat.nanyee.de` Flarum 论坛的 SSO，依赖旧站 OAuth）可以随切换全部下线**，无需保留兼容。
- Cloudflare Turnstile 密钥尚未创建：需在 Cloudflare 控制台为 hostname `nanyee.de` 创建站点，拿到 site key 与 secret key 后填入 `.env.production`，并把 `NANYEE_TURNSTILE_ENABLED` 改回 `true`（当前示例为 `false`，占位 key 虽能通过启动校验，但运行时所有人机校验都会被拒绝）。
- 后端镜像已内置 Chromium + 系统依赖（学习舱 Infospace 登录的真实浏览器需求），worker 服务在 compose 里以 `--no-sandbox --disable-dev-shm-usage` 启动参数运行；首次构建镜像会多下载约 200MB。

## 验收

- `GET /health/live` 与 `/health/ready` 返回 200。
- `GET /` 返回 SPA 的 `index.html`（`Cache-Control: no-cache`），`/assets/` 下带 hash 的产物返回长缓存头。
- 生产环境无 `/docs` 和 `/openapi.json`。
- API/Worker 使用同一数据库与凭据主密钥，数据库和 API 端口没有直接暴露公网。
- 完成注册、平台登录、浏览器 OCR 学校登录、成绩排名、课表导出、自动选课运行与取消、自动评课测试任务、群报数即时提交、学习舱舱位读取、任务取消与凭据撤销的人工烟雾测试。
- 人为让评课和学习舱验证码识别失败，确认任务退避后进入 `retry_wait`，凭据没有被误判为永久无效；恢复 OCR 后可继续执行。
- 模拟上游超时，确认写请求进入 `RESULT_UNKNOWN`/`verification_required`，不会自动重放。

## 回滚边界

代码回滚不等于数据库回退。迁移应用后默认只回滚 API/Worker 镜像；数据库 downgrade 必须先确认迁移是否可逆并完成加密备份。旧站和新站不得同时接受写流量。远端 `main` 覆盖前必须建立可恢复标签并记录候选镜像摘要。

## 加密备份与恢复演练

`infra/scripts/backup.sh` 要求 PostgreSQL 客户端、`age` 和已登录的 Azure CLI。它把 `pg_dump --format=custom` 直接送入 `age`，只把加密临时文件上传到 Blob；容器已有数据或本次上传将达到 4 GiB 时失败关闭。脚本不自动删除云端对象，7 日/4 周/3 月保留策略在首次生产演练确认具体 Blob 后另行配置。

`infra/scripts/restore.sh` 只应对隔离数据库运行。它要求 `NANYEE_CONFIRM_RESTORE` 与目标数据库名完全一致，下载的仍是加密文件，解密内容通过管道交给 `pg_restore`。该脚本包含 `--clean --if-exists`，会替换目标库内同名对象；每次执行前都要再次确认精确目标和备份 Blob。

## 学校侧出口代理（Cloudflare Workers）

后端对 `uis.smu.edu.cn` / `zhjw.smu.edu.cn` / `infospace.smu.edu.cn` 的出站请求经 `infra/cloudflare/egress-proxy/worker.js` 转发，利用 Cloudflare 边缘 IP 池分散来源 IP，降低学校按 IP 限流/封禁的风险。Worker 部署在独立的备用 Cloudflare 账号（`nanyee-egress` 子域），仅接受 `X-Proxy-Token` 鉴权 + 白名单主机的 https 目标。配置项：`NANYEE_SCHOOL_EGRESS_PROXY_URL` / `NANYEE_SCHOOL_EGRESS_PROXY_TOKEN`（必须成对）；国内开发机访问 workers.dev 被封时另设 `NANYEE_SCHOOL_EGRESS_PROXY_VIA` 指向本机代理，生产 VPS 直连留空。留空 URL/Token 即整体关闭、恢复直连。

重新部署：`PUT /client/v4/accounts/{account_id}/workers/scripts/nanyee-egress-proxy`（multipart：metadata 含 `PROXY_TOKEN` plain_text 绑定 + worker.js），随后 `POST .../workers/scripts/nanyee-egress-proxy/subdomain` 启用 workers.dev 路由。轮换 Token 时同步更新 Worker 绑定与 VPS 环境变量，先改 Worker 再改服务端会导致短暂 403。

## 故障处理

- KMS/主密钥不可用：停止 Worker，保留 API 只读能力，不切换到未经确认的其他密钥。
- 上游异常：停止对应 Worker 工具或将注册表标为维护；结果未知任务要求人工核验。
- 凭据疑似泄漏：撤销相关凭据、取消关联任务、轮换包裹密钥和服务认证，检查白名单日志中是否存在异常元数据。
- 数据库异常：停止写入，从最近一次已验证的加密备份恢复到隔离实例，校验后再决定切换。
