# 顺德单人学习舱自动预约

一个面向单账号的轻量网页工具：提前创建未来日期的预约任务，名额开放后按学习舱优先级自动提交。预约必须完整覆盖指定连续时段，不会缩短或拆分。

## 功能

- 网页面板创建、查看和取消任务
- 18 个顺德单人学习舱按顺序优先尝试
- SMU 账号密码、Cookie 和 token 使用 AES-GCM 加密保存
- Session 失效后通过 UIS SSO 自动登录
- 登录验证码使用有限次数的本地 OCR
- SQLite 持久化，Web 与 Worker 分进程
- Docker Compose 部署，只绑定 `127.0.0.1:8765`

## 本地运行

需要 Python 3.12 与 [uv](https://docs.astral.sh/uv/)。

```bash
uv sync --group dev
```

复制 `.env.example` 为 `.env`，生成两个独立随机值：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

第一个用于 `APP_SECRET_KEY`，第二个用于 `CREDENTIAL_KEY`。设置不少于 10 位的 `ADMIN_PASSWORD` 后运行：

```bash
uv run uvicorn smu_reserver.web:app --host 127.0.0.1 --port 8765
uv run python -m smu_reserver.worker_service
```

访问 `http://127.0.0.1:8765`。

## Docker

```bash
docker compose up -d --build
docker compose ps
```

生产环境应通过 Nginx 和 HTTPS 访问，参考 `deploy/nginx.example.conf`。不要把 `.env`、数据库或真实接口响应提交到 Git。

## 任务语义

- 时间必须位于 `08:00–22:50`。
- 起止时间必须符合 10 分钟粒度。
- 单次时长为 30–240 分钟。
- 只有同一个学习舱完整覆盖目标时段时才会提交。
- 若高优先级舱位冲突，尝试下一优先级舱位。
- 到达任务停止时间仍未成功，任务标记为超时失败。

## 安全边界

程序只执行面板中明确创建的预约任务。不会修改学校规则、创建多个重叠预约或绕过账号权限。自动登录连续失败后停止本轮认证，不会无限请求。

## 验证

```bash
uv run ruff check src tests
uv run pytest -q
docker compose config
```

第一次真实提交和 VPS 部署前，应先使用只读查询验证 Session、舱位 ID 与当前预约规则。
