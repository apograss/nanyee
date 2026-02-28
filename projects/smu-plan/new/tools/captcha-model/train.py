"""
训练 SMU 验证码识别 CNN 模型

使用方法：
    python train.py [--epochs 50] [--batch-size 32] [--lr 0.001]

前提：
    captchas/labels.csv 中有标注数据 (至少 50 条)
    captchas/raw/ 中有对应图片

输出：
    captcha_model.pth     (PyTorch 权重)
    captcha_model.onnx    (ONNX 格式，供浏览器使用)
"""

import os
import csv
import random
import argparse
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

# ─── Configuration ─────────────────────────────────────────────

BASE_DIR = os.path.dirname(__file__)
CAPTCHA_DIR = os.path.join(BASE_DIR, "captchas", "raw")
LABEL_FILE = os.path.join(BASE_DIR, "captchas", "labels.csv")
MODEL_DIR = os.path.join(BASE_DIR, "model")

IMG_WIDTH = 80
IMG_HEIGHT = 28  # Captcha is 80x28
NUM_DIGITS = 4
NUM_CLASSES = 10  # 0-9


# ─── Dataset ───────────────────────────────────────────────────

class CaptchaDataset(Dataset):
    def __init__(self, data, augment=False):
        self.data = data
        self.augment = augment
        # Preload and preprocess all images
        self.images = []
        self.labels = []
        for filepath, label_str in data:
            img = Image.open(filepath).convert("RGB")
            img = img.resize((IMG_WIDTH, IMG_HEIGHT), Image.BILINEAR)
            arr = np.array(img, dtype=np.float32)

            # Luminance-based preprocessing: keep dark (digit) pixels, remove bright noise
            lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            # Normalize luminance to [0, 1], invert so digits are bright
            processed = 1.0 - (lum / 255.0)
            # Apply soft threshold: enhance contrast between digits and background
            processed = np.clip((processed - 0.3) * 2.5, 0, 1).astype(np.float32)

            self.images.append(processed)
            self.labels.append([int(c) for c in label_str])

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        arr = self.images[idx].copy()  # (H, W)

        if self.augment:
            # Brightness jitter
            arr = arr * random.uniform(0.7, 1.3)
            arr = np.clip(arr, 0, 1)
            # Gaussian noise
            noise = np.random.normal(0, 0.04, arr.shape).astype(np.float32)
            arr = np.clip(arr + noise, 0, 1)
            # Horizontal shift ±3px
            shift = random.randint(-3, 3)
            if shift != 0:
                arr = np.roll(arr, shift, axis=1)
                if shift > 0: arr[:, :shift] = 0.0
                else: arr[:, shift:] = 0.0
            # Vertical shift ±2px
            vshift = random.randint(-2, 2)
            if vshift != 0:
                arr = np.roll(arr, vshift, axis=0)
                if vshift > 0: arr[:vshift, :] = 0.0
                else: arr[vshift:, :] = 0.0

        tensor = torch.from_numpy(arr).unsqueeze(0)  # (1, H, W)
        labels = torch.tensor(self.labels[idx], dtype=torch.long)
        return tensor, labels


# ─── Model ─────────────────────────────────────────────────────

class CaptchaCNN(nn.Module):
    """
    CNN for 4-digit captcha recognition.
    Input: (batch, 1, 28, 80) preprocessed grayscale
    Output: (batch, 4, 10)
    """

    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            # Conv1: (1, 28, 80) → (64, 14, 40)
            nn.Conv2d(1, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            # Conv2: (64, 14, 40) → (128, 7, 20)
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),

            # Conv3: (128, 7, 20) → (256, 3, 10)
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )

        # After: 256 * 3 * 10 = 7680
        self.fc = nn.Sequential(
            nn.Linear(256 * 3 * 10, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),
            nn.Linear(512, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
        )

        self.digit_classifiers = nn.ModuleList([
            nn.Linear(256, NUM_CLASSES) for _ in range(NUM_DIGITS)
        ])

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        digits = [clf(x) for clf in self.digit_classifiers]
        return torch.stack(digits, dim=1)


# ─── Training ──────────────────────────────────────────────────

def load_data():
    """Load labeled captcha data."""
    if not os.path.exists(LABEL_FILE):
        raise FileNotFoundError(f"标注文件不存在: {LABEL_FILE}\n请先运行 label_captchas.py 标注数据")

    data = []
    with open(LABEL_FILE, "r", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) >= 2:
                fname, label = row[0], row[1]
                if len(label) == 4 and label.isdigit():
                    filepath = os.path.join(CAPTCHA_DIR, fname)
                    if os.path.exists(filepath):
                        data.append((filepath, label))

    if len(data) < 20:
        raise ValueError(f"标注数据太少 ({len(data)} 条)，至少需要 20 条")

    return data


def train(epochs: int, batch_size: int, lr: float):
    # Load and split data
    all_data = load_data()
    random.shuffle(all_data)

    split = max(1, int(len(all_data) * 0.85))
    train_data = all_data[:split]
    val_data = all_data[split:]

    print(f"数据: 总计 {len(all_data)} | 训练 {len(train_data)} | 验证 {len(val_data)}")

    train_loader = DataLoader(
        CaptchaDataset(train_data, augment=True),
        batch_size=batch_size, shuffle=True, num_workers=0,
    )
    val_loader = DataLoader(
        CaptchaDataset(val_data, augment=False),
        batch_size=batch_size, shuffle=False, num_workers=0,
    )

    # Model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"设备: {device}")

    model = CaptchaCNN().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=20, gamma=0.5)

    best_acc = 0.0
    os.makedirs(MODEL_DIR, exist_ok=True)

    for epoch in range(epochs):
        # Train
        model.train()
        train_loss = 0
        train_correct = 0
        train_total = 0

        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)

            outputs = model(images)  # (batch, 4, 10)
            loss = sum(
                criterion(outputs[:, i, :], labels[:, i])
                for i in range(NUM_DIGITS)
            )

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss += loss.item()

            # Accuracy: all 4 digits correct
            preds = outputs.argmax(dim=2)  # (batch, 4)
            train_correct += (preds == labels).all(dim=1).sum().item()
            train_total += labels.size(0)

        scheduler.step()

        # Validate
        model.eval()
        val_correct = 0
        val_total = 0
        digit_correct = [0] * NUM_DIGITS

        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                labels = labels.to(device)
                outputs = model(images)
                preds = outputs.argmax(dim=2)
                val_correct += (preds == labels).all(dim=1).sum().item()
                val_total += labels.size(0)
                for i in range(NUM_DIGITS):
                    digit_correct[i] += (preds[:, i] == labels[:, i]).sum().item()

        train_acc = train_correct / max(train_total, 1) * 100
        val_acc = val_correct / max(val_total, 1) * 100
        digit_accs = [d / max(val_total, 1) * 100 for d in digit_correct]

        print(
            f"Epoch [{epoch+1:3d}/{epochs}] "
            f"loss={train_loss/len(train_loader):.4f} "
            f"train_acc={train_acc:.1f}% "
            f"val_acc={val_acc:.1f}% "
            f"digits=[{', '.join(f'{a:.0f}%' for a in digit_accs)}]"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            pth_path = os.path.join(MODEL_DIR, "captcha_model.pth")
            torch.save(model.state_dict(), pth_path)
            print(f"  ✓ 最佳模型已保存 ({val_acc:.1f}%)")

    # Export ONNX
    print("\n导出 ONNX 模型...")
    model.load_state_dict(torch.load(os.path.join(MODEL_DIR, "captcha_model.pth"), map_location="cpu", weights_only=True))
    model.cpu().eval()

    dummy = torch.randn(1, 1, IMG_HEIGHT, IMG_WIDTH)
    onnx_path = os.path.join(MODEL_DIR, "captcha_model.onnx")

    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["image"],
        output_names=["digits"],
        dynamic_axes={"image": {0: "batch"}, "digits": {0: "batch"}},
        opset_version=13,
        dynamo=False,  # Use legacy exporter (no onnxscript needed)
    )

    # Check ONNX file size
    size_kb = os.path.getsize(onnx_path) / 1024
    print(f"✓ ONNX 模型已导出: {onnx_path} ({size_kb:.1f} KB)")
    print(f"✓ 最佳验证准确率: {best_acc:.1f}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="训练 SMU 验证码 CNN")
    parser.add_argument("--epochs", type=int, default=60, help="训练轮数 (默认 60)")
    parser.add_argument("--batch-size", type=int, default=32, help="批大小 (默认 32)")
    parser.add_argument("--lr", type=float, default=0.001, help="学习率 (默认 0.001)")
    args = parser.parse_args()
    train(args.epochs, args.batch_size, args.lr)
