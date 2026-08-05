// 把 onnxruntime-web 的 wasm 运行时复制到 public/，dev/build 前自动执行。
// 包的 exports 不放行 dist/* 深路径导入，vite 也无法可靠处理 .mjs 的 ?url，
// 而 public/ 下文件会被原样服务/拷贝，配合 captcha-ocr.jsx 的 wasmPaths 前缀使用。
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../node_modules/onnxruntime-web/dist/", import.meta.url));
const outDir = fileURLToPath(new URL("../public/ort-wasm/", import.meta.url));

mkdirSync(outDir, { recursive: true });
for (const name of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
]) {
  copyFileSync(distDir + name, outDir + name);
}
console.log("[ort] wasm runtime copied to public/ort-wasm/");
