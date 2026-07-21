/**
 * Captcha OCR — browser-side recognition using ONNX Runtime Web
 *
 * Ported from legacy/smu-tools/src/lib/captcha-ocr.ts
 * Model: public/captcha_model.onnx (~770KB)
 * Splits 80x28 image into 4 columns (20x28), classifies each as 0-9.
 */
import * as ort from "onnxruntime-web";

const MODEL_URL = "/captcha_model.onnx";
const IMG_WIDTH = 80;
const IMG_HEIGHT = 28;

let session = null;
let initPromise = null;

async function ensureSession() {
  if (session) return session;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        ort.env.wasm.numThreads = 1;
        session = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ["wasm"],
        });
      } catch (err) {
        initPromise = null;
        throw err;
      }
    })();
  }
  await initPromise;
  if (!session) throw new Error("ONNX session not initialized");
  return session;
}

function imageToTensor(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = IMG_WIDTH;
        canvas.height = IMG_HEIGHT;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, IMG_WIDTH, IMG_HEIGHT);
        const imageData = ctx.getImageData(0, 0, IMG_WIDTH, IMG_HEIGHT);
        const d = imageData.data;
        const tensor = new Float32Array(IMG_HEIGHT * IMG_WIDTH);
        for (let y = 0; y < IMG_HEIGHT; y++) {
          for (let x = 0; x < IMG_WIDTH; x++) {
            const i = (y * IMG_WIDTH + x) * 4;
            tensor[y * IMG_WIDTH + x] =
              (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255.0;
          }
        }
        resolve(tensor);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

/**
 * Recognize captcha from a data URL (data:image/...;base64,...)
 * Returns { text, confidence } or null on failure.
 */
export async function recognizeCaptcha(dataUrl) {
  try {
    const sess = await ensureSession();
    const tensorData = await imageToTensor(dataUrl);
    const inputTensor = new ort.Tensor("float32", tensorData, [1, 1, IMG_HEIGHT, IMG_WIDTH]);
    const results = await sess.run({ image: inputTensor });
    const output = results.digits;
    const data = output.data;
    const digits = [];
    const confidences = [];
    for (let pos = 0; pos < 4; pos++) {
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let cls = 0; cls < 10; cls++) {
        const val = data[pos * 10 + cls];
        if (val > maxVal) { maxVal = val; maxIdx = cls; }
      }
      digits.push(String(maxIdx));
      let sumExp = 0;
      for (let cls = 0; cls < 10; cls++) {
        sumExp += Math.exp(data[pos * 10 + cls] - maxVal);
      }
      confidences.push((1 / sumExp) * 100);
    }
    const text = digits.join("");
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / 4;
    return { text, confidence: avgConfidence };
  } catch (err) {
    console.error("[ocr] Error:", err);
    return null;
  }
}

export async function terminateOCR() {
  session = null;
  initPromise = null;
}
