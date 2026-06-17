import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web admin SPA. Talks to the Go backend (default http://localhost:8080).
// Override the API base with VITE_API_BASE. The dev proxy below forwards
// /v1/* to the backend so the SPA can use same-origin relative URLs in dev.
//
// @ts-expect-error process is a nodejs global
const apiTarget = process.env.VITE_API_BASE || "http://localhost:8080";

// https://vite.dev/config/
export default defineConfig({
  // Served under /admin in production (the marketing site owns "/").
  base: "/admin/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/v1": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
