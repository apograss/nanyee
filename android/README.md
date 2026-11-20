# Nanyee Android

原生 Kotlin / Jetpack Compose Material 3 客户端，最低 Android 8（API 26）。支持系统深色模式。

## 构建和安装

使用 JDK 17；安装 Android command-line tools 并通过 `sdkmanager` 安装 `platform-tools`、`platforms;android-35`、`build-tools;35.0.0`。设置 `ANDROID_HOME`（或在未跟踪的 `local.properties` 中设置 `sdk.dir`）。

```sh
cd android
./gradlew assembleDebug testDebugUnitTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n de.nanyee.app/.MainActivity
```

Debug APK 使用 Android 默认开发密钥签名，可直接安装。发布正式版本前请配置自己的签名密钥；不要提交密钥。

本环境 SDK 安装于 `/home/ubuntu/android-sdk`。建议将 JDK、SDK 和模拟器安装步骤加入环境 blueprint，以便后续会话复用。

## 我的 · Nanyee 账号

“我的”同时保留学校账号区域，平台账号无需学校登录。Nanyee 登录、退出、资料、邮箱绑定/换绑/解绑、密码找回、托管凭据维护、任务与回执、站内提醒使用与自习舱/自动评课相同的加密 Cookie 和共享客户端；注册只链接网站。凭据新增仍走工具中的托管同意流程；不提供账号删除、昵称修改或停止其他评课账号。

每次平台写请求（包括发送验证码、登录、查看秘密）均先确认。服务器要求 Turnstile 时显示“请在网页完成验证”及网站入口，不尝试绕过；401 清空账号视图并回到登录。邮箱解绑与网站一致：验证当前密码，不额外发送验证码。密码重置成功提示所有平台会话退出。提醒仅对服务端允许关闭的条目在本机记忆关闭状态。

密码、验证码、新的托管秘密、确认请求与查看明文均不写入 SavedState 或磁盘；离开页面/进入后台时清空，明文窗口禁止系统截图。旋转保留 ViewModel，进程恢复仅恢复路由、任务编号与非明文验证码挑战；秘密必须重新输入、重新确认。演示独立使用内存后端，提供成功、空列表、失败、会话过期与网页验证场景，演示验证码为 `123456`。

`PlatformAccountLiveListingTest` 仅在 `NANYEE_PLATFORM_USERNAME` / `NANYEE_PLATFORM_PASSWORD` 同时存在时运行：只允许平台登录及 GET me/credentials/jobs/notices，不查看秘密、不提交业务写入、不注销服务器会话，只输出数量或通过/失败。退出测试仅清理内存 Cookie。

## 使用与隐私

- 默认由手机直连学校 `uis.smu.edu.cn` / `zhjw.smu.edu.cn`，不经过 Nanyee 服务器。旧 `SchoolApi` 保留为独立数据源，界面和缓存模型不变。
- 保留手动验证码登录，点击图片刷新；失败后重新获取一次性流程。勾选“记住”并已保存凭据后，刷新课表、查看成绩或会话过期时可自动登录；普通冷启动只读本机课表，不会自动登录。自动登录期间仍可浏览缓存或取消。
- OCR 在设备上使用 ONNX Runtime Android 1.20.0；模型来自仓库 `legacy/smu-tools/public/captcha_model.onnx`，延迟在后台加载。输入 `image` 为 float32 `[1,1,28,80]`（双线性缩放、归一化亮度），输出 `digits` 为 `[1,4,10]`，逐位 argmax。仅验证码错误会重新取图重试，总计最多 3 次；密码错误、限流及其他错误立即回到手动登录并显示原因，遵守 Retry-After。不记录凭据或识别结果。
- 学校会话、Cookie、验证码、成绩仅在内存中保存。成功加载的课表、学期列表与更新时间使用独立的 EncryptedSharedPreferences 加密保存；重启直接查看本机课表，不代表已经登录。已加载过的学期可离线切换，未缓存的学期、刷新和成绩需要重新登录。
- 我的 → “退出并清除本机课表”会删除课表缓存，不删除已选择记住的凭据。会话过期时仍可查看缓存；加密存储损坏时会提示重新登录，不会阻止启动。
- 课表从学校周课表接口读取，校历使用学校 `getDatesOfWeek` 第一周的周一日期；学校校历不可用时明确提示手动选周，不猜测开学日期。直连会话和验证码流程分别在本机最多保留 30 分钟、5 分钟（不代表学校保证的有效期）。按北京时间每天及返回前台重新计算本周，手动选周保持不变，可点“回到本周”。演示模式使用当前周周一作为明确标注的示例校历。
- 底部导航为“课表 / 课堂 / 评课 / 工具 / 我的”（横屏使用侧栏），默认打开课表。课堂右上角切换学习通 / 雨课堂，平台选择保存在本机；切换平台、标签及旋转时分别保留可恢复的界面状态。评课独立提供服务器自动评课与本机手动评课；工具包含成绩、自习舱预约、抢课。课堂、评课与工具入口不依赖学校登录；成绩仍需学校会话，不使用课表缓存伪造学业数据。
- 课程网格左右滑动切换一周，始终保留七列；也可使用周次下拉框。资源参考说明见 [WAKEUP-NOTES.md](WAKEUP-NOTES.md)。
- “记住学号和密码”使用 Android Keystore 支持的 EncryptedSharedPreferences。取消勾选立即删除；不备份应用数据。
- 仅学期总周数作为普通偏好保存（1–30，默认 20）。
- 所有构建均可在登录页选择“演示模式”；横幅明确标注示例数据，不发送学校查询请求。
- 不含 Turnstile 与导出功能；学校直连只调用仓库已有的认证、查询与明确确认后的评课/选课端点。学习舱任务通过下述 Nanyee API 创建，不由手机直接访问学校 infospace。

## 学习舱预约（工具）

- 无需先登录学校：学校登录页也有工具入口。Nanyee 平台账号与学校登录独立；通过 `https://nanyee.de/api/v1` 的 `/auth/login`、`/auth/me`、`/auth/logout` 管理。平台 Cookie 使用单独的 EncryptedSharedPreferences，写请求带 `X-CSRF-Token`；退出平台清除 Cookie，不影响课表。注册与人机验证只提供网站入口；429 遵守 Retry-After。
- `/credentials` 只选择 `infospace` / `study_cabin` 的有效凭据。明确同意长期托管后才读取本机已记住的学校凭据；POST/PUT 提交后立即清空输入密码。新建遇到未知结果时先重新列出并接纳新增的有效凭据，再决定是否重发。更新界面显示原账号提示，填写学校学号及新密码；学号可从本机已记住的凭据预填，新密码不预填。提交前按 `account_hint` 可见的末四位核对学号，不符或提示无法核对时阻止 PUT，提示先撤销再新建；末四位核对不能证明完整账号相同。应用不调用 reveal，不回读服务器托管秘密。更换账号须明确撤销原凭据再新建；撤销会取消关联的排队/等待重试任务。平台登录密码只通过登录发送，任务仅引用凭据 ID。
- 舱位与名称仅取自 `/study-cabin/cabins`，可选择、移除和调整优先级。日期、10 分钟粒度、30–240 分钟和 08:00–22:50 校验来自服务端模型；另阻止已经结束或不可能执行的尝试窗口。所有时间均为北京时间。确认摘要后才创建任务，使用 `study_cabin:reserve:v1` 和随机幂等键；网络失败时沿用原键与原请求，禁止修改后误用。待确认提交仅在内存中保留；杀进程后请先刷新我的预约核对，避免另建重复任务。
- 默认预约明天 09:00–11:00、立即首次尝试、明天 08:50 截止。worker 只检查截止时间及实时可用性，并未定义固定放号时间/提前预约天数；文档中的 23:59 只是示例，不当作规则。可按学校公告修改首次/停止时间；任务首次计划不能超过未来 30 天。任务排队不等于预约成功。
- 我的预约从 `/jobs` 最近 100 条中筛选学习舱任务，支持下拉刷新、中文状态、收据、核验提示与确认取消。`verification_required` 不自动重放，需到学校网站核验。
- 响应按实际契约解析：`/auth/me` 为 `user` 包装对象，凭据/舱位/任务为顶层数组；任务状态字段为 `state`，收据舱位名为 `receipt.room_name`。`csrf_header` 是请求 Header 名（契约默认 `X-CSRF-Token`），不是 Token；只支持这个固定名称，Token 始终取自 CSRF Cookie。演示响应与类型夹具包含完整账号、凭据、任务字段及可空字段。
- 原有全局演示模式和工具内“无账号体验演示”均使用内存假平台/凭据/任务后端，无学习舱网络请求、不存真实秘密。可模拟运行、重试、成功、失败和结果待核验。学习舱 UI 尚未在设备上进行大字体/平板/深色视觉验证。

## 课程评价

- 评课提供两个独立模式：自动评课沿用 Nanyee 平台登录与明确托管同意（`academic` / `evaluation`），手动一键则完全直连学校、复用内存会话与静默登录，不使用 Nanyee 服务器。
- 自动模式按 `evaluation:submit:v1` 确认，固定 `legacy_positive_random`，每轮 1–60 门，可选带时区的未来截止时间。未填时服务器默认运行 180 天；每日运行窗口由服务器配置。展示状态、下次运行、最近一轮日志/收据，识别 HTTP 200 + `X-Job-Deduplicated`，支持确认取消；凭据失效通知可进入更新表单。
- 手动模式仅查询今天与昨天的待评课程，可全选/多选，加载表单并预览生成答案。可逐题修改单选/判断、星级和文字建议，每门实时显示合计并可重新随机；保留二次明确确认，按显示的答案逐门提交，不在确认时重新生成。全部选项的学校 `data-fz` 明确为零时显示“不计分”；缺失/无效分值保留独立解析标记，不记录题目或答案日志。首个上游错误立即停止，结果未知不自动重放；再次操作前须只读刷新核验。无课程时提示可能尚未开放或已评完。自动任务仍仅发送策略，不包含手动答案。
- 学校端仅移植 `client.py` / `evaluation.py` 中的 `xsktpjData`、`showXsktpjwj.page`、`savePj`，不探测其他端点。策略与星级计分/星串答案按 Python 实现移植。演示模式的两条流程都用内存假后端，不联网、不提交真实评价。
- 手动演示可切换正常评课、评教未开放、暂无待评和第二门提交失败；每门模拟提交等待约 1.5 秒，可演示旋转保留进度与首错停止。自动演示失败轮仅展示失败日志，终态或凭据失效时不展示下次运行。
- JVM 普通测试仅构建请求、解析合成夹具并调用假后端，没有真实凭据/任务创建或评价提交。新增只读 opt-in 测试仅静默登录并查询待评列表（不加载草稿、不提交）；缺少任一凭据变量时 assume 跳过。只输出 OCR 次数、待评数量及标识形状是否完整；空列表合法。请仅由账号持有人显式运行：

```sh
cd android
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew testDebugUnitTest --tests 'de.nanyee.app.EvaluationLiveListingTest' --rerun-tasks --info --max-workers=2
```

运行前在本地环境安全设置 `NANYEE_LIVE_ACCOUNT` 和 `NANYEE_LIVE_PASSWORD`，不要放入命令行或仓库。登录可能影响其他设备的学校会话。课程评价 UI 尚未设备视觉验证。

## 抢课（工具，本机）

- 仅依据本仓库 `services/platform/src/nanyee/integrations/smu/client.py`、`enrollment_runs.py`、`tools/course_selection/models.py` 及测试移植；未复制 GPL GUI 仓库代码。复用内存学校 SSO 会话及静默登录，不经过 Nanyee 服务器。
- 只读入口为 welcome 页与 `/new/student/xsxk/`；按类型分页 POST `xklx/{code}/kxkc`（每页 50，最多 20 页）。容量取 `pkrs`，已选人数取 `jxbrs`、回退 `xkrs`；可搜索、刷新、排序最多四个志愿。没有退课、已选查询或独立容量轮询端点。
- 用户确认摘要后才 POST `xklx/{code}/add`。默认 15 次尝试，先尝试首志愿 5 次，最多 120 次；串行，100–300 ms 随机间隔。冲突确认默认关闭，仅开启后才重复 `hlct=1`。门数上限单独显示，不声称选课成功。
- 未开放按 0.5–1 s 等候，不消耗尝试次数，最多 600 次连续轮询；429 按 Retry-After 等候（缺失或无效时 60 秒）。超时/非 JSON 记为结果未知并继续，耗尽后仅提示人工核验，不追加任何核验写入。
- 可选北京时间 HH:mm:ss；运行前采样 welcome 的 Date 三次，取最小 RTT 的偏移，提前 50 ms；当天时间已过则顺延次日。Date 精度约一秒，不能保证精准到点。必须保持 App 在前台；运行/等待时常亮，ViewModel 保持旋转后的任务，取消会中断网络请求/等待。没有前台服务或进程重启续跑，中断后请人工核验。
- 演示源完全不联网，可选第三次成功、未开放后开放、冲突、满员、门数上限、超时未知。UI 尚未在设备上视觉验证。
- `CourseSelectionLiveListingTest` 仅在同时设置 `NANYEE_LIVE_ACCOUNT`、`NANYEE_LIVE_PASSWORD` 时运行；只静默登录、发现类型并读取每类第一页，输出脱敏计数，测试只持有无提交方法的 `CourseGrabListing` 接口。不要将凭据放入命令行或文件。登录可能影响其他设备会话；此测试不调用 `/add`：

```sh
cd android
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew testDebugUnitTest --tests 'de.nanyee.app.CourseSelectionLiveListingTest' --rerun-tasks --info --max-workers=2
```

## 模拟器

```sh
sdkmanager 'emulator' 'system-images;android-35;google_apis;x86_64'
avdmanager create avd -n nanyee -k 'system-images;android-35;google_apis;x86_64' --device pixel_6
emulator -avd nanyee
```

未使用真实学生账号验证上游学校登录，演示模式不代表真实学校响应。

## 学习通 · 第一期

课堂 → 学习通独立直连超星，不共享教务 UIS/zhjw 或 Nanyee 平台的会话。支持官方 APP 协议的密码/短信登录（AES-ECB logininfo、原生 UA/schild、完整 Android 设备资料），以及二维码授权登录、课程和活动只读列表。短信发送需确认，重发间隔 60 秒；验证码不持久化，演示验证码为 `123456`，不会发送真实短信。二维码每 3 秒轮询，失效或用尽 90 次轮询后自动更新，离开页面/后台停止。支持仅当前本人账号的普通、拍照、签到码、手势、二维码和真实位置签到。拍照支持系统相机及相册；确认后才向 pan-yz 上传并提交签到。扫码使用 Apache-2.0 的 ZXing Android Embedded（无 Play Services）。每次提交前均显示课程、活动、当前账号和相关输入的确认摘要；拼图需要用户手动移动，不含自动解题器。要求人脸检查的活动直接显示不支持。

凭据仅在用户选择保存时存入独立 EncryptedSharedPreferences；Cookie 始终加密持久化。过期后的只读操作可用保存的密码重新登录，任何签到写入均不自动重放。没有保存密码的二维码会话过期后需要再次授权。退出登录清除学习通凭据、Cookie、草稿和照片。旋转使用保留 ViewModel；进程重建恢复加密的课程/活动及输入草稿，但不恢复提交动作、验证码、二维码内容或位置。被中断的提交显示“结果未知”，必须先在官方学习通核验。

位置只来自 Android LocationManager，拒绝模拟位置、陈旧位置和超过 100 米误差的位置；WGS84 转为参考客户端使用的 BD-09。参考客户端的地址逆解析依赖百度 SDK，因此本实现使用活动地址文本，不接入地图厂商 SDK。已知活动目标坐标时显示距离；未知时明确提示无法计算。没有坐标编辑框、不发送参考客户端伪造的防作弊概率或百度定位来源声明。演示后端不联网，提供各签到类型、手动拼图、拒绝和未知结果；定位演示仍要求手机真实定位，扫码演示可使用界面提供的测试码内容。

未提供学习通真实账号；本期仅运行演示和离线单元测试，不宣称已验证超星线上协议。可选只读测试 `XuexitongLiveListingTest` 仅在同时设置 `XUEXITONG_LIVE_ACCOUNT` / `XUEXITONG_LIVE_PASSWORD` 后启用。请求层白名单仅允许登录、自己的用户信息、课程与活动列表，拒绝签到、上传和其他写入路径。不要将凭据放进命令行或提交到仓库。无账号时测试跳过且不联网：

```sh
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew testDebugUnitTest --tests 'de.nanyee.app.XuexitongLiveListingTest' --rerun-tasks --info --no-daemon --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process
```

## 学习通 · 第二期

活动列表可打开投票、问卷、随堂练习、主题讨论、课堂评分及选人监测；已结束、未知类型和不支持的题型只读显示详情。投票为参考客户端的单选投票；问卷支持单选、多选、判断和简答；练习另支持填空及文字回答。图片、公式、音视频和复杂组合题暂不提供作答，明确提示转至官方学习通，避免在题意不完整时提交。

所有作答从空白的本地草稿开始，答案由本人手动输入；解析模型不保留服务端参考答案、正确选项标记、解析或已返回的学生答案。不自动填答、不显示答案、不发送群聊回执。提交前展示账号、课程、活动及逐题答案/评分/实名回复的确认摘要；请求前重新核对当前账号与活动要求，发生变化则停止。草稿沿用独立加密日志（演示用 SavedState）；旋转保留输入，进程重建不恢复确认或写入。中断/未知结果不会自动重放，已知成功或未知结果在本页禁用再次提交。

讨论展示主题及默认一页回复（最多 100 条），可手动刷新并实名回复；暂不支持回复分页和图片附件。课堂评分支持分项评分及无分项时的 0–100 总分。选人仅在对应页面可见、应用 RESUMED 时每 3 秒只读轮询，提示并短鸣当前本人被选中；不展示、持久化其他人的选人资料。离开页面、切换演示模式、切后台或注销均停止轮询，无后台服务；读取失败会停止并要求手动刷新。超星会话自动恢复仍只用于读取；确认后的写入不自动重试。

离线演示新增每类课堂活动的成功及失败场景和未知类型只读详情，无网络。新增请求、解析、手动作答防泄漏、确认状态机、轮询取消与演示测试。本期不使用真实账号或请求，线上协议、设备上的旋转/进程重建与界面尚未验证。原有可选真实测试仍只允许登录和课程/活动列表，不允许课堂提交、签到、上传或回执。

## 雨课堂 · 第三期

课堂 → 雨课堂使用独立的 `rain_classroom_private` 加密存储，不共享学校或学习通凭据。支持 www / pro / changjiang / huanghe 四个官方服务器；Cookie、当前身份和待核验标记按服务器隔离，即使 Cookie 声明 `.yuketang.cn` 也不会跨服务器发送。扫码登录使用官方 pre-info 的 qrContent/token 和 login 长轮询；`50001` 超时后自动获取新二维码并继续，仅在页面可见且 RESUMED 时等待授权。已授权 Cookie 加密保留，过期需重新扫码。**密码和短信登录未移植**：参考客户端在发送短信前也需要腾讯验证码 ticket/rand，本期未集成腾讯 SDK 或验证码 WebView，不绕过验证码；也未实现微信 OAuth。

两平台最多跟随 3 次重定向，逐跳保存/携带 Cookie，不重发原始 POST 密码/验证码。只允许 HTTPS 官方学习通域名或当前雨课堂服务器，保留跨服务器隔离；越界、缺陷或超限重定向不一概标为会话过期。请求构造、独立 OpenSSL ECB/schild/MD5 向量、二维码更新/取消、演示短信和重定向 Cookie/CSRF 均有离线测试。真实账号授权和 UI 仍需设备验证。

课程列表只读；开课列表在课程页前台每 3 秒检查，离开或后台立即取消，读取失败暂停并要求手动刷新。不会自动签到。课堂签到会带 `joinIfNotIn: true`，确认摘要明确可能加入课堂。相机扫码只接受当前服务器的 HTTPS 课堂码，不接受任意网址、其他服务器或自定义 URL scheme；先确认提交 scan，再单独确认 checkin，不串联自动写入。

位置签到复用学习通的 LocationManager 验证，拒绝模拟、超过两分钟或精度超过 100 米的位置。学习通默认仍转 BD-09；雨课堂显式使用手机原始 **WGS84** 坐标，界面标明坐标系，不复制参考客户端的活动中心坐标。活动提供的地址只作说明，不冒充手机逆地理编码；未接入地图 SDK。雨课堂服务器的实际坐标系兼容性尚未通过真实账号验证。确认后再次核对本人身份与位置签到要求，位置过期必须重新获取；演示定位也不提供假坐标。

课堂 WebSocket 仅在课堂页可见且 RESUMED 时运行，发送本人 hello 并展示最近 500 条时间线；离开、后台、切换演示/服务器和注销均发送 leavelesson 后关闭（断网不保证送达）。返回前台只使用内存课堂令牌重连，**不会重新 checkin**；断开后可手动重连，无后台服务。课堂结束后关闭直播并保留只读课件。幻灯片显示、时间线跳页、跟随翻页及保存单页/全部到系统相册可用；保存前确认，逐张保存，可取消，失败不自动重试，保留已保存项。Android 10+ 使用 MediaStore/Pictures/Nanyee，无需存储权限；Android 8–9 单独请求旧存储权限。图片使用独立无 Cookie/Authorization 的公开 HTTPS 客户端，拒绝重定向和私网地址，限制 12 MB/张并安全采样至约 400 万像素。

支持手动单选、多选、投票、判断、填空和纯文字简答；未知题型、题干/选项中的媒体或公式仅供只读。参考答案、正确标记、解析、空格答案、服务端学生答案均不进入作答模型；初始草稿为空，只恢复本机本人手写草稿。只允许已收到开放事件的题目作答；普通 answer 和晚交 retry 各自预览确认，不自动选择提交方式，不上传附件。每次 scan/checkin/位置/作答/重试之前读取当前本人身份；身份或本机确认快照变化即停止，不代其他账号提交。任何写入网络中断/格式未知均保留加密待核验标记，禁用后续课堂写入；必须先在官方核验并明确清除本地标记，绝不自动重放。

旋转保留独立 ViewModel；进程重建只恢复服务器、加密 Cookie、待核验标记和本人手写草稿，不持久化课堂 Bearer/lessonToken、位置、二维码或确认动作。进程重建后重新打开课堂仍需确认 checkin，然后可恢复该课堂的手写草稿。退出清除所有雨课堂服务器的本机凭据、Cookie、草稿，不影响学校或学习通。

离线演示覆盖扫码授权、课程/空列表、开课检查、两步扫码加入、课堂签到、真实定位、课件/图片、直播、手动作答及重试、相册的成功、失败与未知结果；演示无网络，相册保存仍会真实写入本机且需确认。新增请求、解析、会话隔离、手写答案、防重放与可见性测试。**本期仅运行离线测试和构建，没有真实雨课堂凭据或请求**；线上兼容性、相机、定位、MediaStore、WebSocket 实际服务及设备旋转/进程重建均未验证。

### 安装包与 release 验证

安装包使用 `assembleRelease`：R8 压缩代码、移除未使用资源，保留 ONNX Runtime 的 JNI 类及序列化、OkHttp 公共后缀表、Tink protobuf 所需的反射入口；依赖自带的 consumer rules 也会合并。所有现有运行时依赖均有实际调用；体积最大的 Material 扩展图标库只保留用到的图标，ONNX Runtime 用于本机验证码识别，均非无用依赖。

默认 release 只带 `arm64-v8a,armeabi-v7a`，debug 的 ABI、调试和测试设置不变。可用 `-PreleaseAbis=x86_64` 构建模拟器验证包，或 `-PreleaseAbis=arm64-v8a` 比较单 ABI 体积；这些覆盖项只作用于 release。release 使用本机 debug keystore 签名，方便直接安装，**不是正式商店发布签名**，不同机器的 debug key 可能不同。不要用它替代正式发布密钥。

```sh
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew assembleRelease --no-daemon --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process
# 另行构建 x86_64 release，再安装到模拟器（同样启用 R8/resource shrinking）
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew assembleRelease -PreleaseAbis=x86_64 --no-daemon --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process
adb install -r app/build/outputs/apk/release/app-release.apk
mkdir -p "$HOME/out/nanyee-release-smoke"
ANDROID_HOME=/home/ubuntu/android-sdk bash release-smoke/run.sh "$HOME/out/nanyee-release-smoke"
```

独立 smoke instrumentation APK 使用同一个 debug key，不放入应用，也不添加测试框架依赖；通过已安装 release 应用的 ClassLoader 反射调用保留后的 ONNX API，打开其真实 `captcha_model.onnx`，执行 `[1,1,28,80]` 离线输入并验证 `[1,4,10]` 有限输出，再启动 MainActivity。不读取账号、不请求网络端点，不验证真实验证码识别准确率；应用自身已有的登录页可能按原行为刷新公开验证码。之后可卸载 `de.nanyee.smoke`。界面验证仍需单独截图，不能用此 smoke 代替。

### Android 许可与来源

本 Android 应用包含移植自 [AneryCoft/course_helper](https://github.com/AneryCoft/course_helper) 的学习通加密、雨课堂协议、课堂 WebSocket 与解析逻辑，原项目许可为 **GPL-3.0**，参考版本 `5344bef2146cb701abf57220d84a79d35daeaf45`。相应源文件标明来源，完整 GPL-3.0 文本见 [`LICENSE`](LICENSE)（其中保留 Free Software Foundation 的原始版权声明）。参考的 Dart 源文件没有单独的作者版权头；其作者归属保留为 AneryCoft/course_helper。分发此 Android 应用须遵守 GPL-3.0，包括提供完整对应源码；该声明不改变仓库中独立 web/backend 等其他部分的许可。

## 可选的真实账号只读集成测试

仅在本地环境同时设置 `NANYEE_LIVE_ACCOUNT` 和 `NANYEE_LIVE_PASSWORD` 后运行；缺少任一变量时 JUnit assume 跳过，不加载模型、不联网。不要将凭据写入命令行参数、Gradle 属性或文件。测试使用同一模型及预处理、JVM ONNX Runtime 和直连数据源，依次读取学期、当前学期前 20 周课表、校历和成绩；不执行选课或评教。登录可能影响其他设备的学校会话。学期外允许当前周为空，但校历、课表和成绩必须非空。

```sh
cd android
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew testDebugUnitTest --tests 'de.nanyee.app.DirectSchoolLiveIntegrationTest' --rerun-tasks --info --max-workers=2
```

`--rerun-tasks` 避免之前的跳过结果被当作最新结果；`--info` 显示测试的统计输出。只打印 OCR 次数、模型形状、学期/课程/成绩记录数，以及校历/当前周/汇总是否存在；失败时不附带上游内容。
