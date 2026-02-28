"""
验证码人工标注工具

使用方法：
    python label_captchas.py

功能：
- 依次显示 captchas/raw/ 中未标注的图片
- 用户输入 4 位数字标注
- 输入 's' 跳过，'q' 退出，'b' 返回上一张
- 标注结果保存到 captchas/labels.csv
"""

import os
import csv
import sys

CAPTCHA_DIR = os.path.join(os.path.dirname(__file__), "captchas", "raw")
LABEL_FILE = os.path.join(os.path.dirname(__file__), "captchas", "labels.csv")


def load_existing_labels():
    """加载已标注数据"""
    labels = {}
    if os.path.exists(LABEL_FILE):
        with open(LABEL_FILE, "r", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2:
                    labels[row[0]] = row[1]
    return labels


def save_labels(labels):
    """保存标注数据"""
    os.makedirs(os.path.dirname(LABEL_FILE), exist_ok=True)
    with open(LABEL_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        for fname, label in sorted(labels.items()):
            writer.writerow([fname, label])


def open_image(path):
    """用系统默认程序打开图片"""
    if sys.platform == "win32":
        os.startfile(path)
    elif sys.platform == "darwin":
        os.system(f'open "{path}"')
    else:
        os.system(f'xdg-open "{path}"')


def label_captchas():
    if not os.path.exists(CAPTCHA_DIR):
        print(f"错误: 找不到验证码目录 {CAPTCHA_DIR}")
        print("请先运行 collect_captchas.py 采集验证码")
        return

    # Get all captcha files
    files = sorted([f for f in os.listdir(CAPTCHA_DIR) if f.endswith(".jpg")])
    if not files:
        print("没有找到验证码图片")
        return

    labels = load_existing_labels()
    unlabeled = [f for f in files if f not in labels]

    print(f"共 {len(files)} 张验证码, 已标注 {len(labels)} 张, 未标注 {len(unlabeled)} 张")
    print()
    print("操作说明:")
    print("  输入 4 位数字 → 标注当前图片")
    print("  s → 跳过")
    print("  b → 返回上一张")
    print("  q → 保存并退出")
    print()

    # Use matplotlib if available, otherwise open with system viewer
    try:
        import matplotlib.pyplot as plt
        import matplotlib.image as mpimg
        use_plt = True
        plt.ion()
        fig, ax = plt.subplots(1, 1, figsize=(4, 2))
    except ImportError:
        use_plt = False
        print("(未安装 matplotlib，将使用系统默认图片查看器)")

    idx = 0
    to_label = unlabeled.copy()
    labeled_count = 0

    while idx < len(to_label):
        fname = to_label[idx]
        img_path = os.path.join(CAPTCHA_DIR, fname)

        if use_plt:
            ax.clear()
            img = mpimg.imread(img_path)
            ax.imshow(img)
            ax.set_title(f"[{idx + 1}/{len(to_label)}] {fname}")
            ax.axis("off")
            fig.canvas.draw()
            fig.canvas.flush_events()
            plt.pause(0.1)
        else:
            open_image(img_path)

        prompt = f"[{idx + 1}/{len(to_label)}] {fname} → "
        user_input = input(prompt).strip().lower()

        if user_input == "q":
            break
        elif user_input == "s":
            idx += 1
            continue
        elif user_input == "b":
            if idx > 0:
                idx -= 1
            continue
        elif len(user_input) == 4 and user_input.isdigit():
            labels[fname] = user_input
            labeled_count += 1
            idx += 1
            # Save periodically
            if labeled_count % 10 == 0:
                save_labels(labels)
                print(f"  (已自动保存 {len(labels)} 条标注)")
        else:
            print("  无效输入，请输入 4 位数字、s/b/q")

    save_labels(labels)
    if use_plt:
        plt.close()

    print(f"\n标注完成！本次标注 {labeled_count} 张")
    print(f"总计 {len(labels)} 条标注保存在: {LABEL_FILE}")


if __name__ == "__main__":
    label_captchas()
