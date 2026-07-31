import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

export const repositoryDirectory = fileURLToPath(new URL("../../../../", import.meta.url));
const apiDirectory = fileURLToPath(new URL("../../../api/", import.meta.url));
const localEnvironment = loadEnv("development", apiDirectory, "");

function testDatabaseUrl(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = localEnvironment[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for browser test database preparation.`);
  }

  const url = new URL(value);
  url.pathname = "/verilot_test";
  return url.toString();
}

export const webBaseUrl = "http://127.0.0.1:4301";
export const apiBaseUrl = "http://127.0.0.1:4300";

export const testApiEnvironment: Record<string, string> = {
  ...localEnvironment,
  APP_ORIGIN: webBaseUrl,
  DATABASE_URL: testDatabaseUrl("DATABASE_URL"),
  DIRECT_URL: testDatabaseUrl("DIRECT_URL"),
  HOST: "127.0.0.1",
  LOG_LEVEL: "warn",
  NODE_ENV: "test",
  PORT: "4300",
  TZ: "UTC",
};
