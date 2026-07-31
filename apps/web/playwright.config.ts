import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

import {
  apiBaseUrl,
  repositoryDirectory,
  testApiEnvironment,
  webBaseUrl,
} from "./tests/e2e/test-environment.js";

const administratorState = fileURLToPath(
  new URL("./test-results/.auth/administrator.json", import.meta.url),
);
const operatorState = fileURLToPath(new URL("./test-results/.auth/operator.json", import.meta.url));

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "./test-results/playwright-artifacts",
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      dependencies: ["setup"],
      name: "administrator",
      testMatch: /(?:authenticated|responsive)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: administratorState },
    },
    {
      dependencies: ["setup"],
      name: "operator",
      testMatch: /operator\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: operatorState },
    },
  ],
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  retries: 0,
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: webBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "env -u NO_COLOR npm run start --workspace @verilot/api",
      cwd: repositoryDirectory,
      env: testApiEnvironment,
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiBaseUrl}/api/health`,
    },
    {
      command:
        "env -u NO_COLOR npm run dev --workspace @verilot/web -- --host 127.0.0.1 --port 4301",
      cwd: repositoryDirectory,
      env: { VITE_API_PROXY_TARGET: apiBaseUrl },
      reuseExistingServer: false,
      timeout: 120_000,
      url: webBaseUrl,
    },
  ],
  workers: 1,
});
