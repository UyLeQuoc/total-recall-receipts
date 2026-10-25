/**
 * Receipts' web e2e (ADR-0064): the API on 8812 (worker and bot off) and Vite on 5181 proxying to it.
 * Never 8811, where a worker may be running, and never 8787/5173. Runs against the local dev database
 * and real upcoming games; signing uses a generated key that holds nothing.
 *   bun run e2e
 */
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8812;

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  outputDir: "../test-results/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5181", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun --env-file=../../.env src/main.ts",
      cwd: "..",
      url: `http://localhost:${API_PORT}/health`,
      env: { RECEIPTS_PORT: String(API_PORT), RECEIPTS_WORKER: "off", RECEIPTS_BOT: "off" },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npx vite --config web/vite.config.ts",
      cwd: "..",
      url: "http://localhost:5181",
      env: { RECEIPTS_PORT: String(API_PORT) },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
