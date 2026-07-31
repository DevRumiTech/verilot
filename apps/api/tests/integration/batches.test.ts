import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { BatchStatus, UserRole, UserStatus } from "../../src/generated/prisma/enums.js";

let crossOrganizationBatchId = "";
let crossOrganizationEmail = "";
let crossOrganizationUserId = "";

function readCookiePair(response: request.Response): string {
  const values = response.headers["set-cookie"];

  if (!Array.isArray(values) || values[0] === undefined) {
    throw new Error("Expected a Set-Cookie response header.");
  }

  const cookiePair = values[0].split(";")[0];

  if (cookiePair === undefined) {
    throw new Error("Expected an authentication cookie.");
  }

  return cookiePair;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({ email, password })
    .expect(200);

  return readCookiePair(response);
}

beforeAll(async () => {
  const [organization, administrator] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: "alpine-transit",
      },
    }),
    prisma.user.findUniqueOrThrow({
      select: {
        passwordHash: true,
      },
      where: {
        email: "admin@verilot.local",
      },
    }),
  ]);

  crossOrganizationUserId = randomUUID();
  crossOrganizationBatchId = randomUUID();
  crossOrganizationEmail = `batch-admin-${randomUUID()}@verilot.local`;

  await prisma.user.create({
    data: {
      displayName: "Logistics Batch Administrator",
      email: crossOrganizationEmail,
      id: crossOrganizationUserId,
      organizationId: organization.id,
      passwordHash: administrator.passwordHash,
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.batch.create({
    data: {
      activatedAt: new Date("2026-07-01T08:00:00.000Z"),
      code: `ALT-${randomUUID().slice(0, 8)}`,
      createdById: crossOrganizationUserId,
      expiresAt: new Date("2029-07-01T00:00:00.000Z"),
      id: crossOrganizationBatchId,
      lotNumber: `ALT-LOT-${randomUUID().slice(0, 8)}`,
      manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
      manufacturerOrganizationId: organization.id,
      productName: "Logistics Test Assembly",
      serialEnd: 10,
      serialPrefix: "ALT-2026-",
      serialStart: 1,
      sku: `ALT-SKU-${randomUUID().slice(0, 8)}`,
      status: BatchStatus.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (crossOrganizationBatchId !== "") {
    await prisma.batch.deleteMany({
      where: {
        id: crossOrganizationBatchId,
      },
    });
  }

  if (crossOrganizationUserId !== "") {
    await prisma.user.deleteMany({
      where: {
        id: crossOrganizationUserId,
      },
    });
  }

  await prisma.$disconnect();
});

describe("batch APIs", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.batches).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("returns paginated organization batches", async () => {
    const cookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const response = await request(app)
      .get(API_PATHS.batches)
      .query({
        page: 1,
        pageSize: 5,
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.batches).toHaveLength(5);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      pageSize: 5,
      totalItems: 8,
      totalPages: 2,
    });

    for (const batch of response.body.data.batches) {
      expect(batch.productCount).toBe(20);
      expect(batch.code).toMatch(/^VL-BATCH-2026-/);
    }
  });

  it("filters batches by status and search text", async () => {
    const cookie = await signIn("inspector@verilot.local", "VeriLotInspector2026!");

    const recalled = await request(app)
      .get(API_PATHS.batches)
      .query({
        status: "RECALLED",
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(recalled.body.data.batches).toHaveLength(2);
    expect(
      recalled.body.data.batches.every((batch: { status: string }) => batch.status === "RECALLED"),
    ).toBe(true);

    const searched = await request(app)
      .get(API_PATHS.batches)
      .query({
        search: "Thermal Control",
      })
      .set("Cookie", cookie)
      .expect(200);

    expect(searched.body.data.batches).toHaveLength(1);
    expect(searched.body.data.batches[0]).toMatchObject({
      code: "VL-BATCH-2026-003",
      productName: "Thermal Control Module",
    });
  });

  it("returns one batch from the authenticated organization", async () => {
    const cookie = await signIn("operator@verilot.local", "VeriLotOperator2026!");

    const batch = await prisma.batch.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        code: "VL-BATCH-2026-003",
      },
    });

    const response = await request(app)
      .get(`${API_PATHS.batches}/${batch.id}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.batch).toMatchObject({
      code: "VL-BATCH-2026-003",
      productCount: 20,
      productName: "Thermal Control Module",
      status: "ACTIVE",
    });
  });

  it("does not expose a batch from another organization", async () => {
    const manufacturerCookie = await signIn("admin@verilot.local", "VeriLotAdmin2026!");

    await request(app)
      .get(`${API_PATHS.batches}/${crossOrganizationBatchId}`)
      .set("Cookie", manufacturerCookie)
      .expect(404);

    const logisticsCookie = await signIn(crossOrganizationEmail, "VeriLotAdmin2026!");

    const response = await request(app)
      .get(API_PATHS.batches)
      .set("Cookie", logisticsCookie)
      .expect(200);

    expect(response.body.data.batches).toHaveLength(1);
    expect(response.body.data.batches[0].id).toBe(crossOrganizationBatchId);
  });
});
