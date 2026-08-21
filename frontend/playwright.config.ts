/**
 * Playwright configuration for BidRadar E2E.
 *
 * Isolates E2E specs to frontend/e2e, provides local dev server,
 * and sets baseURL for responsive/keyboard/a11y checks at 320/768/1024/1440.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "(pnpm exec convex dev --once || test -f .env.local) && pnpm exec convex env set BIDRADAR_E2E_MODE 1 && exec pnpm exec convex dev",
      url: "http://127.0.0.1:3210",
      reuseExistingServer: !process.env.CI,
      timeout: 90000,
      env: { BIDRADAR_E2E_MODE: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "for attempt in $(seq 1 30); do test -f .env.local && pnpm exec convex run e2eSeed:seed && exec pnpm start --hostname 127.0.0.1 --port 3000; sleep 1; done; exit 1",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 90000,
      env: { BIDRADAR_E2E_MODE: "1", NEXT_PUBLIC_BIDRADAR_E2E_MODE: "1", NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210" },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
