import { randomUUID } from "node:crypto";

import { API_PATHS, CSRF_HEADER_NAME } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import {
  AlertRule,
  AlertSeverity,
  AlertStatus,
  VerificationResult,
} from "../../src/generated/prisma/enums.js";

interface SignedInSession {
  cookie: string;
  csrfToken: string;
}

const idempotencyKeys = {
  assign: `alert-assign-${randomUUID()}`,
  dismiss: `alert-dismiss-${randomUUID()}`,
  resolve: `alert-resolve-${randomUUID()}`,
};

let administratorId = "";
let administratorSession: SignedInSession;
let assignAlertId = "";
let closedAlertId = "";
let dismissAlertId = "";
let foreignAlertId = "";
let foreignAssignmentAlertId = "";
let foreignAssignmentTargetId = "";
let inspectorId = "";
let inspectorAlertId = "";
let inspectorSession: SignedInSession;
let operatorId = "";
let operatorSession: SignedInSession;
const verificationAttemptIds: string[] = [];

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

async function signIn(email: string, password: string): Promise<SignedInSession> {
  const response = await request(app)
    .post(API_PATHS.auth.login)
    .set("Origin", env.APP_ORIGIN)
    .send({ email, password })
    .expect(200);

  return {
    cookie: readCookiePair(response),
    csrfToken: response.body.data.csrfToken,
  };
}

beforeAll(async () => {
  const [manufacturer, logistics, administrator, operator, inspector, partner] = await Promise.all([
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
      },
      where: {
        email: "admin@verilot.local",
      },
    }),
    prisma.user.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        email: "operator@verilot.local",
      },
    }),
    prisma.user.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        email: "inspector@verilot.local",
      },
    }),
    prisma.user.findUniqueOrThrow({
      select: {
        id: true,
      },
      where: {
        email: "partner@alpine-transit.local",
      },
    }),
  ]);

  administratorId = administrator.id;
  operatorId = operator.id;
  inspectorId = inspector.id;
  foreignAssignmentTargetId = partner.id;
  assignAlertId = randomUUID();
  inspectorAlertId = randomUUID();
  dismissAlertId = randomUUID();
  closedAlertId = randomUUID();
  foreignAssignmentAlertId = randomUUID();
  foreignAlertId = randomUUID();

  const fixtures = [
    { alertId: assignAlertId, organizationId: manufacturer.id, status: AlertStatus.OPEN },
    {
      alertId: inspectorAlertId,
      organizationId: manufacturer.id,
      status: AlertStatus.OPEN,
    },
    {
      alertId: dismissAlertId,
      organizationId: manufacturer.id,
      status: AlertStatus.EVIDENCE_REQUESTED,
    },
    {
      alertId: closedAlertId,
      organizationId: manufacturer.id,
      status: AlertStatus.RESOLVED,
    },
    {
      alertId: foreignAssignmentAlertId,
      organizationId: manufacturer.id,
      status: AlertStatus.OPEN,
    },
    { alertId: foreignAlertId, organizationId: logistics.id, status: AlertStatus.OPEN },
  ];

  for (const fixture of fixtures) {
    const verificationAttemptId = randomUUID();
    verificationAttemptIds.push(verificationAttemptId);

    await prisma.verificationAttempt.create({
      data: {
        id: verificationAttemptId,
        ipHash: verificationAttemptId.replaceAll("-", "").padEnd(64, "0"),
        organizationId: fixture.organizationId,
        requestId: `req_alert_workflow_source_${verificationAttemptId}`,
        result: VerificationResult.WARNING,
        serialNumber: `WF-${verificationAttemptId}`,
      },
    });

    await prisma.alert.create({
      data: {
        ...(fixture.status === AlertStatus.RESOLVED
          ? {
              decisionAt: new Date("2026-07-30T09:00:00.000Z"),
              resolvedById: administrator.id,
              reviewNotes: "Already resolved fixture.",
            }
          : {}),
        details: {
          fixture: fixture.alertId,
        },
        id: fixture.alertId,
        organizationId: fixture.organizationId,
        rule: AlertRule.DUPLICATE_SCAN,
        severity: AlertSeverity.HIGH,
        status: fixture.status,
        summary: `Alert workflow fixture ${fixture.alertId}.`,
        title: `Alert workflow ${fixture.alertId}`,
        verificationAttemptId,
      },
    });
  }

  [administratorSession, operatorSession, inspectorSession] = await Promise.all([
    signIn("admin@verilot.local", "VeriLotAdmin2026!"),
    signIn("operator@verilot.local", "VeriLotOperator2026!"),
    signIn("inspector@verilot.local", "VeriLotInspector2026!"),
  ]);
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({
    where: {
      key: {
        in: Object.values(idempotencyKeys),
      },
    },
  });

  await prisma.alert.deleteMany({
    where: {
      id: {
        in: [
          assignAlertId,
          inspectorAlertId,
          dismissAlertId,
          closedAlertId,
          foreignAssignmentAlertId,
          foreignAlertId,
        ],
      },
    },
  });

  await prisma.verificationAttempt.deleteMany({
    where: {
      id: {
        in: verificationAttemptIds,
      },
    },
  });

  await prisma.$disconnect();
});

describe("alert workflow mutations", () => {
  it("enforces origin, authentication, CSRF, and permission middleware", async () => {
    const path = `${API_PATHS.alerts}/${assignAlertId}/assign`;
    const body = {
      assignedToId: operatorId,
      idempotencyKey: `security-${randomUUID()}`,
    };

    await request(app).post(path).set("Origin", "https://untrusted.example").send(body).expect(403);
    await request(app).post(path).set("Origin", env.APP_ORIGIN).send(body).expect(401);
    await request(app)
      .post(path)
      .set("Cookie", administratorSession.cookie)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(403);
    await request(app)
      .post(path)
      .set("Cookie", operatorSession.cookie)
      .set(CSRF_HEADER_NAME, operatorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(403);
  });

  it("assigns an alert atomically and records an audit entry", async () => {
    const response = await request(app)
      .post(`${API_PATHS.alerts}/${assignAlertId}/assign`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .set("X-Request-ID", "req_alert_assign")
      .send({
        assignedToId: operatorId,
        idempotencyKey: idempotencyKeys.assign,
        reason: "Assign to the primary operator.",
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      alert: {
        assignedTo: {
          id: operatorId,
        },
        id: assignAlertId,
        status: "IN_REVIEW",
      },
      replayed: false,
    });

    const [alert, auditRecord] = await Promise.all([
      prisma.alert.findUniqueOrThrow({
        where: {
          id: assignAlertId,
        },
      }),
      prisma.auditRecord.findFirstOrThrow({
        where: {
          action: "alert.assigned",
          entityId: assignAlertId,
        },
      }),
    ]);

    expect(alert).toMatchObject({
      assignedToId: operatorId,
      status: "IN_REVIEW",
    });
    expect(auditRecord).toMatchObject({
      actorId: administratorId,
      entityType: "Alert",
      requestId: "req_alert_assign",
    });
  });

  it("replays the stored assignment and rejects changed data", async () => {
    const body = {
      assignedToId: operatorId,
      idempotencyKey: idempotencyKeys.assign,
      reason: "Assign to the primary operator.",
    };

    const replay = await request(app)
      .post(`${API_PATHS.alerts}/${assignAlertId}/assign`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(200);

    expect(replay.body.data).toMatchObject({
      alert: {
        id: assignAlertId,
        status: "IN_REVIEW",
      },
      replayed: true,
    });

    await request(app)
      .post(`${API_PATHS.alerts}/${assignAlertId}/assign`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        ...body,
        assignedToId: administratorId,
      })
      .expect(409);

    const auditCount = await prisma.auditRecord.count({
      where: {
        action: "alert.assigned",
        entityId: assignAlertId,
      },
    });

    expect(auditCount).toBe(1);
  });

  it("allows an inspector to resolve an alert in its organization", async () => {
    const response = await request(app)
      .post(`${API_PATHS.alerts}/${inspectorAlertId}/resolve`)
      .set("Cookie", inspectorSession.cookie)
      .set(CSRF_HEADER_NAME, inspectorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .set("X-Request-ID", "req_alert_resolve")
      .send({
        idempotencyKey: idempotencyKeys.resolve,
        reviewNotes: "Evidence confirms the scan is legitimate.",
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      alert: {
        decisionAt: expect.any(String),
        id: inspectorAlertId,
        resolvedBy: {
          id: inspectorId,
        },
        reviewNotes: "Evidence confirms the scan is legitimate.",
        status: "RESOLVED",
      },
      replayed: false,
    });

    await expect(
      prisma.auditRecord.findFirst({
        where: {
          action: "alert.resolved",
          entityId: inspectorAlertId,
          requestId: "req_alert_resolve",
        },
      }),
    ).resolves.toMatchObject({
      actorId: inspectorId,
      entityType: "Alert",
    });
  });

  it("dismisses a supported open workflow state", async () => {
    const response = await request(app)
      .post(`${API_PATHS.alerts}/${dismissAlertId}/dismiss`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .set("X-Request-ID", "req_alert_dismiss")
      .send({
        idempotencyKey: idempotencyKeys.dismiss,
        reviewNotes: "The evidence request showed a benign duplicate.",
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      alert: {
        id: dismissAlertId,
        status: "DISMISSED",
      },
      replayed: false,
    });
  });

  it("rejects invalid transitions, foreign alerts, and foreign assignees", async () => {
    await request(app)
      .post(`${API_PATHS.alerts}/${closedAlertId}/resolve`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        idempotencyKey: `closed-${randomUUID()}`,
        reviewNotes: "Attempt to resolve twice.",
      })
      .expect(409);

    await request(app)
      .post(`${API_PATHS.alerts}/${foreignAlertId}/dismiss`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        idempotencyKey: `foreign-${randomUUID()}`,
        reviewNotes: "Must remain hidden.",
      })
      .expect(404);

    await request(app)
      .post(`${API_PATHS.alerts}/${foreignAssignmentAlertId}/assign`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        assignedToId: foreignAssignmentTargetId,
        idempotencyKey: `foreign-target-${randomUUID()}`,
      })
      .expect(404);
  });

  it("rejects invalid identifiers and bodies", async () => {
    await request(app)
      .post(`${API_PATHS.alerts}/not-a-uuid/assign`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        assignedToId: operatorId,
        idempotencyKey: `validation-${randomUUID()}`,
      })
      .expect(400);

    await request(app)
      .post(`${API_PATHS.alerts}/${assignAlertId}/resolve`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        idempotencyKey: "short",
        reviewNotes: "",
      })
      .expect(400);
  });
});
