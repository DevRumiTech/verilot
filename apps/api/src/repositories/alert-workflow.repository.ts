import { ALERT_STATUSES, type AlertWorkflowState, type UserRole } from "@verilot/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { AlertStatus, UserStatus } from "../generated/prisma/enums.js";

import { prisma } from "../config/database.js";

const alertWorkflowStateSelect = {
  assignedTo: {
    select: {
      displayName: true,
      id: true,
    },
  },
  decisionAt: true,
  id: true,
  resolvedBy: {
    select: {
      displayName: true,
      id: true,
    },
  },
  reviewNotes: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.AlertSelect;

type AlertWorkflowStateRecord = Prisma.AlertGetPayload<{
  select: typeof alertWorkflowStateSelect;
}>;

interface AlertWorkflowCommonInput {
  actorEmail: string;
  actorId: string;
  actorRole: UserRole;
  alertId: string;
  idempotencyKey: string;
  now: Date;
  organizationId: string;
  requestHash: string;
  requestId: string;
}

export type MutateAlertInput =
  | (AlertWorkflowCommonInput & {
      action: "assign";
      assignedToId: string;
      reason?: string;
    })
  | (AlertWorkflowCommonInput & {
      action: "dismiss" | "resolve";
      reviewNotes: string;
    });

export type MutateAlertResult =
  | {
      alert: AlertWorkflowState;
      kind: "created" | "replayed";
    }
  | {
      kind:
        | "alert-not-found"
        | "assignment-target-not-found"
        | "idempotency-conflict"
        | "invalid-transition";
    };

export interface AlertWorkflowRepository {
  mutate(input: MutateAlertInput): Promise<MutateAlertResult>;
}

function toWorkflowState(alert: AlertWorkflowStateRecord): AlertWorkflowState {
  return {
    assignedTo:
      alert.assignedTo === null
        ? null
        : {
            displayName: alert.assignedTo.displayName,
            id: alert.assignedTo.id,
          },
    decisionAt: alert.decisionAt?.toISOString() ?? null,
    id: alert.id,
    resolvedBy:
      alert.resolvedBy === null
        ? null
        : {
            displayName: alert.resolvedBy.displayName,
            id: alert.resolvedBy.id,
          },
    reviewNotes: alert.reviewNotes,
    status: alert.status,
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function readUserReference(value: unknown):
  | {
      displayName: string;
      id: string;
    }
  | null
  | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const displayName = Reflect.get(value, "displayName");
  const id = Reflect.get(value, "id");

  if (typeof displayName !== "string" || typeof id !== "string") {
    return undefined;
  }

  return {
    displayName,
    id,
  };
}

function readStoredResponse(value: Prisma.JsonValue): AlertWorkflowState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const alert = value.alert;

  if (alert === null || typeof alert !== "object" || Array.isArray(alert)) {
    return null;
  }

  const assignedTo = readUserReference(alert.assignedTo);
  const decisionAt = alert.decisionAt;
  const id = alert.id;
  const resolvedBy = readUserReference(alert.resolvedBy);
  const reviewNotes = alert.reviewNotes;
  const status = alert.status;
  const updatedAt = alert.updatedAt;

  if (
    assignedTo === undefined ||
    resolvedBy === undefined ||
    (decisionAt !== null && typeof decisionAt !== "string") ||
    typeof id !== "string" ||
    (reviewNotes !== null && typeof reviewNotes !== "string") ||
    typeof status !== "string" ||
    !ALERT_STATUSES.includes(status as AlertWorkflowState["status"]) ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return {
    assignedTo,
    decisionAt,
    id,
    resolvedBy,
    reviewNotes,
    status: status as AlertWorkflowState["status"],
    updatedAt,
  };
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function isClosed(status: AlertWorkflowState["status"]): boolean {
  return status === AlertStatus.DISMISSED || status === AlertStatus.RESOLVED;
}

export const alertWorkflowRepository: AlertWorkflowRepository = {
  async mutate(input) {
    return prisma.$transaction(
      async (transaction) => {
        const scope = `alert:${input.alertId}`;

        await transaction.$queryRaw<
          Array<{
            lockResult: string | null;
          }>
        >(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtext(${input.organizationId}),
              hashtext(${input.alertId})
            )::text AS "lockResult"
          `,
        );

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

          const storedAlert = readStoredResponse(stored.responseBody);

          if (storedAlert === null) {
            return {
              kind: "idempotency-conflict",
            };
          }

          return {
            alert: storedAlert,
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

        const current = await transaction.alert.findFirst({
          select: alertWorkflowStateSelect,
          where: {
            id: input.alertId,
            organizationId: input.organizationId,
          },
        });

        if (current === null) {
          return {
            kind: "alert-not-found",
          };
        }

        if (isClosed(current.status)) {
          return {
            kind: "invalid-transition",
          };
        }

        if (input.action === "assign") {
          const assignmentTarget = await transaction.user.findFirst({
            select: {
              id: true,
            },
            where: {
              id: input.assignedToId,
              organizationId: input.organizationId,
              status: UserStatus.ACTIVE,
            },
          });

          if (assignmentTarget === null) {
            return {
              kind: "assignment-target-not-found",
            };
          }
        }

        const beforeData = toJsonObject(toWorkflowState(current));
        const updated = await transaction.alert.update({
          data:
            input.action === "assign"
              ? {
                  assignedToId: input.assignedToId,
                  status:
                    current.status === AlertStatus.OPEN ? AlertStatus.IN_REVIEW : current.status,
                }
              : {
                  decisionAt: input.now,
                  resolvedById: input.actorId,
                  reviewNotes: input.reviewNotes,
                  status: input.action === "resolve" ? AlertStatus.RESOLVED : AlertStatus.DISMISSED,
                },
          select: alertWorkflowStateSelect,
          where: {
            id: current.id,
          },
        });
        const alert = toWorkflowState(updated);

        const auditAction =
          input.action === "assign"
            ? "alert.assigned"
            : input.action === "resolve"
              ? "alert.resolved"
              : "alert.dismissed";

        await transaction.auditRecord.create({
          data: {
            action: auditAction,
            actorEmail: input.actorEmail,
            actorId: input.actorId,
            actorRole: input.actorRole,
            afterData: toJsonObject(alert),
            beforeData,
            entityId: current.id,
            entityType: "Alert",
            organizationId: input.organizationId,
            ...(input.action === "assign"
              ? input.reason === undefined
                ? {}
                : {
                    reason: input.reason,
                  }
              : {
                  reason: input.reviewNotes,
                }),
            requestId: input.requestId,
          },
        });

        await transaction.idempotencyRecord.create({
          data: {
            expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
            key: input.idempotencyKey,
            organizationId: input.organizationId,
            requestHash: input.requestHash,
            responseBody: toJsonObject({
              alert,
            }),
            responseStatus: 200,
            scope,
          },
        });

        return {
          alert,
          kind: "created",
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
  },
};
