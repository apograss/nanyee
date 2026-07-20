# Token 获取工具

一键获取群报数 Authorization Token，无需手动抓包。

## 📦 文件说明

| 文件 | 说明 |
|------|------|
| `setup.bat` | 首次使用运行，安装 mitmproxy + CA证书 |
| `get_token.bat` | 一键获取 Token（双击运行） |
| `capture_token.py` | mitmproxy 插件（自动调用，无需手动操作） |

## 🚀 使用步骤

### 首次使用
1. 确保已安装 **Python 3.8+**（[下载](https://www.python.org/downloads/)）
2. 双击运行 `setup.bat`（安装mitmproxy和证书）
3. 安装完成后运行 `get_token.bat`

### 日常使用
1. 双击 `get_token.bat`
2. 打开 PC 微信 → 群报数小程序 → 点击任意活动
3. 窗口提示「捕获成功」后，Token 已在剪贴板
4. 粘贴到 daka.nanyee.de 设置页

## ⚠️ 注意事项
- 需要 **PC端微信**（非手机）
- 首次运行需要安装CA证书（setup.bat会自动处理）
- Token 有效期约 7 天，过期后重新运行即可
- 运行时会临时修改系统代理，完成后自动还原
