# SMU Public Login Fix Design

## Problem Summary

南方医科大学这一条公版登录链路已经定位到三个独立问题：

- 当前账号 `3257043015 / lk2021lk!` 在手机端可正常登录。
- 现有 Python 代码使用的密码 AES 加密方式是可用的，密文 `anmjznns1Eh/V27GAVC+tA==` 在正确请求条件下可以直接换回 token。
- 真正的偏差在学校 code 和输入清洗：
  - `school=smu` 且 `Authorization=Basic c211OnBpZw==` 时，`https://smu.tsnkj.com/auth/oauth/token` 返回正常 token JSON。
  - `school=NFYKDX` 且 `Authorization=Basic TkZZS0RYOnBpZw==` 时，同一接口返回 HTTP 302，而不是认证 JSON。
  - 通过管道给 `setup_and_auth.py` 传入用户名时，输入里混入了 BOM，实际发出的用户名是 `\ufeff3257043015`。

这说明根因不是“密码错误”，而是“登录请求使用了错误的学校 code，外加输入层可能污染用户名”。

## Goals

- 让南方医科大学公版账号在 CLI 和 `setup_and_auth.py` 中稳定登录成功。
- 避免把 `302`、HTML 或非 JSON 响应误报成“密码错误”。
- 清理用户名/密码输入中的 BOM 和首尾空白，减少复制粘贴造成的假失败。
- 在首次登录成功后持久化可用的 `school_code`，让后续刷新 token 继续复用正确值。

## Non-goals

- 不重写整套学校发现和学校建档逻辑。
- 不调整当前公版密码 AES 算法，也不更换 `thanks,pig4cloud` 的 key/iv。
- 不修改跑步、路径、刷脸等后续业务流程。

## Chosen Approach

采用“最小但稳”的修复方案，保持现有公版/私版分流不变，只修认证边界：

1. 增加登录输入规范化。
   - 对用户名和密码统一做 `strip()`。
   - 去掉开头可能出现的 `\ufeff` BOM，避免脚本管道输入或从文档复制时污染账号。

2. 为公版登录增加候选学校 code 解析。
   - 继续先尝试数据库里已有的 `school_code`。
   - 对南方医科大学 `school_id=1001` 增加 `smu` 候选值。
   - 任意候选值登录成功后，将成功值回写到 `TsnSchool_Model.school_code`，让后续刷新 token 和重复登录都走正确 code。

3. 强化 `TiShiNengSdkPublic.getAccessToken()` 的响应判定。
   - 如果返回 JSON，就按现有逻辑解析。
   - 如果返回 `302`、HTML 或其它非 JSON 响应，不再直接抛 `JSONDecodeError`，而是转换成“当前 school code/认证入口不匹配”的可识别异常。

4. 清理调试脚本里的重复 fallback。
   - 目前 `setup_and_auth.py` 在失败后手动把 `school_code` 改成 `smu` 再试一次。
   - 修复后应把 fallback 收敛到 `tsnPasswordAuthServer()` 一处，避免逻辑分叉和重复维护。

## Data Flow

修复后的公版登录链路如下：

1. `main.py` 或 `setup_and_auth.py` 读取账号和密码。
2. 输入先经过规范化，去 BOM、去首尾空白。
3. `tsnPasswordAuthServer()` 根据学校记录生成候选 `school_code` 列表。
4. 对每个候选 code：
   - 构造 `TiShiNengSdkPublic`
   - 设置 `lan_url=https://smu.tsnkj.com`
   - 使用现有 AES 密码加密去请求 `/auth/oauth/token`
5. 如果拿到 token：
   - 继续请求 `getLoginUserInfo()`
   - 保存账号
   - 持久化成功的 `school_code`
6. 如果收到 `302`/非 JSON：
   - 判定为“当前 code 不适合该登录入口”
   - 自动尝试下一个候选 code
7. 如果全部候选都失败，再抛出最终认证异常。

## Error Handling

错误处理需要从“按文案猜错因”升级为“按响应类型分类”：

- JSON 且 `msg` 为凭证错误：继续报“用户名或密码错误”。
- `302` 或返回 HTML：报“当前学校 code 与认证入口不匹配”，并触发候选 code fallback。
- 非 JSON 但不是 HTML：报“认证服务返回了非预期响应”，保留状态码和响应片段用于调试。
- 输入为空：继续在 CLI 层阻止发请求。

这样可以把“密码真错”和“请求打偏了”分开，减少误判。

## Testing Strategy

仓库当前没有现成测试目录，也没有 `pytest` 依赖，因此测试采用标准库 `unittest`：

- 新增 `tests/` 包和公版登录回归测试。
- 覆盖以下场景：
  - BOM 用户名能够被清洗成纯净值。
  - 候选学校 code 生成顺序正确。
  - `TiShiNengSdkPublic.getAccessToken()` 在 `302`/HTML 响应下能返回可识别错误，而不是抛 `JSONDecodeError`。
  - `tsnPasswordAuthServer()` 在第一个 code 失败、第二个 code 成功时能够成功保存账号并回写 `school_code='smu'`。

人工验证保留一轮真实请求：

- 运行 `setup_and_auth.py`
- 用真实账号登录
- 确认数据库里的学校 code 已经稳定为 `smu`

## Risks And Mitigations

- 风险：把南方医科大学的兼容逻辑写死得太散。
  - 缓解：把候选 code 逻辑集中到一个 helper，避免散落在多个脚本里。

- 风险：未来还有其他学校使用 cloud code 但登录口只认 abbreviation。
  - 缓解：先把候选 code 机制做成通用入口，但仅为已验证的学校增加特例。

- 风险：真实认证接口偶发返回非 JSON，误触 fallback。
  - 缓解：错误分类里保留状态码和响应摘要，便于继续扩展判定规则。

## Expected Outcome

完成后，南方医科大学这组账号应当可以直接在当前 CLI 工具中完成授权，且失败信息能准确区分：

- 用户名/密码错误
- 学校 code 不匹配
- 认证服务异常

不需要修改数据库 schema，也不需要改动跑步主流程。
