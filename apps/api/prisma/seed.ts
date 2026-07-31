import "dotenv/config";

import { createHash, randomBytes } from "node:crypto";

import { hash } from "bcryptjs";

import { prisma } from "../src/config/database.js";
import { UserRole, UserStatus } from "../src/generated/prisma/enums.js";
import {
  buildSeedData,
  PARTNER_API_KEY,
  STABLE_SERIAL_NUMBER,
  type SeedCredentials,
} from "./seed-data.js";

const SEED_PASSWORDS = {
  administrator: "VeriLotAdmin2026!",
  demo: "VeriLotDemo2026!",
  inspector: "VeriLotInspector2026!",
  operator: "VeriLotOperator2026!",
} as const;

type SeedProfile = "local" | "public-demo";

function readSeedProfile(): SeedProfile {
  const profile = process.env.SEED_PROFILE ?? "local";

  if (profile !== "local" && profile !== "public-demo") {
    throw new Error('SEED_PROFILE must be either "local" or "public-demo".');
  }

  if (process.env.NODE_ENV === "production" && profile !== "public-demo") {
    throw new Error('Production seeding requires SEED_PROFILE="public-demo".');
  }

  return profile;
}

function readDemoPassword(profile: SeedProfile): string {
  if (profile === "local") {
    return SEED_PASSWORDS.demo;
  }

  const password = process.env.DEMO_PASSWORD;

  if (password === undefined || password.length < 12) {
    throw new Error("Public demo seeding requires DEMO_PASSWORD with at least 12 characters.");
  }

  return password;
}

function createPrivateSeedSecret(): string {
  return randomBytes(32).toString("base64url");
}

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

async function buildCredentials(profile: SeedProfile): Promise<SeedCredentials> {
  const publicDemo = profile === "public-demo";
  const administratorPassword = publicDemo
    ? createPrivateSeedSecret()
    : SEED_PASSWORDS.administrator;
  const operatorPassword = publicDemo ? createPrivateSeedSecret() : SEED_PASSWORDS.operator;
  const inspectorPassword = publicDemo ? createPrivateSeedSecret() : SEED_PASSWORDS.inspector;
  const demoPassword = readDemoPassword(profile);
  const apiKey = publicDemo ? createPrivateSeedSecret() : PARTNER_API_KEY;

  const [
    administratorPasswordHash,
    operatorPasswordHash,
    inspectorPasswordHash,
    demoPasswordHash,
  ] = await Promise.all([
    hash(administratorPassword, 12),
    hash(operatorPassword, 12),
    hash(inspectorPassword, 12),
    hash(demoPassword, 12),
  ]);

  return {
    administratorPasswordHash,
    operatorPasswordHash,
    inspectorPasswordHash,
    demoPasswordHash,
    apiKeyHash: createHash("sha256").update(apiKey).digest("hex"),
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
    users: 5,
  } satisfies SeedCounts;

  for (const key of Object.keys(requirements) as (keyof SeedCounts)[]) {
    if (counts[key] < requirements[key]) {
      throw new Error(
        `Seed requirement failed for ${key}: expected at least ${requirements[key]}, received ${counts[key]}.`,
      );
    }
  }
}

async function seedDatabase(profile: SeedProfile): Promise<void> {
  const stableProduct = await prisma.product.findUnique({
    select: { id: true },
    where: { serialNumber: STABLE_SERIAL_NUMBER },
  });

  if (!stableProduct) {
    const credentials = await buildCredentials(profile);
    const data = buildSeedData(credentials);
    const users =
      profile === "public-demo"
        ? data.users.map((user) => ({
            ...user,
            status: user.role === UserRole.DEMO ? UserStatus.ACTIVE : UserStatus.SUSPENDED,
          }))
        : data.users;

    await prisma.$transaction(
      async (transaction) => {
        await transaction.organization.createMany({ data: data.organizations });
        await transaction.user.createMany({ data: users });
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
      profile,
      counts,
      stableProduct: stableProductStatus,
    }),
  );
}

const seedProfile = readSeedProfile();

await prisma.$connect();

try {
  await seedDatabase(seedProfile);
} finally {
  await prisma.$disconnect();
}
