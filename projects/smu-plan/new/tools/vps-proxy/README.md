# VPS 抢课代理

抢课请求通过腾讯云 VPS (119.29.161.78:8080) 转发到 `zhjw.smu.edu.cn`，保护主服务器 IP。

## 架构

```
登录/查成绩/导课表 → 本地 Next.js 服务器 → uis/zhjw（主 IP）
抢课请求           → VPS 119.29.161.78:8080 → zhjw（VPS IP，封了无所谓）
```

## 部署

```bash
# 本地运行，自动通过 SSH 上传并启动
python deploy.py
```

脚本做的事：
1. SSH 连接 VPS
2. 上传 `enroll_proxy.py` 到 `/home/ubuntu/`
3. 创建 systemd 服务 `enroll-proxy`（开机自启 + 崩溃重启）
4. 启动服务

## 配置

`.env.local` 中设置：

```
NEXT_PUBLIC_ENROLL_PROXY=http://119.29.161.78:8080
```

## API 格式

路径路由，兼容 `enrollProxyFetch`：

| 请求 | 转发到 |
|------|--------|
| `/zhjw/...` | `https://zhjw.smu.edu.cn/...` |
| `/uis/...`  | `https://uis.smu.edu.cn/...` |

Headers:
- `X-Cookie` → 转发为 `Cookie`
- 响应 `Set-Cookie` → 返回为 `X-Set-Cookie`（JSON 数组）
- 响应 `Location` → 返回为 `X-Location`

## 管理

```bash
# 查看状态
sudo systemctl status enroll-proxy

# 重启
sudo systemctl restart enroll-proxy

# 查看日志
sudo journalctl -u enroll-proxy -f
```
