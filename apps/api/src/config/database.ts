import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

const globalDatabase = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    options: "-c timezone=UTC",
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalDatabase.prismaClient ?? createPrismaClient();

if (env.NODE_ENV === "development") {
  globalDatabase.prismaClient = prisma;
}
