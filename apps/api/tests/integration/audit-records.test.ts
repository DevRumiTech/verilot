import { randomUUID } from "node:crypto";

import { API_PATHS } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { UserRole, UserStatus } from "../../src/generated/prisma/enums.js";

let administratorCookie = "";
let crossOrganizationAuditRecordId = "";
let crossOrganizationCookie = "";
let crossOrganizationUserId = "";
let inspectorCookie = "";
let operatorCookie = "";
let redactionAuditRecordId = "";

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
  const [manufacturer, logistics, administrator] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: "verilot-manufacturing",
      },
    }),
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
        id: true,
        passwordHash: true,
      },
      where: {
        email: "admin@verilot.local",
      },
    }),
  ]);

  crossOrganizationUserId = randomUUID();
  crossOrganizationAuditRecordId = randomUUID();
  redactionAuditRecordId = randomUUID();
  const crossOrganizationEmail = `audit-admin-${randomUUID()}@verilot.local`;

  await prisma.user.create({
    data: {
      displayName: "Logistics Audit Administrator",
      email: crossOrganizationEmail,
      id: crossOrganizationUserId,
      organizationId: logistics.id,
      passwordHash: administrator.passwordHash,
      role: UserRole.ADMINISTRATOR,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.auditRecord.createMany({
    data: [
      {
        action: "FOREIGN_AUDIT_FIXTURE",
        entityId: crossOrganizationAuditRecordId,
        entityType: "IntegrationFixture",
        id: crossOrganizationAuditRecordId,
        organizationId: logistics.id,
        reason: "Foreign organization visibility fixture.",
        requestId: `req_foreign_audit_${crossOrganizationAuditRecordId}`,
      },
      {
        action: "SENSITIVE_JSON_FIXTURE",
        actorEmail: "admin@verilot.local",
        actorId: administrator.id,
        actorRole: UserRole.ADMINISTRATOR,
        afterData: {
          cookieValue: "session-cookie-value",
          nested: {
            Authorization: "Bearer plain-test-value",
            authorizationToken: "token-value",
            okay: null,
            sessionIdentifier: "session-id-value",
            userAgentHash: "user-agent-hash-value",
          },
        },
        beforeData: {
          Password: "plain-test-value",
          list: [
            {
              CsRfHash: "csrf-hash-value",
            },
          ],
          nested: {
            api_key: "api-key-value",
            credentials: "credential-value",
            safe: "visible-value",
          },
        },
        entityId: redactionAuditRecordId,
        entityType: "IntegrationFixture",
        id: redactionAuditRecordId,
        organizationId: manufacturer.id,
        reason: "Recursive response redaction fixture.",
        requestId: `req_redaction_${redactionAuditRecordId}`,
      },
    ],
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
  if (crossOrganizationUserId !== "") {
    await prisma.user.deleteMany({
      where: {
        id: crossOrganizationUserId,
      },
    });
  }

  await prisma.$disconnect();
});

describe("audit record APIs", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.auditRecords).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("rejects operators and inspectors", async () => {
    for (const cookie of [operatorCookie, inspectorCookie]) {
      const response = await request(app)
        .get(API_PATHS.auditRecords)
        .set("Cookie", cookie)
        .expect(403);

      expect(response.body.error).toMatchObject({
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }
  });

  it("returns administrator audit summaries without large JSON payloads", async () => {
    const response = await request(app)
      .get(API_PATHS.auditRecords)
      .query({
        page: 1,
        pageSize: 10,
      })
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
    });
    expect(response.body.data.auditRecords).toHaveLength(10);

    for (const auditRecord of response.body.data.auditRecords) {
      expect(auditRecord).not.toHaveProperty("afterData");
      expect(auditRecord).not.toHaveProperty("beforeData");
      expect(auditRecord.createdAt).toMatch(/Z$/);
    }
  });

  it("filters audit records using supported fields", async () => {
    const seededRecord = await prisma.auditRecord.findFirstOrThrow({
      select: {
        action: true,
        actorId: true,
        createdAt: true,
        entityId: true,
        entityType: true,
        id: true,
        requestId: true,
      },
      where: {
        actorId: {
          not: null,
        },
        organization: {
          slug: "verilot-manufacturing",
        },
      },
    });

    const response = await request(app)
      .get(API_PATHS.auditRecords)
      .query({
        action: seededRecord.action,
        actorId: seededRecord.actorId,
        createdFrom: new Date(seededRecord.createdAt.getTime() - 1_000).toISOString(),
        createdTo: new Date(seededRecord.createdAt.getTime() + 1_000).toISOString(),
        entityId: seededRecord.entityId,
        entityType: seededRecord.entityType,
        requestId: seededRecord.requestId,
        search: seededRecord.requestId,
      })
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.auditRecords.map((record: { id: string }) => record.id)).toContain(
      seededRecord.id,
    );
  });

  it("returns detail with recursive sensitive-key redaction", async () => {
    const response = await request(app)
      .get(`${API_PATHS.auditRecords}/${redactionAuditRecordId}`)
      .set("Cookie", administratorCookie)
      .expect(200);

    expect(response.body.data.auditRecord).toMatchObject({
      afterData: {
        cookieValue: "[REDACTED]",
        nested: {
          Authorization: "[REDACTED]",
          authorizationToken: "[REDACTED]",
          okay: null,
          sessionIdentifier: "[REDACTED]",
          userAgentHash: "[REDACTED]",
        },
      },
      beforeData: {
        Password: "[REDACTED]",
        list: [
          {
            CsRfHash: "[REDACTED]",
          },
        ],
        nested: {
          api_key: "[REDACTED]",
          credentials: "[REDACTED]",
          safe: "visible-value",
        },
      },
      id: redactionAuditRecordId,
    });

    const storedRecord = await prisma.auditRecord.findUniqueOrThrow({
      select: {
        beforeData: true,
      },
      where: {
        id: redactionAuditRecordId,
      },
    });

    expect(storedRecord.beforeData).toMatchObject({
      Password: "plain-test-value",
    });
  });

  it("hides a foreign record while allowing its own administrator to read it", async () => {
    await request(app)
      .get(`${API_PATHS.auditRecords}/${crossOrganizationAuditRecordId}`)
      .set("Cookie", administratorCookie)
      .expect(404);

    const response = await request(app)
      .get(`${API_PATHS.auditRecords}/${crossOrganizationAuditRecordId}`)
      .set("Cookie", crossOrganizationCookie)
      .expect(200);

    expect(response.body.data.auditRecord).toMatchObject({
      id: crossOrganizationAuditRecordId,
    });
  });

  it("rejects invalid path and query values", async () => {
    await request(app)
      .get(`${API_PATHS.auditRecords}/not-a-uuid`)
      .set("Cookie", administratorCookie)
      .expect(400);

    const invalidQueries = [
      { actorId: "not-a-uuid" },
      { createdFrom: "not-a-date" },
      {
        createdFrom: "2026-08-01T00:00:00.000Z",
        createdTo: "2026-07-01T00:00:00.000Z",
      },
      { page: 0 },
      { pageSize: 101 },
      { search: "x".repeat(101) },
    ];

    for (const query of invalidQueries) {
      await request(app)
        .get(API_PATHS.auditRecords)
        .query(query)
        .set("Cookie", administratorCookie)
        .expect(400);
    }
  });
});
