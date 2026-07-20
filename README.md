# Nanyee 后端

Nanyee 是面向学生的小型工具平台后端。当前仓库把旧工具统一到一个 FastAPI 模块化单体与独立 Worker 中；前端由其他实现者依据固定 OpenAPI 和接入文档开发，本仓库不提供页面、组件或视觉方案。

## 已实现的后端基础

- 教育邮箱验证码与校内答题两种注册 Challenge。
- 8–128 字符平台密码、Argon2id、常见密码拦截。
- 服务端 Session、HttpOnly Cookie、双提交 CSRF、登录/注销。
- PostgreSQL 持久限流、Cloudflare Turnstile 软门槛与不可绕过的硬门槛。
- 瞬时学校登录：UIS/教务 Cookie 仅在服务端内存保存 5 分钟。
- 课表查询、聚合、ICS/WakeUp 文件导出与可选 WakeUp 分享；成绩汇总、逐科排名和分数段分布。
- 自动选课：多级志愿、教务服务器校时、定时启动、15–120 次自动尝试、冲突确认、运行日志与取消。
- VPS 自动评课：加密托管教务凭据，Worker 自动 OCR 登录、读取全部待评课程并按旧版高分策略批量提交；OCR 和网络错误持久化退避重试。
- 学习舱预约：18 个舱位优先级、开放/冻结时段判断、加密学校凭据、OCR 退避登录与持续重试。
- 群报数即时 Token 校验、链接解析、表单同步、受限图片上传、字段预览、临时 Token 立即提交与托管预约提交。
- 托管凭据信封加密：每条凭据独立 AES-256-GCM 数据密钥，可用 Azure Key Vault RSA-OAEP-256 或本地主密钥包裹。
- 持久任务：幂等键、计划时间、租约、心跳、取消、持续重试和人工核验状态。
- 固定 OpenAPI、结构化错误码和字段白名单日志。

旧代码只作为参考保留在 `legacy/`，不进入生产镜像。

## 本地启动

要求 Python 3.12、[uv](https://docs.astral.sh/uv/) 和 PostgreSQL 17。Docker 可用时可以启动仓库自带的开发数据库：

```powershell
docker compose -f infra/compose/compose.dev.yaml up -d
Copy-Item .env.example .env
uv sync --frozen --all-packages --dev
uv run alembic -c services/platform/alembic.ini upgrade head
uv run uvicorn nanyee.main:app --host 127.0.0.1 --port 8000
uv run nanyee-worker
```

API 与 Worker 必须使用同一数据库和同一凭据包裹密钥。只启动 API 不会执行计划任务；生产环境应把两者配置为独立进程并分别设置健康监控。

本机没有 Docker 时，纯逻辑和 SQLite 契约测试仍可运行：

```powershell
uv run python scripts/tasks.py check
```

常用命令：

```powershell
uv run python scripts/tasks.py format
uv run python scripts/tasks.py test
uv run python scripts/tasks.py openapi
uv run python scripts/tasks.py migrate
uv run nanyee-worker
```

## 配置与秘密

复制 `.env.example` 后仅在本机填值。任何真实 `.env`、主密钥、Azure 凭据、SMTP 密码、学校密码、Cookie 或群报数 Token 都不得提交。

生产启动会拒绝以下配置：

- 默认 Session Secret、非 `__Host-` Session Cookie、非 Secure Cookie；
- 通配 CORS/Host、公开交互式 API 文档、SQLite；
- Cloudflare 官方测试密钥；
- 未配置的凭据包裹密钥或未包含版本的 Azure Key ID；
- 非官方 HTTPS SMU 上游地址。

本地凭据主密钥必须是恰好 32 个随机字节的 Base64。示例生成方式：

```powershell
@'
import base64, secrets
print(base64.b64encode(secrets.token_bytes(32)).decode())
'@ | python -
```

Azure 模式设置 `NANYEE_CREDENTIAL_KEY_PROVIDER=azure` 和包含版本的 `NANYEE_AZURE_KEY_VAULT_KEY_ID`。程序不会在 Azure 故障时自动降级到本地主密钥。

## API 与前端交接

- 开发环境文档：`http://127.0.0.1:8000/docs`
- 固定契约：[openapi/openapi.json](openapi/openapi.json)
- 前端流程：[docs/frontend-integration.md](docs/frontend-integration.md)
- 请求示例：[docs/examples/api-flows.md](docs/examples/api-flows.md)
- 后续代理出口边界：[docs/integrations/upstream-egress.md](docs/integrations/upstream-egress.md)

前端不得把学校密码、UIS/教务会话 ID、托管凭据明文、群报数 Token 或 `anti_abuse_pass` 写入 `localStorage`、客户端日志或错误上报。

## 质量检查

```powershell
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest -q
uv run python scripts/export_openapi.py --check
```

## 生产候选交付物

- 容器镜像：[infra/docker/Dockerfile](infra/docker/Dockerfile)
- API/Worker/PostgreSQL/内部网关：[infra/compose/compose.prod.yaml](infra/compose/compose.prod.yaml)
- 内部 Nginx 安全配置：[infra/nginx/nanyee.conf](infra/nginx/nanyee.conf)
- 加密备份与受控恢复：[infra/scripts](infra/scripts)
- 上线前运行手册：[docs/operations/runbook.md](docs/operations/runbook.md)

生产网关只绑定宿主机 `127.0.0.1:8080`，TLS 和公网 80/443 由宿主机反向代理负责。`.env.production.example` 只含占位符，不得把复制后填入真实值的 `.env.production` 提交到仓库。

生产部署、Azure/Cloudflare 资源创建、旧站停机和远端 `main` 覆盖均是独立的外部变更；本地实现不会自动执行这些操作。
