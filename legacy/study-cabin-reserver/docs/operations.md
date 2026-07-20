# 运维说明

## 数据与密钥

- 数据位于 Docker 命名卷 `reserver-data`。
- `CREDENTIAL_KEY` 丢失后无法解密已保存的 SMU 凭据。
- 备份必须同时包含数据库和对应的 `CREDENTIAL_KEY`，并分别安全保存。
- 日志和截图不得包含 Cookie、token、SMU 密码或验证码图片。

## 常用命令

```bash
docker compose ps
docker compose logs --tail=200 web
docker compose logs --tail=200 worker
docker compose restart worker
```

## 更新

```bash
git pull --ff-only
docker compose up -d --build
```

更新前备份数据卷。不要使用 `docker compose down -v`，它会删除数据库卷。

## 故障处理

- 面板无法登录：检查 `ADMIN_PASSWORD` 是否只用于首次初始化；数据库已有密码时修改环境变量不会覆盖它。
- SMU 自动登录失败：确认账号密码有效，查看面板任务错误；连续验证码失败会等下一轮再尝试。
- 一直无可用舱位：确认任务时间完整连续、目标日期已开放、停止时间尚未到达。
- Cookie 失效：Worker 会自动清空加密 Session 并重新走 SSO。
- 数据库锁：确认只有一个 Web 和一个 Worker 实例，共享相同数据卷。

## 生产变更检查

部署、DNS、Nginx、TLS、环境变量或首次真实预约都属于生产变更，应在执行前取得用户明确确认。
