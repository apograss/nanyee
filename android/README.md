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

- API：`https://nanyee.de/api/v1`；无需平台账号即可进行学校登录。
- 验证码手工输入，点击图片刷新；失败后重新获取一次性流程。
- 学校会话、Cookie、验证码、成绩仅在内存中保存。成功加载的课表、学期列表与更新时间使用独立的 EncryptedSharedPreferences 加密保存；重启直接查看本机课表，不代表已经登录。已加载过的学期可离线切换，未缓存的学期、刷新和成绩需要重新登录。
- 我的 → “退出并清除本机课表”会删除课表缓存，不删除已选择记住的凭据。会话过期时仍可查看缓存；加密存储损坏时会提示重新登录，不会阻止启动。
- 课表优先读取服务端学期开始日期 / 当前周元数据。当前课表接口未暴露校历，因此缺少元数据时读取已有 `/smu/timetable.wakeup` 导出的 `startDate`（不调用分享接口、不上传至 WakeUp），仅保存日期；学校校历不可用时明确提示手动选周，不猜测开学日期。按北京时间每天及返回前台重新计算本周，手动选周保持不变，可点“回到本周”。演示模式使用明确标注的示例校历。
- 课程网格左右滑动切换一周，始终保留七列；也可使用周次下拉框。资源参考说明见 [WAKEUP-NOTES.md](WAKEUP-NOTES.md)。
- “记住学号和密码”使用 Android Keystore 支持的 EncryptedSharedPreferences。取消勾选立即删除；不备份应用数据。
- 仅学期总周数作为普通偏好保存（1–30，默认 20）。
- 所有构建均可在登录页选择“演示模式”；横幅明确标注示例数据，不发送学校查询请求。
- MVP 不含 OCR、Turnstile、成绩筛选与导出。遇到人机验证提示时请稍后重试或使用网站。

## 模拟器

```sh
sdkmanager 'emulator' 'system-images;android-35;google_apis;x86_64'
avdmanager create avd -n nanyee -k 'system-images;android-35;google_apis;x86_64' --device pixel_6
emulator -avd nanyee
```

未使用真实学生账号验证上游学校登录，演示模式不代表真实学校响应。
