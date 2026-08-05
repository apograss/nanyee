import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Canvas design runtime editable source marker: vite-config
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // 仅 dev 需要：onnxruntime 运行时会给 wasm 胶水文件的动态 import 追加 ?import，
      // 触发 vite 模块管线而对 public/ 下文件报 500；在内部中间件之前剥掉查询串。
      // build/preview/nginx 按路径直接服务静态文件，不受影响。
      name: "ort-wasm-strip-query",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/ort-wasm/")) {
            req.url = req.url.split("?")[0];
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  optimizeDeps: {
    // 预打包会给 onnxruntime 运行时的动态 import 追加 ?import，
    // 导致 public/ 下的 wasm 胶水文件被当作模块处理而 500
    exclude: ["onnxruntime-web"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
