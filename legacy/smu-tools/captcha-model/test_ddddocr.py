"""Quick test: ddddocr accuracy on labeled captchas"""
import ddddocr, csv, os

BASE = os.path.dirname(__file__)
ocr = ddddocr.DdddOcr(show_ad=False)
correct = 0
total = 0

with open(os.path.join(BASE, "captchas", "labels.csv")) as f:
    for row in csv.reader(f):
        if len(row) < 2:
            continue
        fname, label = row
        path = os.path.join(BASE, "captchas", "raw", fname)
        if not os.path.exists(path):
            continue
        with open(path, "rb") as img:
            result = ocr.classification(img.read())
        total += 1
        match = "OK" if result == label else "WRONG"
        if result == label:
            correct += 1
        if total <= 15:
            print(f"{fname}: pred={result} truth={label} {match}")

print(f"\nTotal: {total}, Correct: {correct}, Accuracy: {correct/total*100:.1f}%")
