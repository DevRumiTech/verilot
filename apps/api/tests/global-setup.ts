import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDirectory = fileURLToPath(new URL("../", import.meta.url));
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalTestDatabase(name: "DATABASE_URL" | "DIRECT_URL"): void {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} is required for test database preparation.`);
  }

  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\/+/, "");

  if (!allowedHosts.has(url.hostname) || databaseName !== "verilot_test") {
    throw new Error(`Refusing destructive test setup for ${url.hostname}/${databaseName}.`);
  }
}

function runPrisma(arguments_: readonly string[]): void {
  const result = spawnSync("npm", ["exec", "--", "prisma", ...arguments_], {
    cwd: apiDirectory,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Prisma command failed: prisma ${arguments_.join(" ")}`);
  }
}

export default function prepareTestDatabase(): void {
  assertLocalTestDatabase("DATABASE_URL");
  assertLocalTestDatabase("DIRECT_URL");

  runPrisma(["migrate", "reset", "--force"]);
  runPrisma(["db", "seed"]);
}
