/**
 * Server-side captcha OCR using ONNX Runtime (Node.js)
 *
 * Mirror of captcha-ocr.ts but for Node.js environment.
 * Uses sharp for image decoding instead of Canvas.
 */

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";

const IMG_WIDTH = 80;
const IMG_HEIGHT = 28;

let session: ort.InferenceSession | null = null;
let initPromise: Promise<void> | null = null;

function getModelPath(): string {
  // In production: public/ is served statically, model file is in .next/standalone or project root
  // Try multiple paths
  const candidates = [
    path.join(process.cwd(), "public", "captcha_model.onnx"),
    path.join(process.cwd(), ".next", "static", "captcha_model.onnx"),
  ];

  // Use the first path that exists (we don't check here, let ONNX throw if missing)
  return candidates[0];
}

async function ensureSession(): Promise<ort.InferenceSession> {
  if (session) return session;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const modelPath = getModelPath();
        console.log("[ocr-server] Loading ONNX model from:", modelPath);
        session = await ort.InferenceSession.create(modelPath);
        console.log("[ocr-server] ONNX model loaded");
      } catch (err) {
        console.error("[ocr-server] Failed to load ONNX model:", err);
        initPromise = null;
        throw err;
      }
    })();
  }

  await initPromise;
  if (!session) throw new Error("ONNX session not initialized");
  return session;
}

/**
 * Convert image buffer to model input tensor using sharp.
 * Output: Float32Array of luminance values (1 channel, 28x80)
 */
async function imageToTensor(imageBuffer: Buffer): Promise<Float32Array> {
  // Decode and resize to 80x28, extract raw RGB pixels
  const { data, info } = await sharp(imageBuffer)
    .resize(IMG_WIDTH, IMG_HEIGHT, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = new Float32Array(IMG_HEIGHT * IMG_WIDTH);

  for (let y = 0; y < IMG_HEIGHT; y++) {
    for (let x = 0; x < IMG_WIDTH; x++) {
      const i = (y * IMG_WIDTH + x) * 3; // RGB
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255.0;
      tensor[y * IMG_WIDTH + x] = lum;
    }
  }

  return tensor;
}

/**
 * Recognize captcha from raw image buffer (PNG/JPEG).
 * Returns 4-digit string or null on failure.
 */
export async function recognizeCaptchaServer(
  imageBuffer: Buffer,
): Promise<{ text: string; confidence: number } | null> {
  try {
    const sess = await ensureSession();

    const tensorData = await imageToTensor(imageBuffer);
    const inputTensor = new ort.Tensor("float32", tensorData, [1, 1, IMG_HEIGHT, IMG_WIDTH]);

    const results = await sess.run({ image: inputTensor });
    const output = results.digits;
    const data = output.data as Float32Array;

    const digits: string[] = [];
    const confidences: number[] = [];

    for (let pos = 0; pos < 4; pos++) {
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let cls = 0; cls < 10; cls++) {
        const val = data[pos * 10 + cls];
        if (val > maxVal) {
          maxVal = val;
          maxIdx = cls;
        }
      }
      digits.push(String(maxIdx));

      let sumExp = 0;
      for (let cls = 0; cls < 10; cls++) {
        sumExp += Math.exp(data[pos * 10 + cls] - maxVal);
      }
      confidences.push(1 / sumExp * 100);
    }

    const text = digits.join("");
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / 4;

    console.log(
      `[ocr-server] Result: ${text} (confidence: ${confidences.map((c) => c.toFixed(0) + "%").join(", ")}, avg: ${avgConfidence.toFixed(0)}%)`,
    );

    return { text, confidence: avgConfidence };
  } catch (err) {
    console.error("[ocr-server] Error:", err);
    return null;
  }
}
