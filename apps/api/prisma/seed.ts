import "dotenv/config";

import { createHash } from "node:crypto";

import { hash } from "bcryptjs";

import { prisma } from "../src/config/database.js";
import {
  buildSeedData,
  PARTNER_API_KEY,
  STABLE_SERIAL_NUMBER,
  type SeedCredentials,
} from "./seed-data.js";

const SEED_PASSWORDS = {
  administrator: "VeriLotAdmin2026!",
  inspector: "VeriLotInspector2026!",
  operator: "VeriLotOperator2026!",
} as const;

interface SeedCounts {
  readonly alerts: number;
  readonly apiClients: number;
  readonly auditRecords: number;
  readonly batches: number;
  readonly custodyEvents: number;
  readonly locations: number;
  readonly organizations: number;
  readonly products: number;
  readonly recalls: number;
  readonly users: number;
}

async function buildCredentials(): Promise<SeedCredentials> {
  const [administratorPasswordHash, operatorPasswordHash, inspectorPasswordHash] =
    await Promise.all([
      hash(SEED_PASSWORDS.administrator, 12),
      hash(SEED_PASSWORDS.operator, 12),
      hash(SEED_PASSWORDS.inspector, 12),
    ]);

  return {
    administratorPasswordHash,
    operatorPasswordHash,
    inspectorPasswordHash,
    apiKeyHash: createHash("sha256").update(PARTNER_API_KEY).digest("hex"),
  };
}

async function readSeedCounts(): Promise<SeedCounts> {
  const [
    organizations,
    users,
    locations,
    batches,
    products,
    custodyEvents,
    alerts,
    recalls,
    auditRecords,
    apiClients,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.location.count(),
    prisma.batch.count(),
    prisma.product.count(),
    prisma.custodyEvent.count(),
    prisma.alert.count(),
    prisma.recall.count(),
    prisma.auditRecord.count(),
    prisma.apiClient.count(),
  ]);

  return {
    organizations,
    users,
    locations,
    batches,
    products,
    custodyEvents,
    alerts,
    recalls,
    auditRecords,
    apiClients,
  };
}

function assertMinimumCounts(counts: SeedCounts): void {
  const requirements = {
    alerts: 16,
    apiClients: 1,
    auditRecords: 120,
    batches: 8,
    custodyEvents: 250,
    locations: 8,
    organizations: 4,
    products: 160,
    recalls: 2,
    users: 3,
  } satisfies SeedCounts;

  for (const key of Object.keys(requirements) as (keyof SeedCounts)[]) {
    if (counts[key] < requirements[key]) {
      throw new Error(
        `Seed requirement failed for ${key}: expected at least ${requirements[key]}, received ${counts[key]}.`,
      );
    }
  }
}

async function seedDatabase(): Promise<void> {
  const stableProduct = await prisma.product.findUnique({
    select: { id: true },
    where: { serialNumber: STABLE_SERIAL_NUMBER },
  });

  if (!stableProduct) {
    const credentials = await buildCredentials();
    const data = buildSeedData(credentials);

    await prisma.$transaction(
      async (transaction) => {
        await transaction.organization.createMany({ data: data.organizations });
        await transaction.user.createMany({ data: data.users });
        await transaction.location.createMany({ data: data.locations });
        await transaction.batch.createMany({ data: data.batches });
        await transaction.product.createMany({ data: data.products });
        await transaction.recall.createMany({ data: data.recalls });
        await transaction.custodyEvent.createMany({ data: data.custodyEvents });
        await transaction.verificationAttempt.createMany({
          data: data.verificationAttempts,
        });
        await transaction.alert.createMany({ data: data.alerts });
        await transaction.auditRecord.createMany({ data: data.auditRecords });
        await transaction.apiClient.createMany({ data: data.apiClients });
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  const counts = await readSeedCounts();
  assertMinimumCounts(counts);

  const stableProductStatus = await prisma.product.findUniqueOrThrow({
    select: {
      batch: {
        select: {
          code: true,
          productName: true,
        },
      },
      serialNumber: true,
      status: true,
    },
    where: {
      serialNumber: STABLE_SERIAL_NUMBER,
    },
  });

  console.info(
    JSON.stringify({
      event: "seed.complete",
      counts,
      stableProduct: stableProductStatus,
    }),
  );
}

await prisma.$connect();

try {
  await seedDatabase();
} finally {
  await prisma.$disconnect();
}
