import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { repositoryDirectory, testApiEnvironment } from "./test-environment.js";

const authenticationStateDirectory = fileURLToPath(
  new URL("../../test-results/.auth/", import.meta.url),
);

mkdirSync(authenticationStateDirectory, { recursive: true });

const result = spawnSync("npm", ["run", "db:reset", "--workspace", "@verilot/api"], {
  cwd: repositoryDirectory,
  env: {
    ...process.env,
    ...testApiEnvironment,
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
      "YES, reset and reseed the local verilot_test database.",
  },
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error("The isolated browser test database could not be prepared.");
}
