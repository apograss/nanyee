# check.nanyee.de deployment notes

## Required env vars

Add these on the server before building:

```env
CHECK_PUBLIC_HOST=check.nanyee.de
CHECK_CRON_SECRET=replace-with-random-secret
CHECK_CPA_BASE_URL=http://127.0.0.1:8317
CHECK_CPA_API_KEY=nanyee-ai-key-001
CHECK_NEW_API_BASE_URL=http://127.0.0.1:3001
CHECK_NEW_API_API_KEY=your-newapi-token
CHECK_NEW_API_ADMIN_URL=https://api.nanyee.de
CHECK_GROK_BASE_URL=http://127.0.0.1:8000
CHECK_GROK_ADMIN_BASE_URL=http://127.0.0.1:8000
CHECK_GROK_ADMIN_API_KEY=your-grok2api-app-key
CHECK_GROK_ADMIN_URL=https://check.nanyee.de/grok-admin
CHECK_CHATGPT_AUTH_DIR=/opt/cpamc/auths
CHECK_GROK_RESULT_DIR=/opt/grok2api/result_grok
```

`CHECK_GROK_ADMIN_API_KEY` 应使用 `grok2api` 的 `APP_KEY`，不是普通 `API_KEY`。  
`CHECK_GROK_BASE_URL` 用于服务健康检查，`CHECK_GROK_ADMIN_BASE_URL` 用于读取 token 状态。

## Nginx

Add a dedicated server block for `check.nanyee.de` and proxy it to the same Next.js upstream as `nanyee.de`.

Only the host should change. The app handles host-based rewriting in middleware.

## Cron

Run the collector every 5 minutes from the VPS:

```bash
*/5 * * * * curl -fsS -X POST \
  -H "Authorization: Bearer ${CHECK_CRON_SECRET}" \
  http://127.0.0.1:3000/api/internal/check/collect >/dev/null
```

If you prefer hitting Nginx instead of the app port, use:

```bash
*/5 * * * * curl -fsS -X POST \
  -H "Host: check.nanyee.de" \
  -H "Authorization: Bearer ${CHECK_CRON_SECRET}" \
  http://127.0.0.1/api/internal/check/collect >/dev/null
```
