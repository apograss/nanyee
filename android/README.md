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

## 使用与隐私

- 默认由手机直连学校 `uis.smu.edu.cn` / `zhjw.smu.edu.cn`，不经过 Nanyee 服务器。旧 `SchoolApi` 保留为独立数据源，界面和缓存模型不变。
- 保留手动验证码登录，点击图片刷新；失败后重新获取一次性流程。勾选“记住”并已保存凭据后，刷新课表、查看成绩或会话过期时可自动登录；普通冷启动只读本机课表，不会自动登录。自动登录期间仍可浏览缓存或取消。
- OCR 在设备上使用 ONNX Runtime Android 1.20.0；模型来自仓库 `legacy/smu-tools/public/captcha_model.onnx`，延迟在后台加载。输入 `image` 为 float32 `[1,1,28,80]`（双线性缩放、归一化亮度），输出 `digits` 为 `[1,4,10]`，逐位 argmax。仅验证码错误会重新取图重试，总计最多 3 次；密码错误、限流及其他错误立即回到手动登录并显示原因，遵守 Retry-After。不记录凭据或识别结果。
- 学校会话、Cookie、验证码、成绩仅在内存中保存。成功加载的课表、学期列表与更新时间使用独立的 EncryptedSharedPreferences 加密保存；重启直接查看本机课表，不代表已经登录。已加载过的学期可离线切换，未缓存的学期、刷新和成绩需要重新登录。
- 我的 → “退出并清除本机课表”会删除课表缓存，不删除已选择记住的凭据。会话过期时仍可查看缓存；加密存储损坏时会提示重新登录，不会阻止启动。
- 课表从学校周课表接口读取，校历使用学校 `getDatesOfWeek` 第一周的周一日期；学校校历不可用时明确提示手动选周，不猜测开学日期。直连会话和验证码流程分别在本机最多保留 30 分钟、5 分钟（不代表学校保证的有效期）。按北京时间每天及返回前台重新计算本周，手动选周保持不变，可点“回到本周”。演示模式使用当前周周一作为明确标注的示例校历。
- 底部导航为“今天 / 课表 / 成绩 / 我的”（横屏使用侧栏）。“今天”是已有课表后的默认首页，按实际日期而非手动选中的周次展示当前课、下一课倒计时、当天其他课程、下一有课日预览及更新时间；支持缓存与演示。每分钟和回到前台更新时间，跨日自动刷新；缺少校历、课时不明或学期外均明确提示，不编造时间。
- 课程网格左右滑动切换一周，始终保留七列；也可使用周次下拉框。资源参考说明见 [WAKEUP-NOTES.md](WAKEUP-NOTES.md)。
- “记住学号和密码”使用 Android Keystore 支持的 EncryptedSharedPreferences。取消勾选立即删除；不备份应用数据。
- 仅学期总周数作为普通偏好保存（1–30，默认 20）。
- 所有构建均可在登录页选择“演示模式”；横幅明确标注示例数据，不发送学校查询请求。
- 不含选课、评教、Turnstile 与导出功能；直连只调用仓库已有的学校认证、课表、校历、成绩及排名查询端点，不进行学校业务写操作。

## 模拟器

```sh
sdkmanager 'emulator' 'system-images;android-35;google_apis;x86_64'
avdmanager create avd -n nanyee -k 'system-images;android-35;google_apis;x86_64' --device pixel_6
emulator -avd nanyee
```

未使用真实学生账号验证上游学校登录，演示模式不代表真实学校响应。

## 可选的真实账号只读集成测试

仅在本地环境同时设置 `NANYEE_LIVE_ACCOUNT` 和 `NANYEE_LIVE_PASSWORD` 后运行；缺少任一变量时 JUnit assume 跳过，不加载模型、不联网。不要将凭据写入命令行参数、Gradle 属性或文件。测试使用同一模型及预处理、JVM ONNX Runtime 和直连数据源，依次读取学期、当前学期前 20 周课表、校历和成绩；不执行选课或评教。登录可能影响其他设备的学校会话。学期外允许当前周为空，但校历、课表和成绩必须非空。

```sh
cd android
ANDROID_HOME=/home/ubuntu/android-sdk ./gradlew testDebugUnitTest --tests 'de.nanyee.app.DirectSchoolLiveIntegrationTest' --rerun-tasks --info --max-workers=2
```

`--rerun-tasks` 避免之前的跳过结果被当作最新结果；`--info` 显示测试的统计输出。只打印 OCR 次数、模型形状、学期/课程/成绩记录数，以及校历/当前周/汇总是否存在；失败时不附带上游内容。
