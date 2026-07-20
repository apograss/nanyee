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
3. 在浏览器中识别验证码；可直接复用 `legacy/smu-tools/public/captcha_model.onnx` 和 `legacy/smu-tools/src/lib/captcha-ocr.ts`。普通在线工具不得调用 VPS OCR。
4. `POST /smu/session` 提交 `flow_id`、学号、学校密码和识别结果。验证码错误时重新获取验证码并在浏览器中重试，建议最多自动重试 3 次后让用户手工输入。
5. 成功后只得到 `academic_session_id` 和过期时间；服务器不会返回 UIS/教务 Cookie。
6. 在 5 分钟内调用：
   - `POST /smu/timetable`；
   - `POST /smu/timetable.ics`；
   - `POST /smu/timetable.wakeup`；
   - `POST /smu/grades`。

学校密码只用于第 4 步，不保存、不复用、不进入前端日志。`flow_id` 为一次性；登录失败后重新取验证码。`academic_session_id` 只放内存，页面刷新后允许用户重新登录学校系统。

`/smu/timetable.ics` 返回 `text/calendar` 文件。`/smu/timetable.wakeup` 还需提交 `semester_monday` 和 `campus: "main" | "shunde"`，返回 `.wakeup_schedule` 文件；两者都按普通 Blob 下载处理。

如果用户明确选择“导入 WakeUp”，可在登录平台并确认第三方上传后调用 `POST /smu/timetable.wakeup.share`，额外提交 `confirmation_version: "timetable:wakeup_share:v1"`，后端返回 `share_code`。该路径会把生成的课表上传到 WakeUp；拒绝上传时仍可下载本地文件。成绩结果默认不在服务器保存，返回的 `ranking` 包含课程和教学班范围的排名与分布。

## 5. 托管凭据

托管凭据只用于浏览器关闭后仍需继续执行的评课、学习舱和群报数任务。拒绝托管不影响课表、成绩和在线选课。

- 创建：`POST /credentials`，必须登录、带 CSRF，并提交 `consent_version: "credential-hosting-v1"`。
- 列表：`GET /credentials`，只返回用途、上游、状态、期限和允许公开的提示字段。
- 撤销：`DELETE /credentials/{id}`，必须带 CSRF。

创建响应和列表永远不会返回明文、密文、nonce、包裹密钥或 Azure Key ID。前端提交成功后立即清空密码/Token 输入值及其组件状态。

自动评课凭据的创建参数固定为：

```json
{
  "upstream": "academic",
  "purpose": "evaluation",
  "secret": "{\"account\":\"学号\",\"password\":\"学校密码\"}",
  "consent_version": "credential-hosting-v1",
  "metadata": {"account_hint": "仅显示给用户的脱敏提示"}
}
```

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
- `retry_wait`：等待下一次持久重试；
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

`GET /study-cabin/cabins` 返回可选舱位，不要在前端另写一份 ID。`scheduled_for` 决定 Worker 首次尝试时间。验证码识别失败会退避并重新排队，不会立即废弃凭据；无可用舱位会在 `attempt_until` 前重试。上游提交超时会直接进入 `verification_required`。成功收据只含舱位、日期和时间，不含学校账号或凭据。

### 自动评课

自动评课必须使用 `purpose: "evaluation"` 的托管学校凭据创建持久任务：

```json
{
  "tool_id": "evaluation",
  "operation": "submit",
  "credential_id": "评课凭据 ID",
  "confirmation_version": "evaluation:submit:v1",
  "payload": {
    "strategy": "legacy_positive_random",
    "max_courses": 60,
    "retry_until": "2026-09-30T23:59:00+08:00"
  }
}
```

`retry_until` 可省略；填写时表示用户主动设置的停止时间。Worker 会查找全部待评课程，按旧工具的偏高随机档位生成合法答案并依次提交。服务端验证码仅用于这个无人值守任务：单次登录按 1、2、4、8 秒退避识别，仍未成功时任务重新进入 `retry_wait`，浏览器关闭不影响后续执行。只有用户取消、凭据撤销或过期、用户设置的截止时间到达等确定条件才终止。

### 群报数

即时路径均要求平台登录和 CSRF，但 Token 不落库：

- `POST /qun/token/verify`；
- `POST /qun/forms`；
- `POST /qun/forms/resolve`，可提交表单 ID 或群报数链接；
- `POST /qun/forms/{form_id}/preview`；
- `POST /qun/forms/{form_id}/submit`，使用本次 Token 立即提交；
- `POST /qun/images`，使用 `multipart/form-data`，字段为 `auth_token` 与 `file`。

图片仅接受内容与声明 MIME 一致的 JPEG、PNG、GIF 或 WebP，单张最多 5 MiB。响应 URL 已经过后端上传目标和 CDN 域名校验；前端把它填入对应图片字段。预览请求携带 `auth_token`、`defaults` 和按 `cid` 索引的 `custom_fields`，返回规范化 `catalogs`。用户核对后可以把相同 Token、`form_version`、`title`、`catalogs` 发送到即时提交接口；需要定时执行时才创建托管 Token 凭据和 `qun_checkin:submit:v1` 任务。提交结果未知时禁止前端自动重放，应引导用户先到群报数核验。

## 7. 自动选课与兼容接口

自动选课要求平台登录、CSRF 和仍有效的 `academic_session_id`。它使用当前 API 进程内的学校会话，不保存学校密码；浏览器关闭不会主动取消，但 API 重启后无法恢复本次运行。

### 选课

1. `POST /smu/enrollment/categories` 获取当前选课类型。
2. `POST /smu/enrollment/courses` 提交 `category_code` 获取实时可选列表。
3. 用户按优先级选择 1–4 门课程并确认后，调用 `POST /smu/enrollment/runs`：

```json
{
  "academic_session_id": "temporary-session-id",
  "category_code": "12",
  "preference_task_codes": ["第一志愿 task_code", "第二志愿 task_code"],
  "scheduled_time": "09:00:00",
  "max_attempts": 15,
  "primary_burst_attempts": 5,
  "confirm_conflicts": true,
  "confirmation_version": "course_selection:auto_enroll:v1"
}
```

4. 轮询 `GET /smu/enrollment/runs/{run_id}` 展示当前状态、尝试次数、命中课程和事件；用户停止时调用 `POST /smu/enrollment/runs/{run_id}/cancel`。

后端会先校准教务服务器时间；到达计划时间后先连续尝试第一志愿，再按志愿顺序轮询，尝试间隔随机为 500–1000 毫秒，默认 15 次、最多 120 次。冲突课程可按用户确认自动执行二次确认。前端只使用接口返回的真实类型、课程和事件，不得生成示例课程或硬编码 `category_code`。

### 兼容接口

`POST /smu/enrollment/submit` 以及 `/smu/evaluations/pending`、`/drafts`、`/submit` 保留给兼容和人工排错，不作为新前端的主流程。新前端的选课主入口使用自动运行接口；评课主入口创建托管凭据和持久任务，不再要求用户逐题填写。

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
