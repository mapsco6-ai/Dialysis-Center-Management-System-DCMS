import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "./test-results",
  reporter: [["list"], ["json", { outputFile: "./test-results/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    { command: "node ../../scripts/ui-preview-api.mjs", url: "http://127.0.0.1:3101/api/v1/health", reuseExistingServer: !process.env.CI },
    { command: "node ../../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/login", timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:3101/api/v1" }, reuseExistingServer: !process.env.CI },
  ],
});
