# 上游出口与后续 Cloudflare 代理池

当前版本由 API/Worker 直接访问 UIS、教务、Infospace 和 Qun100。业务代码只依赖各集成客户端，未把本机 IP、代理 URL 或 Cloudflare Worker 地址写入任务载荷，因此以后可以在 HTTP 传输层增加出口池，不需要修改前端契约、数据库任务或凭据格式。

接入代理池前必须满足以下边界：

- 代理只允许预定义上游的 HTTPS 主机和固定方法/路径，不能成为开放代理。
- API 到代理必须有独立服务认证、短超时、请求大小限制和密钥轮换；学生浏览器不得直接获得代理地址或认证值。
- Cloudflare、代理日志和错误追踪不得记录 `Authorization`、Cookie、学校密码、验证码、表单正文或响应正文。
- 不把 TLS 校验关闭，不接受任意重定向，不因代理失败自动切换到未审核的公共代理。
- 写请求在网络超时后仍按 `RESULT_UNKNOWN` 处理，切换出口不能触发自动重放。
- 出口选择只用于可用性和上游 IP 限制，不提高单学生配额，也不绕过平台硬限流。

推荐以后实现一个 `UpstreamTransportFactory`：按上游返回配置好的 `httpx.AsyncBaseTransport`，并由现有 SMU、Infospace、Qun100 客户端注入。池内节点健康、熔断与轮换在这一层完成；凭据解密仍只发生在调用客户端的 API/Worker 进程内。代理资源创建、Cloudflare Worker 发布和真实密钥配置属于生产外部变更，不在当前本地实现中执行。
