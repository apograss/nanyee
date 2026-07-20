"""
capture_token.py — mitmproxy 插件
自动捕获群报数小程序的 Authorization Token

用法: mitmdump -s capture_token.py -p 8899 --set confdir=./certs
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from mitmproxy import http, ctx

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captured_token.txt")
DONE_FLAG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".capture_done")

class TokenCapture:
    def __init__(self):
        self.captured = False
        self.token = None

    def request(self, flow: http.HTTPFlow):
        if self.captured:
            return

        host = flow.request.pretty_host
        # 匹配群报数API域名
        if "qun100.com" not in host:
            return

        auth = flow.request.headers.get("Authorization", "")
        if not auth or len(auth) < 20:
            return

        self.token = auth
        self.captured = True

        # 保存到文件
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(auth)

        # 写完成标志
        with open(DONE_FLAG, "w") as f:
            f.write("done")

        # 复制到剪贴板
        try:
            subprocess.run(["clip.exe"], input=auth.encode("utf-8"), check=True)
            ctx.log.info(f"[✅] Token已复制到剪贴板!")
        except Exception:
            ctx.log.info(f"[⚠️] 剪贴板复制失败，请手动复制")

        ctx.log.info(f"[✅] 捕获成功！Token: {auth[:30]}...")
        ctx.log.info(f"[✅] 已保存到: {TOKEN_FILE}")
        ctx.log.info(f"[✅] 现在可以关闭此窗口了")

        # 终止代理
        ctx.master.shutdown()

addons = [TokenCapture()]
