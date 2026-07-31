import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (baseURL === undefined || baseURL.length === 0) {
  throw new Error("PLAYWRIGHT_BASE_URL is required for production review.");
}

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "./test-results/live-artifacts",
  projects: [
    {
      name: "production-chromium",
      testMatch: /production\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-webkit",
      testMatch: /recalls-responsive\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./tests/live",
  timeout: 240_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
