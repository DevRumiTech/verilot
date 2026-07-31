import { BATCH_STATUSES, type BatchWorkflowState, type UserRole } from "@verilot/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { BatchStatus, ProductStatus } from "../generated/prisma/enums.js";

import { prisma } from "../config/database.js";

const batchWorkflowStateSelect = {
  _count: {
    select: {
      products: true,
    },
  },
  activatedAt: true,
  code: true,
  expiresAt: true,
  id: true,
  lotNumber: true,
  manufacturedAt: true,
  productName: true,
  serialEnd: true,
  serialPrefix: true,
  serialStart: true,
  sku: true,
  status: true,
} satisfies Prisma.BatchSelect;

const batchActivationSelect = {
  ...batchWorkflowStateSelect,
  products: {
    select: {
      qrPayload: true,
      serialNumber: true,
      status: true,
    },
  },
} satisfies Prisma.BatchSelect;

type BatchWorkflowStateRecord = Prisma.BatchGetPayload<{
  select: typeof batchWorkflowStateSelect;
}>;

type BatchActivationRecord = Prisma.BatchGetPayload<{
  select: typeof batchActivationSelect;
}>;

interface BatchWorkflowCommonInput {
  actorEmail: string;
  actorId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  now: Date;
  organizationId: string;
  requestHash: string;
  requestId: string;
}

export type MutateBatchInput =
  | (BatchWorkflowCommonInput & {
      action: "create";
      code: string;
      expiresAt?: Date;
      lotNumber: string;
      manufacturedAt: Date;
      productName: string;
      serialEnd: number;
      serialPrefix: string;
      serialStart: number;
      sku: string;
    })
  | (BatchWorkflowCommonInput & {
      action: "activate";
      batchId: string;
    })
  | (BatchWorkflowCommonInput & {
      action: "close";
      batchId: string;
    });

export type MutateBatchResult =
  | {
      batch: BatchWorkflowState;
      kind: "created" | "replayed";
    }
  | {
      kind:
        | "batch-not-found"
        | "idempotency-conflict"
        | "identity-conflict"
        | "invalid-transition"
        | "serial-conflict";
    };

export interface BatchWorkflowRepository {
  mutate(input: MutateBatchInput): Promise<MutateBatchResult>;
}

interface ProductIdentity {
  qrPayload: string;
  serialNumber: string;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toWorkflowState(batch: BatchWorkflowStateRecord): BatchWorkflowState {
  return {
    activatedAt: batch.activatedAt?.toISOString() ?? null,
    code: batch.code,
    expiresAt: batch.expiresAt === null ? null : toDateOnly(batch.expiresAt),
    id: batch.id,
    lotNumber: batch.lotNumber,
    manufacturedAt: toDateOnly(batch.manufacturedAt),
    productCount: batch._count.products,
    productName: batch.productName,
    serialEnd: batch.serialEnd,
    serialPrefix: batch.serialPrefix,
    serialStart: batch.serialStart,
    sku: batch.sku,
    status: batch.status,
  };
}

function readStoredResponse(value: Prisma.JsonValue): BatchWorkflowState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const batch = value.batch;

  if (batch === null || typeof batch !== "object" || Array.isArray(batch)) {
    return null;
  }

  const activatedAt = batch.activatedAt;
  const code = batch.code;
  const expiresAt = batch.expiresAt;
  const id = batch.id;
  const lotNumber = batch.lotNumber;
  const manufacturedAt = batch.manufacturedAt;
  const productCount = batch.productCount;
  const productName = batch.productName;
  const serialEnd = batch.serialEnd;
  const serialPrefix = batch.serialPrefix;
  const serialStart = batch.serialStart;
  const sku = batch.sku;
  const status = batch.status;

  if (
    (activatedAt !== null && typeof activatedAt !== "string") ||
    typeof code !== "string" ||
    (expiresAt !== null && typeof expiresAt !== "string") ||
    typeof id !== "string" ||
    typeof lotNumber !== "string" ||
    typeof manufacturedAt !== "string" ||
    typeof productCount !== "number" ||
    !Number.isInteger(productCount) ||
    productCount < 0 ||
    typeof productName !== "string" ||
    typeof serialEnd !== "number" ||
    !Number.isInteger(serialEnd) ||
    typeof serialPrefix !== "string" ||
    typeof serialStart !== "number" ||
    !Number.isInteger(serialStart) ||
    typeof sku !== "string" ||
    typeof status !== "string" ||
    !BATCH_STATUSES.includes(status as BatchWorkflowState["status"])
  ) {
    return null;
  }

  return {
    activatedAt,
    code,
    expiresAt,
    id,
    lotNumber,
    manufacturedAt,
    productCount,
    productName,
    serialEnd,
    serialPrefix,
    serialStart,
    sku,
    status: status as BatchWorkflowState["status"],
  };
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

async function acquireLock(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  lockKey: string,
): Promise<void> {
  await transaction.$queryRaw<
    Array<{
      lockResult: string | null;
    }>
  >(
    Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtext(${organizationId}),
        hashtext(${lockKey})
      )::text AS "lockResult"
    `,
  );
}

async function readReplay(
  transaction: Prisma.TransactionClient,
  input: MutateBatchInput,
  scope: string,
): Promise<MutateBatchResult | null> {
  const stored = await transaction.idempotencyRecord.findUnique({
    where: {
      organizationId_scope_key: {
        key: input.idempotencyKey,
        organizationId: input.organizationId,
        scope,
      },
    },
  });

  if (stored !== null && stored.expiresAt.getTime() > input.now.getTime()) {
    if (stored.requestHash !== input.requestHash) {
      return {
        kind: "idempotency-conflict",
      };
    }

    const batch = readStoredResponse(stored.responseBody);

    if (batch === null) {
      return {
        kind: "idempotency-conflict",
      };
    }

    return {
      batch,
      kind: "replayed",
    };
  }

  if (stored !== null) {
    await transaction.idempotencyRecord.delete({
      where: {
        id: stored.id,
      },
    });
  }

  return null;
}

async function storeResponse(
  transaction: Prisma.TransactionClient,
  input: MutateBatchInput,
  batch: BatchWorkflowState,
  responseStatus: number,
  scope: string,
): Promise<void> {
  await transaction.idempotencyRecord.create({
    data: {
      expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
      key: input.idempotencyKey,
      organizationId: input.organizationId,
      requestHash: input.requestHash,
      responseBody: toJsonObject({
        batch,
      }),
      responseStatus,
      scope,
    },
  });
}

function buildProductIdentities(batch: BatchActivationRecord): readonly ProductIdentity[] {
  return Array.from({ length: batch.serialEnd - batch.serialStart + 1 }, (_, offset) => {
    const serialNumber = `${batch.serialPrefix}${(batch.serialStart + offset)
      .toString()
      .padStart(6, "0")}`;

    return {
      qrPayload: `https://verilot.local/verify/${serialNumber}`,
      serialNumber,
    };
  });
}

async function createBatch(
  transaction: Prisma.TransactionClient,
  input: Extract<MutateBatchInput, { action: "create" }>,
): Promise<MutateBatchResult> {
  const identityConflict = await transaction.batch.findFirst({
    select: {
      id: true,
    },
    where: {
      OR: [
        {
          code: input.code,
        },
        {
          lotNumber: input.lotNumber,
          manufacturerOrganizationId: input.organizationId,
        },
      ],
    },
  });

  if (identityConflict !== null) {
    return {
      kind: "identity-conflict",
    };
  }

  const created = await transaction.batch.create({
    data: {
      code: input.code,
      createdById: input.actorId,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      lotNumber: input.lotNumber,
      manufacturedAt: input.manufacturedAt,
      manufacturerOrganizationId: input.organizationId,
      productName: input.productName,
      serialEnd: input.serialEnd,
      serialPrefix: input.serialPrefix,
      serialStart: input.serialStart,
      sku: input.sku,
      status: BatchStatus.DRAFT,
    },
    select: batchWorkflowStateSelect,
  });
  const batch = toWorkflowState(created);

  await transaction.auditRecord.create({
    data: {
      action: "batch.created",
      actorEmail: input.actorEmail,
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterData: toJsonObject(batch),
      entityId: batch.id,
      entityType: "Batch",
      organizationId: input.organizationId,
      requestId: input.requestId,
    },
  });

  await storeResponse(transaction, input, batch, 201, "batch:create");

  return {
    batch,
    kind: "created",
  };
}

async function activateBatch(
  transaction: Prisma.TransactionClient,
  input: Extract<MutateBatchInput, { action: "activate" }>,
): Promise<MutateBatchResult> {
  const current = await transaction.batch.findFirst({
    select: batchActivationSelect,
    where: {
      id: input.batchId,
      manufacturerOrganizationId: input.organizationId,
    },
  });

  if (current === null) {
    return {
      kind: "batch-not-found",
    };
  }

  if (current.status !== BatchStatus.DRAFT) {
    return {
      kind: "invalid-transition",
    };
  }

  const expectedProducts = buildProductIdentities(current);
  const expectedBySerial = new Map(
    expectedProducts.map((product) => [product.serialNumber, product]),
  );

  for (const product of current.products) {
    const expected = expectedBySerial.get(product.serialNumber);

    if (
      expected === undefined ||
      expected.qrPayload !== product.qrPayload ||
      (product.status !== ProductStatus.PENDING && product.status !== ProductStatus.VERIFIED)
    ) {
      return {
        kind: "serial-conflict",
      };
    }
  }

  const globalConflict = await transaction.product.findFirst({
    select: {
      id: true,
    },
    where: {
      batchId: {
        not: current.id,
      },
      OR: [
        {
          serialNumber: {
            in: expectedProducts.map((product) => product.serialNumber),
          },
        },
        {
          qrPayload: {
            in: expectedProducts.map((product) => product.qrPayload),
          },
        },
      ],
    },
  });

  if (globalConflict !== null) {
    return {
      kind: "serial-conflict",
    };
  }

  const existingSerials = new Set(current.products.map((product) => product.serialNumber));
  const missingProducts = expectedProducts.filter(
    (product) => !existingSerials.has(product.serialNumber),
  );

  if (missingProducts.length > 0) {
    await transaction.product.createMany({
      data: missingProducts.map((product) => ({
        activatedAt: input.now,
        batchId: current.id,
        qrPayload: product.qrPayload,
        serialNumber: product.serialNumber,
        status: ProductStatus.VERIFIED,
      })),
    });
  }

  await transaction.product.updateMany({
    data: {
      activatedAt: input.now,
      status: ProductStatus.VERIFIED,
    },
    where: {
      batchId: current.id,
      status: {
        in: [ProductStatus.PENDING, ProductStatus.VERIFIED],
      },
    },
  });

  const updated = await transaction.batch.update({
    data: {
      activatedAt: input.now,
      status: BatchStatus.ACTIVE,
    },
    select: batchWorkflowStateSelect,
    where: {
      id: current.id,
    },
  });
  const batch = toWorkflowState(updated);

  await transaction.auditRecord.create({
    data: {
      action: "batch.activated",
      actorEmail: input.actorEmail,
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterData: toJsonObject(batch),
      beforeData: toJsonObject(toWorkflowState(current)),
      entityId: current.id,
      entityType: "Batch",
      organizationId: input.organizationId,
      requestId: input.requestId,
    },
  });

  await storeResponse(transaction, input, batch, 200, `batch:${input.batchId}`);

  return {
    batch,
    kind: "created",
  };
}

async function closeBatch(
  transaction: Prisma.TransactionClient,
  input: Extract<MutateBatchInput, { action: "close" }>,
): Promise<MutateBatchResult> {
  const current = await transaction.batch.findFirst({
    select: batchWorkflowStateSelect,
    where: {
      id: input.batchId,
      manufacturerOrganizationId: input.organizationId,
    },
  });

  if (current === null) {
    return {
      kind: "batch-not-found",
    };
  }

  if (current.status !== BatchStatus.ACTIVE) {
    return {
      kind: "invalid-transition",
    };
  }

  const updated = await transaction.batch.update({
    data: {
      status: BatchStatus.CLOSED,
    },
    select: batchWorkflowStateSelect,
    where: {
      id: current.id,
    },
  });
  const batch = toWorkflowState(updated);

  await transaction.auditRecord.create({
    data: {
      action: "batch.closed",
      actorEmail: input.actorEmail,
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterData: toJsonObject(batch),
      beforeData: toJsonObject(toWorkflowState(current)),
      entityId: current.id,
      entityType: "Batch",
      organizationId: input.organizationId,
      requestId: input.requestId,
    },
  });

  await storeResponse(transaction, input, batch, 200, `batch:${input.batchId}`);

  return {
    batch,
    kind: "created",
  };
}

export const batchWorkflowRepository: BatchWorkflowRepository = {
  async mutate(input) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const scope = input.action === "create" ? "batch:create" : `batch:${input.batchId}`;
          const entityLockKey =
            input.action === "create"
              ? `batch-identity:${input.code}:${input.lotNumber}`
              : input.batchId;

          await acquireLock(
            transaction,
            input.organizationId,
            `idempotency:${scope}:${input.idempotencyKey}`,
          );
          await acquireLock(transaction, input.organizationId, entityLockKey);

          const replay = await readReplay(transaction, input, scope);

          if (replay !== null) {
            return replay;
          }

          switch (input.action) {
            case "activate":
              return activateBatch(transaction, input);
            case "close":
              return closeBatch(transaction, input);
            case "create":
              return createBatch(transaction, input);
          }
        },
        {
          maxWait: 10_000,
          timeout: 20_000,
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (input.action === "activate") {
          return {
            kind: "serial-conflict",
          };
        }

        if (input.action === "create") {
          return {
            kind: "identity-conflict",
          };
        }
      }

      throw error;
    }
  },
};
