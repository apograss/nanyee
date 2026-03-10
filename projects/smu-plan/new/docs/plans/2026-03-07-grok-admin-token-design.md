# Grok Admin Token Monitoring Design

**Goal:** 让 `check.nanyee.de` 的 Grok 账号状态优先来自 `grok2api` 的管理接口，而不是只靠本地 `token.json` / `result_grok` 猜测。

## Approach

### Option 1: 继续只读本地文件
- 优点：实现简单，不依赖管理口
- 缺点：状态滞后，无法拿到最新 `quota`、`last_fail_reason`、`use_count`

### Option 2: 优先读 `grok2api /v1/admin/tokens`，本地文件兜底
- 优点：能直接拿到服务端最新 token 状态；管理口不可用时仍有兜底
- 缺点：需要额外配置 `APP_KEY`

### Option 3: 每轮采集先触发 `refresh`
- 优点：状态最新
- 缺点：监控会主动打热号池，代价过高

## Decision

采用 **Option 2**。

## Data Flow

1. `check` 采集器调用 `GET /v1/admin/tokens`
2. 解析 `ssoBasic` / `ssoSuper` 中的 token 项
3. 用 `status`、`quota`、`last_fail_reason` 归类为 `healthy / rate_limited / invalid / unknown`
4. 若管理接口失败，则回退到本地 `token.json`
5. 若 `token.json` 也不可用，再回退到 `result_grok`

## Error Handling

- 管理口请求失败：记录为内部兜底，不让整轮采集失败
- 不保存原始 token，只用 token hash 做 `accountKey`
- `note` 或邮箱仅用作掩码展示

## Testing

- 先写失败测试覆盖 admin API 返回结构
- 验证 `active + quota > 0`、`quota <= 0`、`disabled`、`last_fail_reason` 分类
- 验证没有邮箱时仍能生成稳定账号 key 和安全展示标签
