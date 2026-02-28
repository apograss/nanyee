"""
使用 ddddocr 自动标注验证码，并生成可视化 HTML 供人工抽检

使用方法：
    python auto_label.py

输出：
    - captchas/labels.csv   标注结果
    - captchas/review.html  可视化抽检页面（浏览器打开即可查看）
"""

import os
import csv
import base64
import time
import warnings

# Fix PIL compatibility for older ddddocr
from PIL import Image
if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.LANCZOS

warnings.filterwarnings("ignore")  # suppress onnxruntime shape warnings
import ddddocr

CAPTCHA_DIR = os.path.join(os.path.dirname(__file__), "captchas", "raw")
LABEL_FILE = os.path.join(os.path.dirname(__file__), "captchas", "labels.csv")
REVIEW_HTML = os.path.join(os.path.dirname(__file__), "captchas", "review.html")


def load_existing_labels():
    """加载已有标注"""
    labels = {}
    if os.path.exists(LABEL_FILE):
        with open(LABEL_FILE, "r", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2:
                    labels[row[0]] = row[1]
    return labels


def save_labels(labels):
    """保存标注到 CSV"""
    os.makedirs(os.path.dirname(LABEL_FILE), exist_ok=True)
    with open(LABEL_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        for fname, label in sorted(labels.items()):
            writer.writerow([fname, label])


def generate_review_html(labels):
    """生成可视化 HTML 页面，方便人工抽检"""
    html_parts = [
        """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>验证码标注抽检</title>
<style>
body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
h1 { color: #333; }
.stats { background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.card { background: #fff; border-radius: 8px; padding: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s; }
.card:hover { transform: scale(1.05); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
.card img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
.label { font-size: 24px; font-weight: bold; color: #1a73e8; margin-top: 8px; letter-spacing: 4px; }
.fname { font-size: 11px; color: #888; margin-top: 4px; }
.card.error { border: 3px solid #e74c3c; }
</style>
</head>
<body>
<h1>🔍 验证码标注结果抽检</h1>
<div class="stats">
"""
    ]

    total = len(labels)
    # Count digits distribution
    digit_counts = {}
    non4digit = 0
    for label in labels.values():
        if len(label) == 4 and label.isdigit():
            for c in label:
                digit_counts[c] = digit_counts.get(c, 0) + 1
        else:
            non4digit += 1

    html_parts.append(f"<p>📊 总计 <strong>{total}</strong> 张标注</p>")
    if non4digit > 0:
        html_parts.append(
            f'<p style="color:red">⚠️ {non4digit} 张识别结果不是4位数字，可能需要人工修正</p>'
        )
    html_parts.append("<p>各数字出现次数: ")
    for d in sorted(digit_counts.keys()):
        html_parts.append(f"<strong>{d}</strong>:{digit_counts[d]}  ")
    html_parts.append("</p></div>\n<div class='grid'>\n")

    for fname in sorted(labels.keys()):
        label = labels[fname]
        img_path = os.path.join(CAPTCHA_DIR, fname)
        if not os.path.exists(img_path):
            continue

        # Embed image as base64
        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        is_error = not (len(label) == 4 and label.isdigit())
        card_class = "card error" if is_error else "card"

        html_parts.append(f"""<div class="{card_class}">
  <img src="data:image/jpeg;base64,{b64}" alt="{fname}">
  <div class="label">{label}</div>
  <div class="fname">{fname}</div>
</div>
""")

    html_parts.append("</div>\n</body>\n</html>")

    with open(REVIEW_HTML, "w", encoding="utf-8") as f:
        f.write("".join(html_parts))

    return REVIEW_HTML


def main():
    if not os.path.exists(CAPTCHA_DIR):
        print(f"错误: 找不到验证码目录 {CAPTCHA_DIR}")
        return

    files = sorted([f for f in os.listdir(CAPTCHA_DIR) if f.endswith(".jpg")])
    if not files:
        print("没有找到验证码图片")
        return

    existing = load_existing_labels()
    to_label = [f for f in files if f not in existing]

    print(f"共 {len(files)} 张验证码")
    print(f"已标注 {len(existing)} 张, 待标注 {len(to_label)} 张")
    print()

    if not to_label:
        print("所有图片已标注完成！")
        print("正在生成抽检页面...")
        html_path = generate_review_html(existing)
        print(f"抽检页面: {html_path}")
        return

    # 初始化 ddddocr
    print("正在初始化 ddddocr ...")
    ocr = ddddocr.DdddOcr()
    print("初始化完成！开始标注...\n")

    labels = dict(existing)
    success = 0
    fail = 0
    start_time = time.time()

    for idx, fname in enumerate(to_label, 1):
        img_path = os.path.join(CAPTCHA_DIR, fname)
        try:
            with open(img_path, "rb") as f:
                img_bytes = f.read()
            result = ocr.classification(img_bytes)

            # 清理结果：只保留数字
            clean = "".join(c for c in result if c.isdigit())

            labels[fname] = clean
            is_ok = len(clean) == 4
            status = "✓" if is_ok else "⚠"
            if is_ok:
                success += 1
            else:
                fail += 1

            # 进度显示
            if idx % 10 == 0 or idx == len(to_label):
                elapsed = time.time() - start_time
                speed = idx / elapsed if elapsed > 0 else 0
                print(
                    f"  [{idx:3d}/{len(to_label)}] {status} {fname} → {clean:6s}"
                    f"  ({speed:.1f} 张/秒)"
                )

            # 每 50 张保存一次
            if idx % 50 == 0:
                save_labels(labels)

        except Exception as e:
            print(f"  [{idx:3d}/{len(to_label)}] ✗ {fname} 识别失败: {e}")
            fail += 1

    # 最终保存
    save_labels(labels)
    elapsed = time.time() - start_time

    print(f"\n{'='*50}")
    print(f"标注完成！")
    print(f"  总计: {len(to_label)} 张")
    print(f"  成功 (4位数字): {success} 张")
    print(f"  异常 (非4位): {fail} 张")
    print(f"  耗时: {elapsed:.1f} 秒")
    print(f"  标注保存在: {LABEL_FILE}")

    # 生成抽检 HTML
    print(f"\n正在生成抽检页面...")
    html_path = generate_review_html(labels)
    print(f"抽检页面已生成: {html_path}")
    print("请在浏览器中打开查看，确认标注是否正确！")


if __name__ == "__main__":
    main()
