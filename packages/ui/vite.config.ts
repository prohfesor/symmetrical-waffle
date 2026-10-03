import react from "@vitejs/plugin-react";
import * as path from "node:path";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Use @pcad/core's source directly: no build step needed first, and edits to core hot-reload in dev.
  resolve: { alias: { "@pcad/core": path.resolve(__dirname, "../core/src/index.ts") } },
  server: {
    port: 5173,
    // Proxies relative /api/* calls to @pcad/server during `npm run dev:web`,
    // so the frontend doesn't need VITE_API_BASE_URL set for local dev. In
    // production the server serves this build itself (same origin), so no
    // proxy is involved there.
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Keep the large, rarely-changing libraries in their own cacheable chunks.
      output: {
        manualChunks: (id) => (id.includes("pdf-lib") ? "pdf" : id.includes("node_modules/react") ? "react" : undefined),
      },
    },
  },
});
