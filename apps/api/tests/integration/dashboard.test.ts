import { randomUUID } from "node:crypto";

import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  API_PATHS,
  BATCH_STATUSES,
  DASHBOARD_RECENT_ITEM_LIMIT,
  DASHBOARD_VERIFICATION_TREND_DAYS,
  PRODUCT_STATUSES,
  RECALL_STATUSES,
  VERIFICATION_RESULTS,
} from "@verilot/contracts";
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
  const crossOrganizationEmail = `dashboard-admin-${randomUUID()}@verilot.local`;
  const fixtureTime = new Date();

  await prisma.user.create({
    data: {
      displayName: "Logistics Dashboard Administrator",
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
      attemptedAt: fixtureTime,
      id: crossOrganizationVerificationAttemptId,
      ipHash: crossOrganizationVerificationAttemptId.replaceAll("-", "").padEnd(64, "0"),
      organizationId: organization.id,
      requestId: `req_dashboard_${crossOrganizationAlertId}`,
      result: VerificationResult.WARNING,
      serialNumber: `DASH-${crossOrganizationAlertId}`,
    },
  });

  await prisma.alert.create({
    data: {
      createdAt: fixtureTime,
      details: {
        fixture: crossOrganizationAlertId,
      },
      id: crossOrganizationAlertId,
      organizationId: organization.id,
      rule: AlertRule.EXCESSIVE_VERIFICATION_ATTEMPTS,
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.OPEN,
      summary: `Dashboard organization fixture ${crossOrganizationAlertId}.`,
      title: `Dashboard alert ${crossOrganizationAlertId}`,
      updatedAt: fixtureTime,
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

describe("dashboard summary API", () => {
  it("rejects anonymous requests", async () => {
    const response = await request(app).get(API_PATHS.dashboardSummary).expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    });
  });

  it("allows every organization dashboard role", async () => {
    for (const cookie of [administratorCookie, operatorCookie, inspectorCookie]) {
      const response = await request(app)
        .get(API_PATHS.dashboardSummary)
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body.data.generatedAt).toEqual(expect.any(String));
    }
  });

  it("returns a stable bounded summary from seeded organization data", async () => {
    const response = await request(app)
      .get(API_PATHS.dashboardSummary)
      .set("Cookie", administratorCookie)
      .expect(200);
    const summary = response.body.data;

    expect(Object.keys(summary)).toEqual([
      "alertCounts",
      "batchCountsByStatus",
      "generatedAt",
      "productCountsByStatus",
      "recallCountsByStatus",
      "recentAlerts",
      "recentCustodyActivity",
      "recentVerificationTotals",
      "verificationTrend",
    ]);
    expect(Object.keys(summary.productCountsByStatus)).toEqual(PRODUCT_STATUSES);
    expect(Object.keys(summary.batchCountsByStatus)).toEqual(BATCH_STATUSES);
    expect(Object.keys(summary.alertCounts.bySeverity)).toEqual(ALERT_SEVERITIES);
    expect(Object.keys(summary.alertCounts.byStatus)).toEqual(ALERT_STATUSES);
    expect(Object.keys(summary.recallCountsByStatus)).toEqual(RECALL_STATUSES);
    expect(Object.keys(summary.recentVerificationTotals.byResult)).toEqual(VERIFICATION_RESULTS);

    expect(summary.productCountsByStatus.VERIFIED).toBeGreaterThan(0);
    expect(summary.productCountsByStatus.RECALLED).toBeGreaterThan(0);
    expect(summary.batchCountsByStatus.ACTIVE).toBeGreaterThan(0);
    expect(summary.alertCounts.bySeverity.CRITICAL).toBeGreaterThan(0);
    expect(summary.alertCounts.byStatus.OPEN).toBeGreaterThan(0);
    expect(summary.recallCountsByStatus.ACTIVE).toBeGreaterThan(0);
    expect(summary.recallCountsByStatus.COMPLETED).toBeGreaterThan(0);
    expect(summary.recentVerificationTotals.byResult.VERIFIED).toBeGreaterThan(0);

    expect(summary.recentAlerts.length).toBeLessThanOrEqual(DASHBOARD_RECENT_ITEM_LIMIT);
    expect(summary.recentCustodyActivity.length).toBeLessThanOrEqual(DASHBOARD_RECENT_ITEM_LIMIT);
    expect(summary.verificationTrend).toHaveLength(DASHBOARD_VERIFICATION_TREND_DAYS);

    const trendPeriods = summary.verificationTrend.map(
      (point: { periodStart: string }) => point.periodStart,
    );
    expect(trendPeriods).toEqual([...trendPeriods].sort());

    for (const point of summary.verificationTrend) {
      expect(Object.keys(point.byResult)).toEqual(VERIFICATION_RESULTS);
      expect(point.total).toBe(
        Object.values(point.byResult).reduce(
          (total: number, count) => total + (count as number),
          0,
        ),
      );
      expect(new Date(point.periodStart).toISOString()).toBe(point.periodStart);
    }

    expect(new Date(summary.generatedAt).toISOString()).toBe(summary.generatedAt);
    expect(new Date(summary.recentVerificationTotals.from).toISOString()).toBe(
      summary.recentVerificationTotals.from,
    );
    expect(new Date(summary.recentVerificationTotals.to).toISOString()).toBe(
      summary.recentVerificationTotals.to,
    );
    expect(JSON.stringify(summary)).not.toMatch(/(?:ip|userAgent|password|token|key)Hash/i);
  });

  it("excludes foreign records and returns them only to their organization", async () => {
    const [manufacturerResponse, logisticsResponse] = await Promise.all([
      request(app).get(API_PATHS.dashboardSummary).set("Cookie", administratorCookie).expect(200),
      request(app)
        .get(API_PATHS.dashboardSummary)
        .set("Cookie", crossOrganizationCookie)
        .expect(200),
    ]);

    const manufacturerAlertIds = manufacturerResponse.body.data.recentAlerts.map(
      (alert: { id: string }) => alert.id,
    );
    const logisticsAlertIds = logisticsResponse.body.data.recentAlerts.map(
      (alert: { id: string }) => alert.id,
    );

    expect(manufacturerAlertIds).not.toContain(crossOrganizationAlertId);
    expect(logisticsAlertIds).toContain(crossOrganizationAlertId);
    expect(logisticsResponse.body.data.recentVerificationTotals.byResult.WARNING).toBeGreaterThan(
      0,
    );
  });
});
