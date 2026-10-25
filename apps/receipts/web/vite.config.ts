// Receipts' web (ADR-0064). Dev: http://localhost:5181, with /api proxied to the API (8811, or
// RECEIPTS_PORT). Build: web/dist, which the API serves at the same paths.
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://localhost:${process.env.RECEIPTS_PORT ?? 8811}`;

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  // The kit copied from Remora imports through "@/" (ADR-0066).
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // dapp-kit and the Sui SDK are most of the bundle; one chunk is fine for a local app.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: Number(process.env.RECEIPTS_WEB_PORT ?? 5181),
    strictPort: true,
    proxy: { "/api": api, "/health": api },
  },
});
