import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "vitest/config";

const environmentFile = fileURLToPath(new URL("./.env", import.meta.url));
loadEnvironment({ path: environmentFile });

function readRequiredEnvironmentVariable(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required to configure the test database.`);
  }

  return value;
}

function createTestDatabaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = "/verilot_test";
  return url.toString();
}

const testDatabaseUrl = createTestDatabaseUrl(readRequiredEnvironmentVariable("DATABASE_URL"));
const testDirectUrl = createTestDatabaseUrl(readRequiredEnvironmentVariable("DIRECT_URL"));

process.env.NODE_ENV = "test";
process.env.TZ = "UTC";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = testDirectUrl;

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDirectUrl,
      NODE_ENV: "test",
      TZ: "UTC",
    },
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
