# Nanyee 前端接入契约

本文只说明业务协议、客户端状态和错误恢复，不规定框架、组件、布局、文案风格或视觉表现。字段和枚举以 `openapi/openapi.json` 为最终依据。

## 1. 通用约定

- API 前缀：`/api/v1`。
- JSON 时间均为带时区的 ISO 8601；界面展示时转换为 `Asia/Shanghai`。
- 浏览器请求必须开启 Cookie 凭据，例如 Fetch 的 `credentials: "include"`。
- 每个响应都有 `X-Request-ID`。报错时可向用户展示该 ID，但不要上报请求体、Cookie 或敏感 Header。
- 写操作的 `Content-Type` 使用 `application/json`。
- 平台 Session 由 HttpOnly Cookie 保存；前端不可读取 Session Token。
- `nanyee_csrf` Cookie 可由前端读取。所有依赖平台登录的 POST/PUT/PATCH/DELETE 请求必须把相同值放入 `X-CSRF-Token`。

统一错误结构：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求数据无效。",
    "request_id": "5a6f...",
    "retryable": false,
    "details": {}
  }
}
```

不得根据英文字符串或 HTTP 文案分支，只使用 `error.code`、HTTP 状态和结构化 `details`。

## 2. 注册与平台登录

### 答题注册

1. `POST /registration/challenges`，Body 为 `{"method":"quiz"}`。
2. 保存返回的 `challenge_id`，展示服务器给出的 20 道题。题目 `id` 是本次 Challenge 内的位置，不是全局题库 ID。
3. `POST /registration/challenges/{challenge_id}/verify`，Body 为 `{"answers":[0,1,...]}`。
4. 验证成功后 `POST /registration`，提交 Challenge ID、用户名、8–128 字符密码和可选昵称。
5. 注册成功会同时设置 Session 与 CSRF Cookie。

Challenge 有效期 15 分钟，最多验证 5 次，18/20 通过。过期或次数耗尽后重新从第 1 步开始。

### 教育邮箱注册

1. `POST /registration/challenges`，Body 为 `{"method":"email","email":"name@example.edu.cn"}`。
2. 返回值只包含脱敏邮箱、`challenge_id`、到期时间和允许重发时间。
3. `POST /registration/challenges/{challenge_id}/verify`，Body 为 `{"code":"123456"}`。
4. 调用 `/registration` 完成账号创建。

无论邮箱是否已经存在，验证码发送阶段都不应在界面上推断账号存在状态。

### 登录与退出

- 登录：`POST /auth/login`。
- 当前用户：`GET /auth/me`。
- 退出：`POST /auth/logout`，必须带 CSRF Header。

页面初始化时调用 `/auth/me`。收到 `401 AUTHENTICATION_REQUIRED` 后清理内存中的用户态和敏感流程态，但不要尝试读取或手工删除 HttpOnly Session Cookie。

## 3. Cloudflare Turnstile 与 429

正常流量不加载或展示人机验证。达到软阈值时，API 返回：

```json
{
  "error": {
    "code": "RATE_LIMIT_CHALLENGE_REQUIRED",
    "retryable": true,
    "details": {
      "provider": "cloudflare_turnstile",
      "sitekey": "public-site-key",
      "action": "login"
    }
  }
}
```

前端使用返回的 `sitekey` 和完全一致的 `action` 获取 Token，把 Token 放入原请求的 `turnstile_token` 后重试。Token 最长 5 分钟、只能验证一次，失败后必须重置 Widget 获取新 Token。

若 Turnstile 已通过但后续业务校验失败，错误 `details` 可能包含：

```json
{
  "anti_abuse_pass": "short-lived-signed-value",
  "anti_abuse_pass_expires_in": 300
}
```

只在内存中保存它，并在同一 action 的下一次请求用 `anti_abuse_pass` 提交。它与客户端/IP 前缀绑定、额度有限，不能跨 action 使用。普通 `429 RATE_LIMITED` 是硬门槛，必须遵守响应 `Retry-After`，Turnstile 和通行证都不能绕过。

学校查询、选课、评课、群报数、图片上传、托管凭据创建与任务创建请求的 OpenAPI 模型均包含可选 `turnstile_token`/`anti_abuse_pass`（multipart 上传为同名表单字段）。只在服务器要求对应 action 时提交；不要预先获取、跨 action 复用或持久化这些值。

Turnstile Secret 永远不进入前端配置。所需脚本与 CSP 域名以 Cloudflare 官方 Turnstile 文档为准。

## 4. 瞬时学校登录与只读工具

学校身份和平台账号是两个独立概念。查询课表或成绩时可以不登录平台账号。

1. `GET /smu/captcha`，得到 `flow_id`、`content_type` 和不带 Data URL 前缀的 `image_base64`。
2. 图片源可由 `data:${content_type};base64,${image_base64}` 构造。
3. `POST /smu/session` 提交 `flow_id`、学号、学校密码和验证码。
4. 成功后只得到 `academic_session_id` 和过期时间；服务器不会返回 UIS/教务 Cookie。
5. 在 5 分钟内调用：
   - `POST /smu/timetable`；
   - `POST /smu/timetable.ics`；
   - `POST /smu/timetable.wakeup`；
   - `POST /smu/grades`。

学校密码只用于第 3 步，不保存、不复用、不进入前端日志。`flow_id` 为一次性；登录失败后重新取验证码。`academic_session_id` 只放内存，页面刷新后允许用户重新登录学校系统。

`/smu/timetable.ics` 返回 `text/calendar` 文件。`/smu/timetable.wakeup` 还需提交 `semester_monday` 和 `campus: "main" | "shunde"`，返回 `.wakeup_schedule` 文件；两者都按普通 Blob 下载处理。WakeUp 文件不会由后端上传给第三方。成绩结果默认不在服务器保存。

## 5. 托管凭据

托管凭据用于浏览器关闭后仍需执行的预约任务。拒绝托管不影响瞬时在线工具。

- 创建：`POST /credentials`，必须登录、带 CSRF，并提交 `consent_version: "credential-hosting-v1"`。
- 列表：`GET /credentials`，只返回用途、上游、状态、期限和允许公开的提示字段。
- 撤销：`DELETE /credentials/{id}`，必须带 CSRF。

创建响应和列表永远不会返回明文、密文、nonce、包裹密钥或 Azure Key ID。前端提交成功后立即清空密码/Token 输入值及其组件状态。

学习舱凭据的创建参数固定为：

```json
{
  "upstream": "infospace",
  "purpose": "study_cabin",
  "secret": "{\"account\":\"学号\",\"password\":\"学校密码\"}",
  "consent_version": "credential-hosting-v1",
  "metadata": {"account_hint": "仅显示给用户的脱敏提示"}
}
```

群报数凭据使用 `upstream: "qun100"`、`purpose: "qun_checkin"`，`secret` 为完整 Authorization Token。少于 60 字符、包含空白或省略号的 Token 会被拒绝。`upstream` 与 `purpose` 不允许混搭。

## 6. 持久任务

创建任务使用 `POST /jobs`，必须登录并带：

- `X-CSRF-Token`；
- 8–128 字符的 `Idempotency-Key`；
- 对写工具正确的 `confirmation_version`，格式由错误响应的 `required_confirmation_version` 给出。

相同用户、相同幂等键、相同请求会返回原任务并设置 `Idempotency-Replayed: true`；相同键用于不同请求返回 `409 CONFLICT`。

任务状态：

- `queued`：等待计划时间；
- `running`：Worker 已领取；
- `retry_wait`：有限重试等待中；
- `succeeded`：已完成并有脱敏收据；
- `failed`：确定失败；
- `cancelled`：已取消；
- `verification_required`：上游结果未知，禁止自动重试，需要按 `next_action` 核验。

读取使用 `GET /jobs` 或 `GET /jobs/{id}`，取消使用 `POST /jobs/{id}/cancel`。任务 `payload` 禁止出现 password、secret、token、cookie、session 或 authorization 等敏感字段；只能通过 `credential_id` 引用托管凭据。

### 学习舱预约任务

`tool_id` 为 `study_cabin`、`operation` 为 `reserve`，确认版本为 `study_cabin:reserve:v1`。载荷字段：

- `target_date`：预约日期；
- `start_time`、`end_time`：10 分钟粒度，30–240 分钟，范围 08:00–22:50；
- `cabin_ids`：按用户优先级排列的官方舱位 ID，不能重复；
- `attempt_until`：带时区的停止尝试时间，不能晚于预约开始；
- `title`：1–30 字符。

`scheduled_for` 决定 Worker 首次尝试时间。无可用舱位会在截止前有限重试；上游提交超时会直接进入 `verification_required`。成功收据只含舱位、日期和时间，不含学校账号或凭据。

### 群报数

即时路径均要求平台登录和 CSRF，但 Token 不落库：

- `POST /qun/token/verify`；
- `POST /qun/forms`；
- `POST /qun/forms/{form_id}/preview`。
- `POST /qun/images`，使用 `multipart/form-data`，字段为 `auth_token` 与 `file`。

图片仅接受内容与声明 MIME 一致的 JPEG、PNG、GIF 或 WebP，单张最多 5 MiB。响应 URL 已经过后端上传目标和 CDN 域名校验；前端把它填入对应图片字段。预览请求携带 `auth_token`、`defaults` 和按 `cid` 索引的 `custom_fields`，返回规范化 `catalogs`。前端让用户核对后，可用返回的 `form_id`、`version`、`title`、`catalogs` 构造 `qun_checkin:submit:v1` 任务；任务只引用已托管的 Token 凭据。预约提交结果未知时禁止前端自动创建新任务，应引导用户先到群报数核验。

## 7. 在线确认型选课与评课

这两类接口都要求平台登录、CSRF 和仍有效的 `academic_session_id`，但不允许创建托管学校凭据。学校会话失效后从验证码流程重新登录。

### 选课

1. `POST /smu/enrollment/categories` 获取当前选课类型。
2. `POST /smu/enrollment/courses` 提交 `category_code` 获取实时可选列表。
3. 用户选择一门课程并确认摘要后，`POST /smu/enrollment/submit` 提交 `category_code`、列表中的 `task_code` 和 `confirmation_version: "course_selection:enroll:v1"`。

提交前后端会再次读取当前课程列表；目标已消失时返回 `404 NOT_FOUND`。接口每次只提交一门课，不提供循环抢课、后台托管或批量账号。收到 `RESULT_UNKNOWN` 后不得自动重试，必须先去教务系统核验。

### 评课

1. `POST /smu/evaluations/pending` 获取待评课程，保存所选课程的三个 reference 字段。
2. `POST /smu/evaluations/drafts` 提交该 `reference`，获得 `draft_id`、到期时间、题目和后端解析出的合法选项。
3. 前端必须让学生逐题选择，以 `indicator_code -> option.code` 构造 `selections`。
4. `POST /smu/evaluations/submit` 提交 `draft_id`、`selections` 和 `confirmation_version: "evaluation:submit:v1"`。

草稿最长有效 5 分钟、绑定当前平台用户与学校会话，并在第一次提交尝试时消费。后端不会随机生成分数，也不接受缺题、未知选项或篡改的隐藏参数。网络中断或响应无法确认时返回 `RESULT_UNKNOWN`，前端不得重新生成草稿继续提交，应先去教务系统核验。

## 8. 错误处理速查

| `error.code` | 常见状态 | 自动重试 | 客户端动作 |
|---|---:|---|---|
| `INVALID_REQUEST` | 400/410/422 | 否 | 修正字段；410 的瞬时流程重新开始 |
| `AUTHENTICATION_REQUIRED` | 401 | 否 | 清除内存用户态并重新登录平台 |
| `INVALID_CREDENTIALS` | 401 | 否 | 重新输入平台凭据 |
| `CSRF_VALIDATION_FAILED` | 403 | 否 | 刷新会话状态和 CSRF Cookie，不复用旧值 |
| `FORBIDDEN` | 403 | 否 | 停止操作，不尝试绕过权限或凭据用途 |
| `NOT_FOUND` | 404 | 否 | 刷新对象列表 |
| `CONFLICT` | 409 | 否 | 检查幂等键或对象当前状态 |
| `RATE_LIMIT_CHALLENGE_REQUIRED` | 429 | 条件允许 | 完成响应指定 action 的 Turnstile 后重放一次 |
| `RATE_LIMITED` | 429 | 延迟 | 严格遵守 `Retry-After` |
| `HUMAN_VERIFICATION_FAILED` | 400/503 | 否 | 重置 Widget；服务不可用时稍后人工重试 |
| `UPSTREAM_REJECTED` | 401/422 | 否 | 更新上游凭据或按提示修正业务输入 |
| `UPSTREAM_UNAVAILABLE` | 503 | 是 | 保留非敏感表单状态，退避后重试读操作 |
| `RESULT_UNKNOWN` | 502 | 否 | 按 `details.next_action` 去上游核验，禁止重放写操作 |
| `INTERNAL_ERROR` | 500 | 否 | 展示 `request_id`，不要上传请求体或敏感状态 |

## 9. 客户端敏感状态清单

以下值只能短暂保存在内存，不得进入 `localStorage`、IndexedDB、URL、分析 SDK、控制台或错误上报：

- 平台密码、学校密码、邮箱验证码、学校验证码；
- `flow_id`、`academic_session_id`、`anti_abuse_pass`、Turnstile Token；
- 群报数 Token、UIS/教务 Cookie、托管凭据明文；
- 带个人成绩、排名、位置、表单答案或预约详情的完整响应。

前端可持久化非敏感偏好，例如校园、默认周数、导出格式和无个人信息的工具入口设置。
