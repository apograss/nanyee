"""群报数 Token 获取工具的安装与启动入口，仅支持 Windows。"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import os
import shutil
import subprocess
import sys
import sysconfig
import time
import winreg
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent
DONE_FILE = ROOT / ".capture_done"
CAPTURE_ADDON = ROOT / "capture_token.py"
INTERNET_SETTINGS = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
INTERNET_OPTION_SETTINGS_CHANGED = 39
INTERNET_OPTION_REFRESH = 37


class RegistryValue(NamedTuple):
    exists: bool
    value: object | None
    value_type: int | None


def find_mitmdump() -> Path:
    executable = shutil.which("mitmdump")
    if executable:
        return Path(executable)

    scripts_dir = Path(sysconfig.get_path("scripts"))
    candidate = scripts_dir / ("mitmdump.exe" if os.name == "nt" else "mitmdump")
    if candidate.is_file():
        return candidate

    raise RuntimeError("未找到 mitmdump，请先运行 setup.bat。")


def notify_proxy_change() -> None:
    wininet = ctypes.windll.Wininet
    wininet.InternetSetOptionW(None, INTERNET_OPTION_SETTINGS_CHANGED, None, 0)
    wininet.InternetSetOptionW(None, INTERNET_OPTION_REFRESH, None, 0)


def read_registry_value(key: winreg.HKEYType, name: str) -> RegistryValue:
    try:
        value, value_type = winreg.QueryValueEx(key, name)
        return RegistryValue(True, value, value_type)
    except FileNotFoundError:
        return RegistryValue(False, None, None)


def restore_registry_value(key: winreg.HKEYType, name: str, saved: RegistryValue) -> None:
    if saved.exists:
        assert saved.value_type is not None
        winreg.SetValueEx(key, name, 0, saved.value_type, saved.value)
        return
    with contextlib.suppress(FileNotFoundError):
        winreg.DeleteValue(key, name)


def setup_certificate() -> int:
    mitmdump = find_mitmdump()
    certificate = Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.cer"
    process: subprocess.Popen[bytes] | None = None

    if not certificate.is_file():
        print("正在生成 mitmproxy 根证书……")
        process = subprocess.Popen(  # noqa: S603 - 路径由 PATH 或当前 Python Scripts 目录解析。
            [str(mitmdump), "--listen-host", "127.0.0.1", "--listen-port", "18888", "-q"],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        try:
            for _ in range(50):
                if certificate.is_file():
                    break
                if process.poll() is not None:
                    break
                time.sleep(0.1)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()

    if not certificate.is_file():
        print("[错误] 未能生成 mitmproxy 根证书。", file=sys.stderr)
        return 1

    certutil = Path(os.environ.get("SYSTEMROOT", r"C:\Windows")) / "System32" / "certutil.exe"
    result = subprocess.run(  # noqa: S603 - 固定调用 Windows 系统组件。
        [str(certutil), "-addstore", "-user", "root", str(certificate)],
        check=False,
    )
    if result.returncode != 0:
        print("[错误] 根证书安装失败。", file=sys.stderr)
        return result.returncode

    print("根证书已安装到当前 Windows 用户的受信任根证书存储。")
    return 0


def capture_token() -> int:
    mitmdump = find_mitmdump()
    DONE_FILE.unlink(missing_ok=True)

    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        INTERNET_SETTINGS,
        0,
        winreg.KEY_QUERY_VALUE | winreg.KEY_SET_VALUE,
    ) as key:
        saved_enable = read_registry_value(key, "ProxyEnable")
        saved_server = read_registry_value(key, "ProxyServer")
        process: subprocess.Popen[bytes] | None = None

        try:
            process = subprocess.Popen(  # noqa: S603 - 路径由 PATH 或当前 Python Scripts 目录解析。
                [
                    str(mitmdump),
                    "-s",
                    str(CAPTURE_ADDON),
                    "--listen-host",
                    "127.0.0.1",
                    "--listen-port",
                    "8899",
                    "--ssl-insecure",
                    "--set",
                    "connection_strategy=lazy",
                    "-q",
                ],
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            time.sleep(0.8)
            if process.poll() is not None:
                print("[错误] 代理启动失败，端口 8899 可能已被占用。", file=sys.stderr)
                return 1

            winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, "127.0.0.1:8899")
            notify_proxy_change()

            print("系统代理已临时开启。")
            print("请打开 PC 微信中的群报数小程序并进入任意表单。")
            print("成功后 Token 会自动复制到剪贴板；按 Ctrl+C 可取消。")
            while process.poll() is None and not DONE_FILE.is_file():
                time.sleep(0.2)

            if DONE_FILE.is_file():
                print("\n获取成功：Token 已复制到剪贴板，可直接粘贴到网站。")
                return 0

            print("[错误] 抓取进程提前退出，请重新运行。", file=sys.stderr)
            return 1
        except KeyboardInterrupt:
            print("\n已取消获取。")
            return 130
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
            restore_registry_value(key, "ProxyEnable", saved_enable)
            restore_registry_value(key, "ProxyServer", saved_server)
            notify_proxy_change()
            DONE_FILE.unlink(missing_ok=True)
            print("系统代理已恢复。")


def main() -> int:
    parser = argparse.ArgumentParser(description="群报数 Token 获取工具")
    parser.add_argument("command", choices=("setup", "capture"))
    args = parser.parse_args()

    try:
        if args.command == "setup":
            return setup_certificate()
        return capture_token()
    except (OSError, RuntimeError) as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
