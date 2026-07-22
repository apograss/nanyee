# API 请求示例

以下示例均为脱敏固定值。浏览器实际请求需要 `credentials: include`，写请求还需从 `nanyee_csrf` Cookie 读取值并设置 `X-CSRF-Token`。

## 答题 Challenge

```http
POST /api/v1/registration/challenges
Content-Type: application/json

{"method":"quiz"}
```

```http
POST /api/v1/registration/challenges/00000000-0000-4000-8000-000000000001/verify
Content-Type: application/json

{"answers":[0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3]}
```

## 学校瞬时会话

```http
GET /api/v1/smu/captcha
```

```http
POST /api/v1/smu/session
Content-Type: application/json

{
  "flow_id":"temporary-flow-id-from-server",
  "account":"20260001",
  "password":"仅在当前请求发送",
  "captcha":"ABCD"
}
```

选课 Cookie 登录（需要平台 Session 与 CSRF）：

```http
POST /api/v1/smu/enrollment/session/cookie
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{"cookie":"JSESSIONID=从浏览器复制的值; ROUTE=..."}
```

```http
POST /api/v1/smu/timetable
Content-Type: application/json

{"academic_session_id":"temporary-session-id","total_weeks":20}
```

WakeUp 文件下载请求：

```http
POST /api/v1/smu/timetable.wakeup
Content-Type: application/json

{
  "academic_session_id":"temporary-session-id",
  "total_weeks":20,
  "semester_monday":"2026-09-07",
  "campus":"shunde"
}
```

## 自动选课

### 选课

```http
POST /api/v1/smu/enrollment/courses
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{"academic_session_id":"temporary-session-id","category_code":"12"}
```

```http
POST /api/v1/smu/enrollment/runs
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "academic_session_id":"temporary-session-id",
  "category_code":"12",
  "preference_task_codes":["first-task-from-current-list","second-task-from-current-list"],
  "scheduled_time":"09:00:00",
  "max_attempts":15,
  "primary_burst_attempts":5,
  "confirm_conflicts":true,
  "confirmation_version":"course_selection:auto_enroll:v1"
}
```

轮询 `GET /api/v1/smu/enrollment/runs/{run_id}`；取消时调用：

```http
POST /api/v1/smu/enrollment/runs/run-id-from-server/cancel
X-CSRF-Token: value-from-csrf-cookie
```

## 托管凭据与任务

### 自动评课

```http
POST /api/v1/credentials
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "upstream":"academic",
  "purpose":"evaluation",
  "secret":"{\"account\":\"20260001\",\"password\":\"仅在此请求发送\"}",
  "ttl_seconds":2592000,
  "consent_version":"credential-hosting-v1",
  "metadata":{"account_hint":"尾号 0001"}
}
```

```http
POST /api/v1/jobs
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie
Idempotency-Key: evaluation-20260720-0001

{
  "tool_id":"evaluation",
  "operation":"submit",
  "credential_id":"00000000-0000-4000-8000-000000000002",
  "confirmation_version":"evaluation:submit:v1",
  "payload":{
    "strategy":"legacy_positive_random",
    "max_courses":60
  }
}
```

### 学习舱

```http
POST /api/v1/credentials
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "upstream":"infospace",
  "purpose":"study_cabin",
  "secret":"{\"account\":\"20260001\",\"password\":\"仅在此请求发送\"}",
  "ttl_seconds":604800,
  "consent_version":"credential-hosting-v1",
  "metadata":{"account_hint":"尾号 0001"}
}
```

```http
POST /api/v1/jobs
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie
Idempotency-Key: cabin-20260722-0001

{
  "tool_id":"study_cabin",
  "operation":"reserve",
  "credential_id":"00000000-0000-4000-8000-000000000002",
  "confirmation_version":"study_cabin:reserve:v1",
  "scheduled_for":"2026-07-21T23:59:00+08:00",
  "payload":{
    "target_date":"2026-07-22",
    "start_time":"09:00",
    "end_time":"11:00",
    "title":"学习",
    "cabin_ids":[29817269,29817270],
    "attempt_until":"2026-07-22T08:50:00+08:00"
  }
}
```

### 群报数

先解析表单 ID 或分享链接，再用单次 Token 生成预览；不要在浏览器持久保存 Token：

```http
POST /api/v1/qun/forms/resolve
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "auth_token":"完整且不少于六十字符的脱敏示例Token值aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "input":"https://form.qun100.com/s/123456789012345"
}
```

生成预览：

```http
POST /api/v1/qun/forms/123456789012345/preview
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "auth_token":"完整且不少于六十字符的脱敏示例Token值aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "defaults":{
    "display_name":"张三",
    "default_lat":23.1,
    "default_lng":113.3,
    "default_address":"教学楼"
  },
  "custom_fields":{"temperature":"36.5"}
}
```

图片字段需要上传时使用 multipart，请求成功后只把返回的 URL 放进预览自定义字段：

```http
POST /api/v1/qun/images
Content-Type: multipart/form-data; boundary=...
X-CSRF-Token: value-from-csrf-cookie

auth_token=完整Token
file=@photo.png
```

立即提交可直接继续使用内存中的 Token，无需托管：

```http
POST /api/v1/qun/forms/123456789012345/submit
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "auth_token":"完整且不少于六十字符的脱敏示例Token值aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "form_version":1,
  "title":"每日打卡",
  "catalogs":[{"cid":"temperature","type":"NUMBER_FLOAT","value":"36.5"}],
  "confirmation_version":"qun_checkin:submit:v1"
}
```

只有定时提交才创建托管 Token 和任务：

```http
POST /api/v1/credentials
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie

{
  "upstream":"qun100",
  "purpose":"qun_checkin",
  "secret":"完整且不少于六十字符的脱敏示例Token值aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "ttl_seconds":86400,
  "consent_version":"credential-hosting-v1",
  "metadata":{"account_hint":"尾号 0001"}
}
```

```http
POST /api/v1/jobs
Content-Type: application/json
X-CSRF-Token: value-from-csrf-cookie
Idempotency-Key: checkin-20260720-0001

{
  "tool_id":"qun_checkin",
  "operation":"submit",
  "credential_id":"00000000-0000-4000-8000-000000000002",
  "confirmation_version":"qun_checkin:submit:v1",
  "payload":{
    "form_id":"123456789012345",
    "form_version":1,
    "title":"每日打卡",
    "catalogs":[
      {"cid":"temperature","type":"NUMBER_FLOAT","value":"36.5"}
    ]
  }
}
```
