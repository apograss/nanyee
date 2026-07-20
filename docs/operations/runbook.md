# 生产运行手册（上线前草案）

本文件只描述候选环境操作，不授权执行旧站停机、生产部署、数据库删除、Cloudflare/Azure 资源创建或远端 `main` 覆盖。执行这些动作前需逐项确认精确目标。

## 候选环境准备

1. 安装 Docker Engine 与 Compose 插件，防火墙只允许 SSH、HTTP 和 HTTPS；Compose 网关只绑定 `127.0.0.1:8080`。
2. 复制 `.env.production.example` 为未纳入版本控制的 `.env.production`，逐项替换占位符。Session Secret、数据库密码与本地主密钥分别随机生成，禁止复用。
3. 由宿主机已有 TLS 反向代理把正式 API 域名转发到 `127.0.0.1:8080`，并保留客户端 IP；把实际代理地址加入 `NANYEE_TRUSTED_PROXY_IPS`。
4. 先运行配置渲染与镜像构建，再运行迁移任务；任何一步失败都不启动 API/Worker。

```bash
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml config
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml build
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml run --rm migrate
docker compose --env-file .env.production -f infra/compose/compose.prod.yaml up -d api worker gateway
```

## 验收

- `GET /health/live` 与 `/health/ready` 返回 200。
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

## 故障处理

- KMS/主密钥不可用：停止 Worker，保留 API 只读能力，不切换到未经确认的其他密钥。
- 上游异常：停止对应 Worker 工具或将注册表标为维护；结果未知任务要求人工核验。
- 凭据疑似泄漏：撤销相关凭据、取消关联任务、轮换包裹密钥和服务认证，检查白名单日志中是否存在异常元数据。
- 数据库异常：停止写入，从最近一次已验证的加密备份恢复到隔离实例，校验后再决定切换。
