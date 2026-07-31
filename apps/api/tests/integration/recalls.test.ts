import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import {
  BatchStatus,
  RecallStatus,
  UserRole,
  UserStatus,
} from "../../src/generated/prisma/enums.js";

let administratorCookie = "";
let crossOrganizationBatchId = "";
let crossOrganizationCookie = "";
let crossOrganizationRecallId = "";
let crossOrganizationUserId = "";
let inspectorCookie = "";
let operatorCookie = "";

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
  crossOrganizationRecallId = randomUUID();
  const fixtureSuffix = randomUUID().slice(0, 8);
  const crossOrganizationEmail = `recall-admin-${randomUUID()}@verilot.local`;

  await prisma.user.create({
    data: {
      displayName: "Logistics Recall Administrator",
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
      code: `ALT-RECALL-${fixtureSuffix}`,
      createdById: crossOrganizationUserId,
      expiresAt: new Date("2029-07-01T00:00:00.000Z"),
      id: crossOrganizationBatchId,
      lotNumber: `ALT-RECALL-LOT-${fixtureSuffix}`,
      manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
      manufacturerOrganizationId: organization.id,
      productName: "Logistics Recall Fixture",
      serialEnd: 1,
      serialPrefix: `ALT-R-${fixtureSuffix}-`,
      serialStart: 1,
      sku: `ALT-RECALL-SKU-${fixtureSuffix}`,
      status: BatchStatus.ACTIVE,
    },
  });

  await prisma.recall.create({
    data: {
      announcedAt: new Date("2026-07-29T08:00:00.000Z"),
      batchId: crossOrganizationBatchId,
      createdById: crossOrganizationUserId,
      id: crossOrganizationRecallId,
      organizationId: organization.id,
      reason: `Foreign organization recall fixture ${crossOrganizationRecallId}.`,
      reference: `ALT-REC-${fixtureSuffix}`,
      requestId: `req_recall_${crossOrganizationRecallId}`,
      status: RecallStatus.ACTIVE,
    },
  });

  [administratorCookie, operatorCookie, inspectorCookie, crossOrganizationCookie] =
    await Promise.all([
      signIn("admin@verilot.local", "VeriLotAdmin2026!"),
      signIn("operator@verilot.local", "VeriLotOperator2026!"),
      signIn("inspector@verilot.local", "VeriLotInspector2026!"),
      signIn(crossOrganizationEmail, "VeriLotAdmin2026!"),
    ]);
});

afterAll(async () => {
  if (crossOrganizationRecallId !== "") {
    await prisma.recall.deleteMany({
      where: {
        id: crossOrganizationRecallId,
      },
    });
  }

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

describe("recall APIs", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.recalls).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("allows every authorized role to list recalls", async () => {
    for (const cookie of [administratorCookie, operatorCookie, inspectorCookie]) {
      const response = await request(app)
        .get(API_PATHS.recalls)
        .query({
          page: 1,
          pageSize: 5,
        })
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        pageSize: 5,
      });
      expect(response.body.data.recalls).toBeInstanceOf(Array);
      expect(response.body.data.recalls.length).toBeLessThanOrEqual(5);
    }
  });

  it("filters recalls by status, batch, date range, and search text", async () => {
    const seededRecall = await prisma.recall.findFirstOrThrow({
      select: {
        announcedAt: true,
        batch: {
          select: {
            productName: true,
          },
        },
        batchId: true,
        id: true,
        status: true,
      },
      where: {
        organization: {
          slug: "verilot-manufacturing",
        },
      },
    });

    const response = await request(app)
      .get(API_PATHS.recalls)
      .query({
        announcedFrom: new Date(seededRecall.announcedAt.getTime() - 1_000).toISOString(),
        announcedTo: new Date(seededRecall.announcedAt.getTime() + 1_000).toISOString(),
        batchId: seededRecall.batchId,
        search: seededRecall.batch.productName,
        status: seededRecall.status,
      })
      .set("Cookie", operatorCookie)
      .expect(200);

    expect(response.body.data.recalls.map((recall: { id: string }) => recall.id)).toContain(
      seededRecall.id,
    );
  });

  it("returns a seeded recall with bounded batch counts", async () => {
    const seededRecall = await prisma.recall.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        reference: "VL-REC-2026-001",
      },
    });

    const response = await request(app)
      .get(`${API_PATHS.recalls}/${seededRecall.id}`)
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.recall).toMatchObject({
      announcedAt: expect.any(String),
      batch: {
        code: "VL-BATCH-2026-007",
        lotNumber: expect.any(String),
      },
      createdBy: {
        displayName: expect.any(String),
        id: expect.any(String),
      },
      custodyEventCount: expect.any(Number),
      id: seededRecall.id,
      productCount: 20,
      reference: "VL-REC-2026-001",
      status: "ACTIVE",
    });
    expect(response.body.data.recall.announcedAt).toMatch(/Z$/);
  });

  it("hides a foreign recall while allowing its own organization to read it", async () => {
    await request(app)
      .get(`${API_PATHS.recalls}/${crossOrganizationRecallId}`)
      .set("Cookie", administratorCookie)
      .expect(404);

    const response = await request(app)
      .get(`${API_PATHS.recalls}/${crossOrganizationRecallId}`)
      .set("Cookie", crossOrganizationCookie)
      .expect(200);

    expect(response.body.data.recall).toMatchObject({
      id: crossOrganizationRecallId,
      status: "ACTIVE",
    });
  });

  it("rejects invalid path and query values", async () => {
    await request(app)
      .get(`${API_PATHS.recalls}/not-a-uuid`)
      .set("Cookie", administratorCookie)
      .expect(400);

    const invalidQueries = [
      { announcedFrom: "not-a-date" },
      {
        announcedFrom: "2026-08-01T00:00:00.000Z",
        announcedTo: "2026-07-01T00:00:00.000Z",
      },
      { batchId: "not-a-uuid" },
      { page: 0 },
      { pageSize: 101 },
      { search: "x".repeat(101) },
      { status: "UNKNOWN" },
    ];

    for (const query of invalidQueries) {
      await request(app)
        .get(API_PATHS.recalls)
        .query(query)
        .set("Cookie", administratorCookie)
        .expect(400);
    }
  });
});
