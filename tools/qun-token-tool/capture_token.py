"""mitmproxy addon：从群报数请求中读取 Authorization 并复制到剪贴板。"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from mitmproxy import ctx, http

DONE_FILE = Path(__file__).with_name(".capture_done")


def _is_qun100_host(host: str) -> bool:
    normalized = host.lower().rstrip(".")
    return normalized == "qun100.com" or normalized.endswith(".qun100.com")


def request(flow: http.HTTPFlow) -> None:
    if not _is_qun100_host(flow.request.pretty_host):
        return

    authorization = flow.request.headers.get("Authorization", "").strip()
    if len(authorization) < 60:
        return

    try:
        clip_executable = (
            Path(os.environ.get("SYSTEMROOT", r"C:\Windows")) / "System32" / "clip.exe"
        )
        subprocess.run(  # noqa: S603 - 固定调用 Windows 系统组件，不接受用户输入路径。
            [str(clip_executable)],
            input=authorization,
            text=True,
            check=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        DONE_FILE.write_text("copied\n", encoding="utf-8")
        ctx.log.info("已获取群报数 Token，并复制到剪贴板。")
        ctx.master.shutdown()
    except (OSError, subprocess.SubprocessError) as exc:
        ctx.log.error(f"复制 Token 到剪贴板失败：{exc}")
