"""
批量采集 SMU 验证码图片

使用方法：
    python collect_captchas.py [--count 200] [--delay 0.5]

图片保存到 ./captchas/raw/ 目录
"""

import os
import sys
import time
import argparse
import requests

UIS_BASE = "https://uis.smu.edu.cn"
SAVE_DIR = os.path.join(os.path.dirname(__file__), "captchas", "raw")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": f"{UIS_BASE}/login.jsp",
}


def collect(count: int, delay: float):
    os.makedirs(SAVE_DIR, exist_ok=True)

    # Find starting index
    existing = [f for f in os.listdir(SAVE_DIR) if f.endswith(".jpg")]
    start_idx = len(existing) + 1

    print(f"采集 {count} 张验证码到 {SAVE_DIR}")
    print(f"已有 {len(existing)} 张，从 {start_idx:04d} 开始")
    print(f"每张间隔 {delay}s")
    print()

    session = requests.Session()
    success = 0
    fail = 0

    for i in range(count):
        idx = start_idx + i
        try:
            res = session.get(
                f"{UIS_BASE}/imageServlet.do",
                headers=HEADERS,
                timeout=10,
            )
            if res.status_code == 200 and len(res.content) > 100:
                path = os.path.join(SAVE_DIR, f"captcha_{idx:04d}.jpg")
                with open(path, "wb") as f:
                    f.write(res.content)
                success += 1
                print(f"\r[{success}/{count}] 已下载 captcha_{idx:04d}.jpg ({len(res.content)} bytes)", end="")
            else:
                fail += 1
                print(f"\r[{success}/{count}] 跳过 (status={res.status_code}, size={len(res.content)})", end="")
        except Exception as e:
            fail += 1
            print(f"\r[{success}/{count}] 错误: {e}", end="")

        if i < count - 1:
            time.sleep(delay)

    print(f"\n\n完成！成功 {success} 张，失败 {fail} 张")
    print(f"图片保存在: {SAVE_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="批量采集 SMU 验证码")
    parser.add_argument("--count", type=int, default=200, help="采集数量 (默认 200)")
    parser.add_argument("--delay", type=float, default=0.5, help="请求间隔秒数 (默认 0.5)")
    args = parser.parse_args()
    collect(args.count, args.delay)
