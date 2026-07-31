import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  schema: "prisma/schema.prisma",
});
