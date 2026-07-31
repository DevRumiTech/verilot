import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import {
  AlertRule,
  AlertSeverity,
  AlertStatus,
  UserRole,
  UserStatus,
  VerificationResult,
} from "../../src/generated/prisma/enums.js";

let administratorCookie = "";
let crossOrganizationAlertId = "";
let crossOrganizationCookie = "";
let crossOrganizationUserId = "";
let crossOrganizationVerificationAttemptId = "";
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
  crossOrganizationAlertId = randomUUID();
  crossOrganizationVerificationAttemptId = randomUUID();
  const crossOrganizationEmail = `alert-admin-${randomUUID()}@verilot.local`;

  await prisma.user.create({
    data: {
      displayName: "Logistics Alert Administrator",
      email: crossOrganizationEmail,
      id: crossOrganizationUserId,
      organizationId: organization.id,
      passwordHash: administrator.passwordHash,
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.verificationAttempt.create({
    data: {
      id: crossOrganizationVerificationAttemptId,
      ipHash: crossOrganizationVerificationAttemptId.replaceAll("-", "").padEnd(64, "0"),
      organizationId: organization.id,
      requestId: `req_alert_${crossOrganizationAlertId}`,
      result: VerificationResult.UNKNOWN,
      serialNumber: `ALT-${crossOrganizationAlertId}`,
    },
  });

  await prisma.alert.create({
    data: {
      details: {
        fixture: crossOrganizationAlertId,
      },
      id: crossOrganizationAlertId,
      organizationId: organization.id,
      rule: AlertRule.DUPLICATE_SCAN,
      severity: AlertSeverity.HIGH,
      status: AlertStatus.OPEN,
      summary: `Foreign organization fixture ${crossOrganizationAlertId}.`,
      title: `Foreign alert ${crossOrganizationAlertId}`,
      verificationAttemptId: crossOrganizationVerificationAttemptId,
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
  if (crossOrganizationAlertId !== "") {
    await prisma.alert.deleteMany({
      where: {
        id: crossOrganizationAlertId,
      },
    });
  }

  if (crossOrganizationVerificationAttemptId !== "") {
    await prisma.verificationAttempt.deleteMany({
      where: {
        id: crossOrganizationVerificationAttemptId,
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

describe("alert APIs", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.alerts).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("allows every authorized role to list alerts", async () => {
    for (const cookie of [administratorCookie, operatorCookie, inspectorCookie]) {
      const response = await request(app)
        .get(API_PATHS.alerts)
        .query({
          page: 1,
          pageSize: 5,
        })
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body.data).toMatchObject({
        pagination: {
          page: 1,
          pageSize: 5,
        },
      });
      expect(response.body.data.alerts).toBeInstanceOf(Array);
      expect(response.body.data.alerts.length).toBeLessThanOrEqual(5);
    }
  });

  it("filters alerts using supported schema fields", async () => {
    const seededAlert = await prisma.alert.findFirstOrThrow({
      select: {
        assignedToId: true,
        batchId: true,
        id: true,
        product: {
          select: {
            serialNumber: true,
          },
        },
        productId: true,
        rule: true,
        severity: true,
        status: true,
      },
      where: {
        organization: {
          slug: "verilot-manufacturing",
        },
        productId: {
          not: null,
        },
      },
    });

    const response = await request(app)
      .get(API_PATHS.alerts)
      .query({
        assignedToId: seededAlert.assignedToId,
        batchId: seededAlert.batchId,
        productId: seededAlert.productId,
        rule: seededAlert.rule,
        search: seededAlert.product?.serialNumber,
        severity: seededAlert.severity,
        status: seededAlert.status,
      })
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.alerts.map((alert: { id: string }) => alert.id)).toContain(
      seededAlert.id,
    );
  });

  it("returns a seeded alert with bounded related records", async () => {
    const seededAlert = await prisma.alert.findFirstOrThrow({
      select: {
        id: true,
      },
      where: {
        eventId: {
          not: null,
        },
        organization: {
          slug: "verilot-manufacturing",
        },
        productId: {
          not: null,
        },
      },
    });

    const response = await request(app)
      .get(`${API_PATHS.alerts}/${seededAlert.id}`)
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.alert).toMatchObject({
      batch: {
        code: expect.stringMatching(/^VL-BATCH-2026-/),
      },
      custodyEvent: {
        eventAt: expect.any(String),
        id: expect.any(String),
      },
      id: seededAlert.id,
      product: {
        serialNumber: expect.stringMatching(/^VL-2026-/),
      },
      title: expect.any(String),
    });
    expect(response.body.data.alert.createdAt).toMatch(/Z$/);
    expect(response.body.data.alert.updatedAt).toMatch(/Z$/);
  });

  it("returns a linked verification attempt without sensitive hashes", async () => {
    const seededAlert = await prisma.alert.findFirstOrThrow({
      select: {
        id: true,
      },
      where: {
        organization: {
          slug: "verilot-manufacturing",
        },
        verificationAttemptId: {
          not: null,
        },
      },
    });

    const response = await request(app)
      .get(`${API_PATHS.alerts}/${seededAlert.id}`)
      .set("Cookie", operatorCookie)
      .expect(200);

    expect(response.body.data.alert.verificationAttempt).toMatchObject({
      attemptedAt: expect.any(String),
      id: expect.any(String),
      result: expect.any(String),
      serialNumber: expect.any(String),
    });
    expect(response.body.data.alert.verificationAttempt).not.toHaveProperty("ipHash");
    expect(response.body.data.alert.verificationAttempt).not.toHaveProperty("userAgentHash");
  });

  it("hides a foreign alert while allowing its own organization to read it", async () => {
    await request(app)
      .get(`${API_PATHS.alerts}/${crossOrganizationAlertId}`)
      .set("Cookie", administratorCookie)
      .expect(404);

    const response = await request(app)
      .get(`${API_PATHS.alerts}/${crossOrganizationAlertId}`)
      .set("Cookie", crossOrganizationCookie)
      .expect(200);

    expect(response.body.data.alert).toMatchObject({
      id: crossOrganizationAlertId,
      status: "OPEN",
    });
  });

  it("rejects invalid path and query values", async () => {
    await request(app)
      .get(`${API_PATHS.alerts}/not-a-uuid`)
      .set("Cookie", administratorCookie)
      .expect(400);

    const invalidQueries = [
      { page: 0 },
      { pageSize: 101 },
      { productId: "not-a-uuid" },
      { rule: "NOT_A_RULE" },
      { search: "x".repeat(101) },
      { severity: "URGENT" },
      { status: "UNKNOWN" },
    ];

    for (const query of invalidQueries) {
      await request(app)
        .get(API_PATHS.alerts)
        .query(query)
        .set("Cookie", administratorCookie)
        .expect(400);
    }
  });
});
