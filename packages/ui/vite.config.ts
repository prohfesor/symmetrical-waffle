import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  base: "./",
  plugins: [react()],
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
  },
});
