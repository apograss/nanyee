/**
 * Captcha OCR — browser-side recognition using ONNX Runtime Web
 *
 * Uses a CNN model trained on SMU captchas (4 colored digits with noise).
 * The model splits the 80x28 image into 4 columns (20x28 each) and
 * classifies each column as a digit 0-9.
 *
 * Model: public/captcha_model.onnx (~770KB)
 * Inference time: ~10-30ms (vs ~500ms+ for Tesseract.js)
 * Accuracy: ~67% per captcha (with 3 retries → ~96% success rate)
 */

import * as ort from "onnxruntime-web";

const MODEL_URL = "/captcha_model.onnx";
const IMG_WIDTH = 80;
const IMG_HEIGHT = 28;

let session: ort.InferenceSession | null = null;
let initPromise: Promise<void> | null = null;

async function ensureSession(): Promise<ort.InferenceSession> {
    if (session) return session;

    if (!initPromise) {
        initPromise = (async () => {
            try {
                console.log("[ocr] Loading ONNX model...");
                // Use WASM backend (works everywhere, no GPU needed)
                ort.env.wasm.numThreads = 1;
                session = await ort.InferenceSession.create(MODEL_URL, {
                    executionProviders: ["wasm"],
                });
                console.log("[ocr] ONNX model loaded ✓");
            } catch (err) {
                console.error("[ocr] Failed to load ONNX model:", err);
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
 * Convert base64 captcha image to model input tensor.
 * Extracts luminance channel: (1, 1, 28, 80) float32
 */
function imageToTensor(imageBase64: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = IMG_WIDTH;
                canvas.height = IMG_HEIGHT;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0, IMG_WIDTH, IMG_HEIGHT);

                const imageData = ctx.getImageData(0, 0, IMG_WIDTH, IMG_HEIGHT);
                const d = imageData.data;

                // Convert to luminance: same as training preprocessing
                const tensor = new Float32Array(IMG_HEIGHT * IMG_WIDTH);
                for (let y = 0; y < IMG_HEIGHT; y++) {
                    for (let x = 0; x < IMG_WIDTH; x++) {
                        const i = (y * IMG_WIDTH + x) * 4;
                        // Luminance formula matching training: (0.299R + 0.587G + 0.114B) / 255
                        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255.0;
                        tensor[y * IMG_WIDTH + x] = lum;
                    }
                }

                resolve(tensor);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = imageBase64;
    });
}

/**
 * Recognize captcha and return 4-digit code.
 */
export async function recognizeCaptcha(
    imageBase64: string,
): Promise<{ text: string; confidence: number } | null> {
    try {
        const sess = await ensureSession();

        console.log("[ocr] Processing captcha...");
        const tensorData = await imageToTensor(imageBase64);

        // Create input tensor: (1, 1, 28, 80)
        const inputTensor = new ort.Tensor("float32", tensorData, [1, 1, IMG_HEIGHT, IMG_WIDTH]);

        // Run inference
        const startTime = performance.now();
        const results = await sess.run({ image: inputTensor });
        const elapsed = performance.now() - startTime;

        // Output: (1, 4, 10) — 4 digit positions, 10 classes each
        const output = results.digits;
        const data = output.data as Float32Array;

        // Extract predicted digits via argmax
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

            // Convert logit to pseudo-confidence via softmax
            let sumExp = 0;
            for (let cls = 0; cls < 10; cls++) {
                sumExp += Math.exp(data[pos * 10 + cls] - maxVal);
            }
            confidences.push(1 / sumExp * 100);
        }

        const text = digits.join("");
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / 4;

        console.log(
            `[ocr] Result: ${text} (confidence: ${confidences.map((c) => c.toFixed(0) + "%").join(", ")}, avg: ${avgConfidence.toFixed(0)}%, ${elapsed.toFixed(0)}ms)`,
        );

        return { text, confidence: avgConfidence };
    } catch (err) {
        console.error("[ocr] Error:", err);
        return null;
    }
}

export async function terminateOCR(): Promise<void> {
    if (session) {
        // ort.InferenceSession doesn't have terminate, just release reference
        session = null;
        initPromise = null;
    }
}
