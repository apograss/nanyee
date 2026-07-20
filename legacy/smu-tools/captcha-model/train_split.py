"""
训练 SMU 验证码识别模型 — 按列分割方式

将 80x28 验证码切成 4 个 20x28 的列，每列包含一个数字。
这样 200 张图 = 800 个训练样本，每位数字一个 10 分类器。

使用方法：
    python train_split.py [--epochs 100] [--batch-size 64] [--lr 0.001]
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

BASE_DIR = os.path.dirname(__file__)
CAPTCHA_DIR = os.path.join(BASE_DIR, "captchas", "raw")
LABEL_FILE = os.path.join(BASE_DIR, "captchas", "labels.csv")
MODEL_DIR = os.path.join(BASE_DIR, "model")

IMG_WIDTH = 80
IMG_HEIGHT = 28
COL_WIDTH = IMG_WIDTH // 4   # 20px per digit
NUM_CLASSES = 10


class DigitDataset(Dataset):
    """Each sample is one digit column (20x28) with its label."""

    def __init__(self, data, augment=False):
        self.samples = []  # list of (arr, digit_label)
        self.augment = augment

        for filepath, label_str in data:
            img = Image.open(filepath).convert("RGB")
            img = img.resize((IMG_WIDTH, IMG_HEIGHT), Image.BILINEAR)
            arr = np.array(img, dtype=np.float32)

            # Luminance: dark digits → low values
            lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            lum = lum / 255.0  # normalize to [0, 1]

            # Split into 4 columns
            for i in range(4):
                col = lum[:, i * COL_WIDTH: (i + 1) * COL_WIDTH].copy()
                digit = int(label_str[i])
                self.samples.append((col, digit))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        arr, label = self.samples[idx]
        arr = arr.copy()

        if self.augment:
            # Brightness
            arr = arr * random.uniform(0.7, 1.3)
            arr = np.clip(arr, 0, 1)
            # Noise
            noise = np.random.normal(0, 0.03, arr.shape).astype(np.float32)
            arr = np.clip(arr + noise, 0, 1)
            # Horizontal shift ±2px
            shift = random.randint(-2, 2)
            if shift != 0:
                arr = np.roll(arr, shift, axis=1)
                if shift > 0: arr[:, :shift] = arr.mean()
                else: arr[:, shift:] = arr.mean()
            # Vertical shift ±1px
            vshift = random.randint(-1, 1)
            if vshift != 0:
                arr = np.roll(arr, vshift, axis=0)
                if vshift > 0: arr[:vshift, :] = arr.mean()
                else: arr[vshift:, :] = arr.mean()

        tensor = torch.from_numpy(arr).unsqueeze(0)  # (1, 28, 20)
        return tensor, label


class DigitCNN(nn.Module):
    """Simple CNN for single digit (20x28 column)."""

    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            # (1, 28, 20) → (32, 14, 10)
            nn.Conv2d(1, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(True),
            nn.MaxPool2d(2),
            # (32, 14, 10) → (64, 7, 5)
            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(True),
            nn.MaxPool2d(2),
            # (64, 7, 5) → (128, 3, 2)
            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(True),
            nn.MaxPool2d(2),
        )
        # 128 * 3 * 2 = 768
        self.classifier = nn.Sequential(
            nn.Linear(768, 128),
            nn.ReLU(True),
            nn.Dropout(0.3),
            nn.Linear(128, NUM_CLASSES),
        )

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        return self.classifier(x)


class FullCaptchaCNN(nn.Module):
    """Wrapper that applies DigitCNN to all 4 columns. For ONNX export."""

    def __init__(self, digit_model):
        super().__init__()
        self.digit_model = digit_model

    def forward(self, x):
        # x: (batch, 1, 28, 80)
        cols = []
        for i in range(4):
            col = x[:, :, :, i * COL_WIDTH: (i + 1) * COL_WIDTH]
            cols.append(self.digit_model(col))  # (batch, 10)
        return torch.stack(cols, dim=1)  # (batch, 4, 10)


def load_data():
    data = []
    with open(LABEL_FILE, "r", newline="") as f:
        for row in csv.reader(f):
            if len(row) >= 2:
                fname, label = row[0], row[1]
                if len(label) == 4 and label.isdigit():
                    path = os.path.join(CAPTCHA_DIR, fname)
                    if os.path.exists(path):
                        data.append((path, label))
    return data


def train(epochs, batch_size, lr):
    all_data = load_data()
    random.shuffle(all_data)
    split = max(1, int(len(all_data) * 0.85))
    train_data, val_data = all_data[:split], all_data[split:]

    print(f"数据: {len(all_data)} 张图 → {len(all_data)*4} 个数字样本")
    print(f"训练: {len(train_data)*4} | 验证: {len(val_data)*4}")

    train_ds = DigitDataset(train_data, augment=True)
    val_ds = DigitDataset(val_data, augment=False)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"设备: {device}")

    model = DigitCNN().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_acc = 0.0
    os.makedirs(MODEL_DIR, exist_ok=True)

    for epoch in range(epochs):
        model.train()
        train_loss = 0
        train_correct = 0
        train_total = 0

        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            train_correct += (outputs.argmax(1) == labels).sum().item()
            train_total += labels.size(0)

        scheduler.step()

        # Validate — check both per-digit and full-captcha accuracy
        model.eval()
        val_correct = 0
        val_total = 0
        # Also check full captcha accuracy on val set
        captcha_correct = 0
        captcha_total = len(val_data)

        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device)
                labels = labels.to(device)
                outputs = model(images)
                val_correct += (outputs.argmax(1) == labels).sum().item()
                val_total += labels.size(0)

            # Full captcha accuracy
            for filepath, label_str in val_data:
                img = Image.open(filepath).convert("RGB")
                img = img.resize((IMG_WIDTH, IMG_HEIGHT), Image.BILINEAR)
                arr = np.array(img, dtype=np.float32)
                lum = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0

                pred_digits = []
                for i in range(4):
                    col = lum[:, i * COL_WIDTH: (i + 1) * COL_WIDTH]
                    t = torch.from_numpy(col).unsqueeze(0).unsqueeze(0).to(device)
                    pred_digits.append(str(model(t).argmax(1).item()))
                pred = "".join(pred_digits)
                if pred == label_str:
                    captcha_correct += 1

        train_acc = train_correct / max(train_total, 1) * 100
        val_digit_acc = val_correct / max(val_total, 1) * 100
        val_captcha_acc = captcha_correct / max(captcha_total, 1) * 100

        if (epoch + 1) % 5 == 0 or val_captcha_acc > best_acc:
            print(
                f"Epoch [{epoch+1:3d}/{epochs}] "
                f"loss={train_loss/len(train_loader):.4f} "
                f"train={train_acc:.1f}% "
                f"val_digit={val_digit_acc:.1f}% "
                f"val_captcha={val_captcha_acc:.1f}%"
            )

        if val_captcha_acc > best_acc:
            best_acc = val_captcha_acc
            torch.save(model.state_dict(), os.path.join(MODEL_DIR, "digit_model.pth"))
            print(f"  ✓ 最佳模型 ({val_captcha_acc:.1f}%)")

    # Export ONNX — wrap as full captcha model
    print("\n导出 ONNX...")
    model.load_state_dict(torch.load(os.path.join(MODEL_DIR, "digit_model.pth"), map_location="cpu", weights_only=True))
    model.cpu().eval()

    full_model = FullCaptchaCNN(model)
    full_model.eval()

    dummy = torch.randn(1, 1, IMG_HEIGHT, IMG_WIDTH)
    onnx_path = os.path.join(MODEL_DIR, "captcha_model.onnx")
    torch.onnx.export(
        full_model, dummy, onnx_path,
        input_names=["image"], output_names=["digits"],
        dynamic_axes={"image": {0: "batch"}, "digits": {0: "batch"}},
        opset_version=13, dynamo=False,
    )

    size_kb = os.path.getsize(onnx_path) / 1024
    print(f"✓ ONNX: {onnx_path} ({size_kb:.1f} KB)")
    print(f"✓ 最佳验证准确率: {best_acc:.1f}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=0.001)
    args = parser.parse_args()
    train(args.epochs, args.batch_size, args.lr)
