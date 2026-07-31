import { randomUUID } from "node:crypto";

import { API_PATHS, CSRF_HEADER_NAME } from "@verilot/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { BatchStatus } from "../../src/generated/prisma/enums.js";

interface SignedInSession {
  cookie: string;
  csrfToken: string;
}

const fixtureSuffix = randomUUID().slice(0, 8);
const idempotencyKeys = {
  activate: `batch-activate-${randomUUID()}`,
  close: `batch-close-${randomUUID()}`,
  concurrentActivate: `batch-concurrent-activate-${randomUUID()}`,
  concurrentCreate: `batch-concurrent-create-${randomUUID()}`,
  create: `batch-create-${randomUUID()}`,
  duplicateCode: `batch-duplicate-code-${randomUUID()}`,
  duplicateLot: `batch-duplicate-lot-${randomUUID()}`,
  foreign: `batch-foreign-${randomUUID()}`,
};
const createBody = {
  code: `WF-BATCH-${fixtureSuffix}`,
  expiresAt: "2029-07-01",
  idempotencyKey: idempotencyKeys.create,
  lotNumber: `WF-LOT-${fixtureSuffix}`,
  manufacturedAt: "2026-07-01",
  productName: "Batch workflow assembly",
  serialEnd: 103,
  serialPrefix: `WF-${fixtureSuffix}-`,
  serialStart: 101,
  sku: `WF-SKU-${fixtureSuffix}`,
};

let administratorSession: SignedInSession;
let concurrentBatchId = "";
let createdBatchId = "";
let demoSession: SignedInSession;
let foreignBatchId = "";
let inspectorSession: SignedInSession;
let operatorId = "";
let operatorSession: SignedInSession;

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

function postAs(session: SignedInSession, path: string) {
  return request(app)
    .post(path)
    .set("Cookie", session.cookie)
    .set(CSRF_HEADER_NAME, session.csrfToken)
    .set("Origin", env.APP_ORIGIN);
}

beforeAll(async () => {
  const [logistics, operator, partner] = await Promise.all([
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
        email: "operator@verilot.local",
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

  operatorId = operator.id;
  foreignBatchId = randomUUID();

  await prisma.batch.create({
    data: {
      code: `WF-FOREIGN-BATCH-${fixtureSuffix}`,
      createdById: partner.id,
      id: foreignBatchId,
      lotNumber: `WF-FOREIGN-LOT-${fixtureSuffix}`,
      manufacturedAt: new Date("2026-07-01T00:00:00.000Z"),
      manufacturerOrganizationId: logistics.id,
      productName: "Foreign batch workflow assembly",
      serialEnd: 1,
      serialPrefix: `WF-F-${fixtureSuffix}-`,
      serialStart: 1,
      sku: `WF-FOREIGN-SKU-${fixtureSuffix}`,
      status: BatchStatus.DRAFT,
    },
  });

  [administratorSession, operatorSession, inspectorSession, demoSession] =
    await Promise.all([
      signIn("admin@verilot.local", "VeriLotAdmin2026!"),
      signIn("operator@verilot.local", "VeriLotOperator2026!"),
      signIn("inspector@verilot.local", "VeriLotInspector2026!"),
      signIn("demo@verilot.local", "VeriLotDemo2026!"),
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

  const workflowBatchIds = [createdBatchId, concurrentBatchId].filter((id) => id !== "");

  await prisma.product.deleteMany({
    where: {
      batchId: {
        in: workflowBatchIds,
      },
    },
  });

  await prisma.batch.deleteMany({
    where: {
      id: {
        in: [...workflowBatchIds, foreignBatchId].filter((id) => id !== ""),
      },
    },
  });

  await prisma.$disconnect();
});

describe("batch workflow mutations", () => {
  it("enforces origin, authentication, CSRF, and write permission", async () => {
    const securityBody = {
      ...createBody,
      code: `WF-SEC-${fixtureSuffix}`,
      idempotencyKey: `batch-security-${randomUUID()}`,
      lotNumber: `WF-SEC-LOT-${fixtureSuffix}`,
    };

    await request(app)
      .post(API_PATHS.batches)
      .set("Origin", "https://untrusted.example")
      .send(securityBody)
      .expect(403);
    await request(app)
      .post(API_PATHS.batches)
      .set("Origin", env.APP_ORIGIN)
      .send(securityBody)
      .expect(401);
    await request(app)
      .post(API_PATHS.batches)
      .set("Cookie", administratorSession.cookie)
      .set("Origin", env.APP_ORIGIN)
      .send(securityBody)
      .expect(403);
    await postAs(inspectorSession, API_PATHS.batches).send(securityBody).expect(403);

    await request(app)
      .get(API_PATHS.batches)
      .set("Cookie", demoSession.cookie)
      .expect(200);

    const demoWrite = await postAs(demoSession, API_PATHS.batches)
      .send(securityBody)
      .expect(403);

    expect(demoWrite.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("validates dates, serial ranges, and generation bounds", async () => {
    const response = await postAs(administratorSession, API_PATHS.batches)
      .send({
        ...createBody,
        code: "",
        expiresAt: "2026-07-01",
        idempotencyKey: "short",
        serialEnd: 1_001,
        serialPrefix: "unsafe prefix",
        serialStart: 1,
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toEqual(
      expect.objectContaining({
        code: expect.any(Array),
        expiresAt: expect.any(Array),
        idempotencyKey: expect.any(Array),
        serialEnd: expect.any(Array),
        serialPrefix: expect.any(Array),
      }),
    );
  });

  it("allows an operator to create a draft batch with idempotent replay", async () => {
    const created = await postAs(operatorSession, API_PATHS.batches).send(createBody).expect(201);

    createdBatchId = created.body.data.batch.id;
    expect(created.body.data).toMatchObject({
      batch: {
        activatedAt: null,
        code: createBody.code,
        expiresAt: createBody.expiresAt,
        id: createdBatchId,
        lotNumber: createBody.lotNumber,
        manufacturedAt: createBody.manufacturedAt,
        productCount: 0,
        productName: createBody.productName,
        serialEnd: createBody.serialEnd,
        serialPrefix: createBody.serialPrefix,
        serialStart: createBody.serialStart,
        sku: createBody.sku,
        status: "DRAFT",
      },
      replayed: false,
    });

    const [stored, auditCount] = await Promise.all([
      prisma.batch.findUniqueOrThrow({
        select: {
          createdById: true,
          status: true,
        },
        where: {
          id: createdBatchId,
        },
      }),
      prisma.auditRecord.count({
        where: {
          action: "batch.created",
          actorId: operatorId,
          entityId: createdBatchId,
          entityType: "Batch",
        },
      }),
    ]);

    expect(stored).toEqual({
      createdById: operatorId,
      status: "DRAFT",
    });
    expect(auditCount).toBe(1);

    const replay = await postAs(operatorSession, API_PATHS.batches).send(createBody).expect(201);

    expect(replay.body.data).toEqual({
      batch: created.body.data.batch,
      replayed: true,
    });

    const conflict = await postAs(operatorSession, API_PATHS.batches)
      .send({
        ...createBody,
        sku: `WF-DIFFERENT-SKU-${fixtureSuffix}`,
      })
      .expect(409);

    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects duplicate batch codes and organization lot numbers", async () => {
    const duplicateCode = await postAs(administratorSession, API_PATHS.batches)
      .send({
        ...createBody,
        idempotencyKey: idempotencyKeys.duplicateCode,
        lotNumber: `WF-OTHER-LOT-${fixtureSuffix}`,
      })
      .expect(409);

    expect(duplicateCode.body.error.code).toBe("BATCH_IDENTITY_CONFLICT");

    const duplicateLot = await postAs(administratorSession, API_PATHS.batches)
      .send({
        ...createBody,
        code: `WF-OTHER-BATCH-${fixtureSuffix}`,
        idempotencyKey: idempotencyKeys.duplicateLot,
      })
      .expect(409);

    expect(duplicateLot.body.error.code).toBe("BATCH_IDENTITY_CONFLICT");
  });

  it("activates once, generates exact identities, and detects replay conflicts", async () => {
    const path = `${API_PATHS.batches}/${createdBatchId}/activate`;
    const body = {
      idempotencyKey: idempotencyKeys.activate,
    };
    const activated = await postAs(administratorSession, path).send(body).expect(200);

    expect(activated.body.data).toMatchObject({
      batch: {
        activatedAt: expect.any(String),
        id: createdBatchId,
        productCount: 3,
        status: "ACTIVE",
      },
      replayed: false,
    });

    const products = await prisma.product.findMany({
      orderBy: {
        serialNumber: "asc",
      },
      select: {
        activatedAt: true,
        qrPayload: true,
        serialNumber: true,
        status: true,
      },
      where: {
        batchId: createdBatchId,
      },
    });

    expect(products).toEqual(
      [101, 102, 103].map((sequence) => {
        const serialNumber = `${createBody.serialPrefix}${sequence.toString().padStart(6, "0")}`;

        return {
          activatedAt: expect.any(Date),
          qrPayload: `https://verilot.local/verify/${serialNumber}`,
          serialNumber,
          status: "VERIFIED",
        };
      }),
    );

    const replay = await postAs(administratorSession, path).send(body).expect(200);

    expect(replay.body.data).toEqual({
      batch: activated.body.data.batch,
      replayed: true,
    });
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "batch.activated",
          entityId: createdBatchId,
          entityType: "Batch",
        },
      }),
    ).toBe(1);

    const conflict = await postAs(
      administratorSession,
      `${API_PATHS.batches}/${createdBatchId}/close`,
    )
      .send(body)
      .expect(409);

    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");

    const invalid = await postAs(administratorSession, path)
      .send({
        idempotencyKey: `batch-activate-again-${randomUUID()}`,
      })
      .expect(409);

    expect(invalid.body.error.code).toBe("INVALID_BATCH_TRANSITION");
  });

  it("closes an active batch without removing products or history", async () => {
    const path = `${API_PATHS.batches}/${createdBatchId}/close`;
    const body = {
      idempotencyKey: idempotencyKeys.close,
    };
    const closed = await postAs(operatorSession, path).send(body).expect(200);

    expect(closed.body.data).toMatchObject({
      batch: {
        id: createdBatchId,
        productCount: 3,
        status: "CLOSED",
      },
      replayed: false,
    });
    expect(
      await prisma.product.count({
        where: {
          batchId: createdBatchId,
        },
      }),
    ).toBe(3);
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "batch.closed",
          entityId: createdBatchId,
          entityType: "Batch",
        },
      }),
    ).toBe(1);

    const replay = await postAs(operatorSession, path).send(body).expect(200);

    expect(replay.body.data).toEqual({
      batch: closed.body.data.batch,
      replayed: true,
    });

    const invalid = await postAs(operatorSession, path)
      .send({
        idempotencyKey: `batch-close-again-${randomUUID()}`,
      })
      .expect(409);

    expect(invalid.body.error.code).toBe("INVALID_BATCH_TRANSITION");
  });

  it("hides foreign batches during lifecycle changes", async () => {
    const response = await postAs(
      administratorSession,
      `${API_PATHS.batches}/${foreignBatchId}/activate`,
    )
      .send({
        idempotencyKey: idempotencyKeys.foreign,
      })
      .expect(404);

    expect(response.body.error.code).toBe("BATCH_NOT_FOUND");
  });

  it("serializes concurrent activation without duplicating products", async () => {
    const concurrentBody = {
      ...createBody,
      code: `WF-CONCURRENT-${fixtureSuffix}`,
      idempotencyKey: idempotencyKeys.concurrentCreate,
      lotNumber: `WF-CONCURRENT-LOT-${fixtureSuffix}`,
      serialEnd: 202,
      serialPrefix: `WF-C-${fixtureSuffix}-`,
      serialStart: 201,
      sku: `WF-CONCURRENT-SKU-${fixtureSuffix}`,
    };
    const created = await postAs(administratorSession, API_PATHS.batches)
      .send(concurrentBody)
      .expect(201);

    concurrentBatchId = created.body.data.batch.id;
    const activationPath = `${API_PATHS.batches}/${concurrentBatchId}/activate`;
    const activationBody = {
      idempotencyKey: idempotencyKeys.concurrentActivate,
    };
    const [first, second] = await Promise.all([
      postAs(administratorSession, activationPath).send(activationBody),
      postAs(administratorSession, activationPath).send(activationBody),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect([first.body.data.replayed, second.body.data.replayed].sort()).toEqual([false, true]);
    expect(
      await prisma.product.count({
        where: {
          batchId: concurrentBatchId,
        },
      }),
    ).toBe(2);
    expect(
      await prisma.auditRecord.count({
        where: {
          action: "batch.activated",
          entityId: concurrentBatchId,
          entityType: "Batch",
        },
      }),
    ).toBe(1);
  });
});
