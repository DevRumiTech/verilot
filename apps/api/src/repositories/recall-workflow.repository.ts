import { RECALL_STATUSES, type RecallWorkflowState, type UserRole } from "@verilot/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { BatchStatus, ProductStatus, RecallStatus } from "../generated/prisma/enums.js";

import { prisma } from "../config/database.js";

const recallWorkflowStateSelect = {
  announcedAt: true,
  batchId: true,
  completedAt: true,
  id: true,
  reference: true,
  status: true,
} satisfies Prisma.RecallSelect;

type RecallWorkflowStateRecord = Prisma.RecallGetPayload<{
  select: typeof recallWorkflowStateSelect;
}>;

interface RecallWorkflowCommonInput {
  actorEmail: string;
  actorId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  now: Date;
  organizationId: string;
  requestHash: string;
  requestId: string;
}

export type MutateRecallInput =
  | (RecallWorkflowCommonInput & {
      action: "create";
      batchId: string;
      reason: string;
      reference: string;
    })
  | (RecallWorkflowCommonInput & {
      action: "complete";
      recallId: string;
    });

export type MutateRecallResult =
  | {
      kind: "created" | "replayed";
      recall: RecallWorkflowState;
    }
  | {
      kind:
        | "batch-not-found"
        | "idempotency-conflict"
        | "invalid-transition"
        | "recall-not-found"
        | "reference-conflict";
    };

export interface RecallWorkflowRepository {
  mutate(input: MutateRecallInput): Promise<MutateRecallResult>;
}

function toWorkflowState(recall: RecallWorkflowStateRecord): RecallWorkflowState {
  return {
    announcedAt: recall.announcedAt.toISOString(),
    batchId: recall.batchId,
    completedAt: recall.completedAt?.toISOString() ?? null,
    id: recall.id,
    reference: recall.reference,
    status: recall.status,
  };
}

function readStoredResponse(value: Prisma.JsonValue): RecallWorkflowState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const recall = value.recall;

  if (recall === null || typeof recall !== "object" || Array.isArray(recall)) {
    return null;
  }

  const announcedAt = recall.announcedAt;
  const batchId = recall.batchId;
  const completedAt = recall.completedAt;
  const id = recall.id;
  const reference = recall.reference;
  const status = recall.status;

  if (
    typeof announcedAt !== "string" ||
    typeof batchId !== "string" ||
    (completedAt !== null && typeof completedAt !== "string") ||
    typeof id !== "string" ||
    typeof reference !== "string" ||
    typeof status !== "string" ||
    !RECALL_STATUSES.includes(status as RecallWorkflowState["status"])
  ) {
    return null;
  }

  return {
    announcedAt,
    batchId,
    completedAt,
    id,
    reference,
    status: status as RecallWorkflowState["status"],
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
  input: MutateRecallInput,
  scope: string,
): Promise<MutateRecallResult | null> {
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

    const recall = readStoredResponse(stored.responseBody);

    if (recall === null) {
      return {
        kind: "idempotency-conflict",
      };
    }

    return {
      kind: "replayed",
      recall,
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
  input: MutateRecallInput,
  recall: RecallWorkflowState,
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
        recall,
      }),
      responseStatus,
      scope,
    },
  });
}

async function createRecall(
  transaction: Prisma.TransactionClient,
  input: Extract<MutateRecallInput, { action: "create" }>,
): Promise<MutateRecallResult> {
  const existingReference = await transaction.recall.findUnique({
    select: {
      id: true,
    },
    where: {
      reference: input.reference,
    },
  });

  if (existingReference !== null) {
    return {
      kind: "reference-conflict",
    };
  }

  const batch = await transaction.batch.findFirst({
    select: {
      id: true,
      status: true,
    },
    where: {
      id: input.batchId,
      manufacturerOrganizationId: input.organizationId,
    },
  });

  if (batch === null) {
    return {
      kind: "batch-not-found",
    };
  }

  if (batch.status !== BatchStatus.ACTIVE) {
    return {
      kind: "invalid-transition",
    };
  }

  const created = await transaction.recall.create({
    data: {
      announcedAt: input.now,
      batchId: batch.id,
      createdById: input.actorId,
      organizationId: input.organizationId,
      reason: input.reason,
      reference: input.reference,
      requestId: input.requestId,
      status: RecallStatus.ACTIVE,
    },
    select: recallWorkflowStateSelect,
  });

  await transaction.batch.update({
    data: {
      status: BatchStatus.RECALLED,
    },
    where: {
      id: batch.id,
    },
  });

  await transaction.product.updateMany({
    data: {
      status: ProductStatus.RECALLED,
    },
    where: {
      batchId: batch.id,
      status: {
        in: [
          ProductStatus.PENDING,
          ProductStatus.VERIFIED,
          ProductStatus.WARNING,
          ProductStatus.BLOCKED,
        ],
      },
    },
  });

  const recall = toWorkflowState(created);

  await transaction.auditRecord.create({
    data: {
      action: "recall.created",
      actorEmail: input.actorEmail,
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterData: toJsonObject(recall),
      entityId: recall.id,
      entityType: "Recall",
      organizationId: input.organizationId,
      reason: input.reason,
      requestId: input.requestId,
    },
  });

  await storeResponse(transaction, input, recall, 201, "recall:create");

  return {
    kind: "created",
    recall,
  };
}

async function completeRecall(
  transaction: Prisma.TransactionClient,
  input: Extract<MutateRecallInput, { action: "complete" }>,
): Promise<MutateRecallResult> {
  const current = await transaction.recall.findFirst({
    select: recallWorkflowStateSelect,
    where: {
      id: input.recallId,
      organizationId: input.organizationId,
    },
  });

  if (current === null) {
    return {
      kind: "recall-not-found",
    };
  }

  if (current.status !== RecallStatus.ACTIVE) {
    return {
      kind: "invalid-transition",
    };
  }

  const updated = await transaction.recall.update({
    data: {
      completedAt: input.now,
      status: RecallStatus.COMPLETED,
    },
    select: recallWorkflowStateSelect,
    where: {
      id: current.id,
    },
  });
  const recall = toWorkflowState(updated);

  await transaction.auditRecord.create({
    data: {
      action: "recall.completed",
      actorEmail: input.actorEmail,
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterData: toJsonObject(recall),
      beforeData: toJsonObject(toWorkflowState(current)),
      entityId: current.id,
      entityType: "Recall",
      organizationId: input.organizationId,
      requestId: input.requestId,
    },
  });

  await storeResponse(transaction, input, recall, 200, `recall:${input.recallId}`);

  return {
    kind: "created",
    recall,
  };
}

export const recallWorkflowRepository: RecallWorkflowRepository = {
  async mutate(input) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const scope = input.action === "create" ? "recall:create" : `recall:${input.recallId}`;
          const entityLockKey =
            input.action === "create" ? `recall-reference:${input.reference}` : input.recallId;

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

          return input.action === "create"
            ? createRecall(transaction, input)
            : completeRecall(transaction, input);
        },
        {
          maxWait: 10_000,
          timeout: 20_000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        input.action === "create"
      ) {
        return {
          kind: "reference-conflict",
        };
      }

      throw error;
    }
  },
};
