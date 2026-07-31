import { randomUUID } from "node:crypto";

import { API_PATHS, CSRF_HEADER_NAME } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { BatchStatus, ProductStatus, RecallStatus } from "../../src/generated/prisma/enums.js";

interface SignedInSession {
  cookie: string;
  csrfToken: string;
}

const fixtureSuffix = randomUUID().slice(0, 8);
const idempotencyKeys = {
  complete: `recall-complete-${randomUUID()}`,
  create: `recall-create-${randomUUID()}`,
  draft: `recall-draft-${randomUUID()}`,
  foreign: `recall-foreign-${randomUUID()}`,
  referenceConflict: `recall-reference-${randomUUID()}`,
};
const recallReference = `WF-REC-${fixtureSuffix}`;

let administratorId = "";
let administratorSession: SignedInSession;
let createdRecallId = "";
let draftBatchId = "";
let foreignBatchId = "";
let foreignRecallId = "";
let inspectorSession: SignedInSession;
let operatorSession: SignedInSession;
let workflowBatchId = "";
const workflowProductIds = [randomUUID(), randomUUID(), randomUUID()];

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
  const [manufacturer, logistics, administrator, partner] = await Promise.all([
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
        email: "partner@alpine-transit.local",
      },
    }),
  ]);

  administratorId = administrator.id;
  workflowBatchId = randomUUID();
  draftBatchId = randomUUID();
  foreignBatchId = randomUUID();
  foreignRecallId = randomUUID();

  await prisma.batch.createMany({
    data: [
      {
        activatedAt: new Date("2026-07-01T08:00:00.000Z"),
        code: `WF-RECALL-${fixtureSuffix}`,
        createdById: administrator.id,
        expiresAt: new Date("2029-07-01T00:00:00.000Z"),
        id: workflowBatchId,
        lotNumber: `WF-RECALL-LOT-${fixtureSuffix}`,
        manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
        manufacturerOrganizationId: manufacturer.id,
        productName: "Recall workflow product",
        serialEnd: 3,
        serialPrefix: `WF-R-${fixtureSuffix}-`,
        serialStart: 1,
        sku: `WF-RECALL-SKU-${fixtureSuffix}`,
        status: BatchStatus.ACTIVE,
      },
      {
        code: `WF-DRAFT-${fixtureSuffix}`,
        createdById: administrator.id,
        id: draftBatchId,
        lotNumber: `WF-DRAFT-LOT-${fixtureSuffix}`,
        manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
        manufacturerOrganizationId: manufacturer.id,
        productName: "Draft recall workflow product",
        serialEnd: 1,
        serialPrefix: `WF-D-${fixtureSuffix}-`,
        serialStart: 1,
        sku: `WF-DRAFT-SKU-${fixtureSuffix}`,
        status: BatchStatus.DRAFT,
      },
      {
        activatedAt: new Date("2026-07-01T08:00:00.000Z"),
        code: `WF-FOREIGN-${fixtureSuffix}`,
        createdById: partner.id,
        id: foreignBatchId,
        lotNumber: `WF-FOREIGN-LOT-${fixtureSuffix}`,
        manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
        manufacturerOrganizationId: logistics.id,
        productName: "Foreign recall workflow product",
        serialEnd: 1,
        serialPrefix: `WF-F-${fixtureSuffix}-`,
        serialStart: 1,
        sku: `WF-FOREIGN-SKU-${fixtureSuffix}`,
        status: BatchStatus.ACTIVE,
      },
    ],
  });

  await prisma.product.createMany({
    data: [
      {
        batchId: workflowBatchId,
        id: workflowProductIds[0]!,
        qrPayload: `https://verify.verilot.local/p/WF-R-${fixtureSuffix}-1`,
        serialNumber: `WF-R-${fixtureSuffix}-1`,
        status: ProductStatus.PENDING,
      },
      {
        activatedAt: new Date("2026-07-01T08:00:00.000Z"),
        batchId: workflowBatchId,
        id: workflowProductIds[1]!,
        qrPayload: `https://verify.verilot.local/p/WF-R-${fixtureSuffix}-2`,
        serialNumber: `WF-R-${fixtureSuffix}-2`,
        status: ProductStatus.VERIFIED,
      },
      {
        batchId: workflowBatchId,
        id: workflowProductIds[2]!,
        qrPayload: `https://verify.verilot.local/p/WF-R-${fixtureSuffix}-3`,
        serialNumber: `WF-R-${fixtureSuffix}-3`,
        status: ProductStatus.DESTROYED,
      },
    ],
  });

  await prisma.recall.create({
    data: {
      batchId: foreignBatchId,
      createdById: partner.id,
      id: foreignRecallId,
      organizationId: logistics.id,
      reason: "Foreign recall workflow fixture.",
      reference: `WF-F-REC-${fixtureSuffix}`,
      requestId: `req_recall_foreign_${fixtureSuffix}`,
      status: RecallStatus.ACTIVE,
    },
  });

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

  await prisma.recall.deleteMany({
    where: {
      id: {
        in: [createdRecallId, foreignRecallId].filter((id) => id !== ""),
      },
    },
  });

  await prisma.product.deleteMany({
    where: {
      id: {
        in: workflowProductIds,
      },
    },
  });

  await prisma.batch.deleteMany({
    where: {
      id: {
        in: [workflowBatchId, draftBatchId, foreignBatchId].filter((id) => id !== ""),
      },
    },
  });

  await prisma.$disconnect();
});

describe("recall workflow mutations", () => {
  it("enforces origin, authentication, CSRF, and administrator permission", async () => {
    const body = {
      batchId: workflowBatchId,
      idempotencyKey: `recall-security-${randomUUID()}`,
      reason: "Security middleware check.",
      reference: `WF-SEC-${fixtureSuffix}`,
    };

    await request(app)
      .post(API_PATHS.recalls)
      .set("Origin", "https://untrusted.example")
      .send(body)
      .expect(403);
    await request(app).post(API_PATHS.recalls).set("Origin", env.APP_ORIGIN).send(body).expect(401);
    await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(403);

    for (const session of [operatorSession, inspectorSession]) {
      await request(app)
        .post(API_PATHS.recalls)
        .set("Cookie", session.cookie)
        .set(CSRF_HEADER_NAME, session.csrfToken)
        .set("Origin", env.APP_ORIGIN)
        .send(body)
        .expect(403);
    }
  });

  it("validates creation input and organization scope", async () => {
    await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        batchId: "not-a-uuid",
        idempotencyKey: "short",
        reason: "",
        reference: "",
      })
      .expect(400);

    const response = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        batchId: foreignBatchId,
        idempotencyKey: idempotencyKeys.foreign,
        reason: "Must remain hidden.",
        reference: `WF-HIDDEN-${fixtureSuffix}`,
      })
      .expect(404);

    expect(response.body.error.code).toBe("BATCH_NOT_FOUND");
  });

  it("rejects a recall for a batch that is not active", async () => {
    const response = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        batchId: draftBatchId,
        idempotencyKey: idempotencyKeys.draft,
        reason: "Draft batches cannot be recalled.",
        reference: `WF-DRAFT-REC-${fixtureSuffix}`,
      })
      .expect(409);

    expect(response.body.error.code).toBe("INVALID_RECALL_TRANSITION");
  });

  it("creates an active recall, updates only its eligible products, and replays exactly", async () => {
    const body = {
      batchId: workflowBatchId,
      idempotencyKey: idempotencyKeys.create,
      reason: "A controlled workflow recall.",
      reference: recallReference,
    };
    const created = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(201);

    createdRecallId = created.body.data.recall.id;
    expect(created.body.data).toMatchObject({
      recall: {
        announcedAt: expect.any(String),
        batchId: workflowBatchId,
        completedAt: null,
        id: createdRecallId,
        reference: recallReference,
        status: "ACTIVE",
      },
      replayed: false,
    });

    const [batch, products, auditCount] = await Promise.all([
      prisma.batch.findUniqueOrThrow({
        select: {
          status: true,
        },
        where: {
          id: workflowBatchId,
        },
      }),
      prisma.product.findMany({
        orderBy: {
          serialNumber: "asc",
        },
        select: {
          status: true,
        },
        where: {
          id: {
            in: workflowProductIds,
          },
        },
      }),
      prisma.auditRecord.count({
        where: {
          action: "recall.created",
          actorId: administratorId,
          entityId: createdRecallId,
          entityType: "Recall",
        },
      }),
    ]);

    expect(batch.status).toBe("RECALLED");
    expect(products.map((product) => product.status)).toEqual([
      "RECALLED",
      "RECALLED",
      "DESTROYED",
    ]);
    expect(auditCount).toBe(1);

    const replay = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(201);

    expect(replay.body.data).toEqual({
      recall: created.body.data.recall,
      replayed: true,
    });
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "recall.created",
          entityId: createdRecallId,
          entityType: "Recall",
        },
      }),
    ).toBe(1);

    const conflict = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        ...body,
        reason: "Different data with the same key.",
      })
      .expect(409);

    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("preserves globally unique recall references", async () => {
    const response = await request(app)
      .post(API_PATHS.recalls)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        batchId: workflowBatchId,
        idempotencyKey: idempotencyKeys.referenceConflict,
        reason: "Duplicate reference check.",
        reference: recallReference,
      })
      .expect(409);

    expect(response.body.error.code).toBe("RECALL_REFERENCE_CONFLICT");
  });

  it("completes an active recall with replay and audit protection", async () => {
    const path = `${API_PATHS.recalls}/${createdRecallId}/complete`;
    const body = {
      idempotencyKey: idempotencyKeys.complete,
    };
    const completed = await request(app)
      .post(path)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(200);

    expect(completed.body.data).toMatchObject({
      recall: {
        batchId: workflowBatchId,
        completedAt: expect.any(String),
        id: createdRecallId,
        status: "COMPLETED",
      },
      replayed: false,
    });

    const replay = await request(app)
      .post(path)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send(body)
      .expect(200);

    expect(replay.body.data).toEqual({
      recall: completed.body.data.recall,
      replayed: true,
    });
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "recall.completed",
          entityId: createdRecallId,
          entityType: "Recall",
        },
      }),
    ).toBe(1);

    const invalid = await request(app)
      .post(path)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        idempotencyKey: `recall-complete-again-${randomUUID()}`,
      })
      .expect(409);

    expect(invalid.body.error.code).toBe("INVALID_RECALL_TRANSITION");
  });

  it("hides foreign recalls during completion", async () => {
    const response = await request(app)
      .post(`${API_PATHS.recalls}/${foreignRecallId}/complete`)
      .set("Cookie", administratorSession.cookie)
      .set(CSRF_HEADER_NAME, administratorSession.csrfToken)
      .set("Origin", env.APP_ORIGIN)
      .send({
        idempotencyKey: `recall-foreign-complete-${randomUUID()}`,
      })
      .expect(404);

    expect(response.body.error.code).toBe("RECALL_NOT_FOUND");
  });
});
