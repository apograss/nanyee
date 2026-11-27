# Nanyee

Nanyee 是一款面向本校学生的 Android 应用，集成课表、雨课堂、抢课和自动评课等功能。

**[下载 APK](https://nanyee.de/download)**（国内直连）· [GitHub Releases](https://github.com/apograss/nanyee/releases/latest) · 需要 Android 8.0 及以上

<p>
<img src="docs/screenshots/timetable.png" width="24%" />
<img src="docs/screenshots/classroom.png" width="24%" />
<img src="docs/screenshots/grab.png" width="24%" />
<img src="docs/screenshots/evaluation.png" width="24%" />
</p>

<sub>截图来自 App 内置的演示模式，所示数据均为虚构。</sub>

## 功能

**课表**：界面参考 WakeUp 设计，同一门课程使用统一配色，左右滑动切换周次。考试安排直接标注在课表中，点击即可查看网考号。

**雨课堂 PPT**：课件提前加载，可以翻看老师尚未放映的页面；课堂习题可在 App 内直接作答。

**抢课**：支持设置多个志愿并循环提交。登录 App 会使教务系统中已有的登录状态失效；如需保留，也可以在[网页版](https://nanyee.de/tools/enrollment)中使用 Cookie 登录。

**自动评课**：可选择每晚自动完成评课，也可以手动评课。自动评课需要将教务系统账号和密码加密上传至服务器。

此外还提供成绩与绩点查询、自习舱自动预约、学习通签到和课堂互动。

## 安装与更新

从 [nanyee.de/download](https://nanyee.de/download) 或 [GitHub Releases](https://github.com/apograss/nanyee/releases/latest) 下载 APK 安装。有新版本时 App 会推送通知，直接覆盖安装即可。

**为什么不上架应用商店？** 国内应用市场上架需要软件著作权和 ICP 备案，目前不具备条件；Google Play 和 App Store 的开发者费用（分别为 25 美元一次性和每年 99 美元）对个人项目来说也不划算。

## 隐私

学校账号密码、Cookie 和课表数据均加密保存在本机，App 直接与学校系统通信。只有在启用自动评课或自习舱预约时，账号才会加密存储到 nanyee.de，由服务器代为执行，可随时在「我的」页面中删除。

学习通和雨课堂签到使用设备的真实定位；所有答题内容都由用户本人填写并确认后才会提交。

本项目与学校无关，不是学校官方应用。

## 反馈

问题和建议请发送邮件至 [contact@nanyee.de](mailto:contact@nanyee.de)，或提交 [Issue](https://github.com/apograss/nanyee/issues)。如果觉得好用，可以在「我的 → 捐赠」中支持开发。

## 开发

`android/` 目录为 App 源码（Kotlin + Jetpack Compose），构建说明见 [android/README.md](android/README.md)。nanyee.de 的后端、网站和部署配置见 [docs/backend.md](docs/backend.md)。

App 以 [GPL-3.0](android/LICENSE) 协议开源。学习通和雨课堂模块移植自 [AneryCoft/course_helper](https://github.com/AneryCoft/course_helper)，感谢原作者。
