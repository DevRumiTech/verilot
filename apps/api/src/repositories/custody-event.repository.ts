import type {
  EventType,
  JsonPrimitive,
  ProductStatus as ProductStatusValue,
  TransportMode,
} from "@verilot/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { ProductStatus } from "../generated/prisma/enums.js";

import { prisma } from "../config/database.js";

const custodyEventSelect = {
  actor: {
    select: {
      displayName: true,
    },
  },
  eventAt: true,
  id: true,
  location: {
    select: {
      canton: true,
      countryCode: true,
      municipality: true,
      name: true,
    },
  },
  notes: true,
  organization: {
    select: {
      name: true,
      type: true,
    },
  },
  recordedAt: true,
  shipmentReference: true,
  transportMode: true,
  type: true,
} satisfies Prisma.CustodyEventSelect;

export type CustodyEventRecord = Prisma.CustodyEventGetPayload<{
  select: typeof custodyEventSelect;
}>;

export interface CreateCustodyEventInput {
  actorEmail: string;
  actorId: string;
  actorRole: "ADMINISTRATOR" | "INSPECTOR" | "OPERATOR";
  correctedEventId?: string;
  eventAt: Date;
  idempotencyKey: string;
  locationId?: string;
  metadata?: Readonly<Record<string, JsonPrimitive>>;
  notes?: string;
  now: Date;
  organizationId: string;
  productId: string;
  requestHash: string;
  requestId: string;
  shipmentReference?: string;
  transportMode?: TransportMode;
  type: EventType;
}

export type CreateCustodyEventResult =
  | {
      event: CustodyEventRecord;
      kind: "created" | "replayed";
      productStatus: ProductStatusValue;
    }
  | {
      kind:
        | "corrected-event-not-found"
        | "idempotency-conflict"
        | "invalid-transition"
        | "location-not-found"
        | "product-not-found";
      message?: string;
    };

type CustodyEventTransactionResult =
  | {
      eventId: string;
      kind: "created" | "replayed";
      productStatus: ProductStatusValue;
    }
  | {
      kind:
        | "corrected-event-not-found"
        | "idempotency-conflict"
        | "invalid-transition"
        | "location-not-found"
        | "product-not-found";
      message?: string;
    };

export interface CustodyEventRepository {
  create(input: CreateCustodyEventInput): Promise<CreateCustodyEventResult>;
}

function isProductStatus(value: unknown): value is ProductStatusValue {
  return (
    typeof value === "string" && Object.values(ProductStatus).includes(value as ProductStatusValue)
  );
}

function readStoredResponse(value: Prisma.JsonValue): {
  eventId: string;
  productStatus: ProductStatusValue;
} | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const eventId = value.eventId;
  const productStatus = value.productStatus;

  if (typeof eventId !== "string" || !isProductStatus(productStatus)) {
    return null;
  }

  return {
    eventId,
    productStatus,
  };
}

function resolveProductStatus(
  currentStatus: ProductStatusValue,
  type: EventType,
):
  | {
      kind: "ok";
      status: ProductStatusValue;
    }
  | {
      kind: "invalid";
      message: string;
    } {
  if (currentStatus === ProductStatus.DESTROYED && type !== "CORRECTION") {
    return {
      kind: "invalid",
      message: "Destroyed products only accept correction events.",
    };
  }

  if (type === "RELEASED" && currentStatus !== ProductStatus.BLOCKED) {
    return {
      kind: "invalid",
      message: "Only blocked products can be released.",
    };
  }

  if (
    type === "BLOCKED" &&
    (currentStatus === ProductStatus.RECALLED || currentStatus === ProductStatus.DESTROYED)
  ) {
    return {
      kind: "invalid",
      message: "This product cannot be blocked.",
    };
  }

  switch (type) {
    case "BLOCKED":
      return {
        kind: "ok",
        status: ProductStatus.BLOCKED,
      };
    case "DESTROYED":
      return {
        kind: "ok",
        status: ProductStatus.DESTROYED,
      };
    case "RECALLED":
      return {
        kind: "ok",
        status: ProductStatus.RECALLED,
      };
    case "RELEASED":
      return {
        kind: "ok",
        status: ProductStatus.VERIFIED,
      };
    default:
      return {
        kind: "ok",
        status: currentStatus,
      };
  }
}

function toJsonValue(value: Readonly<Record<string, JsonPrimitive>>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

export const custodyEventRepository: CustodyEventRepository = {
  async create(input) {
    const result: CustodyEventTransactionResult = await prisma.$transaction(
      async (transaction): Promise<CustodyEventTransactionResult> => {
        const scope = `custody-event:${input.productId}`;

        await acquireLock(
          transaction,
          input.organizationId,
          `idempotency:${scope}:${input.idempotencyKey}`,
        );
        await acquireLock(transaction, input.organizationId, input.productId);

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

          const storedResponse = readStoredResponse(stored.responseBody);

          if (storedResponse === null) {
            return {
              kind: "idempotency-conflict",
            };
          }

          const event = await transaction.custodyEvent.findUnique({
            select: {
              id: true,
            },
            where: {
              id: storedResponse.eventId,
            },
          });

          if (event === null) {
            return {
              kind: "idempotency-conflict",
            };
          }

          return {
            eventId: event.id,
            kind: "replayed",
            productStatus: storedResponse.productStatus,
          };
        }

        if (stored !== null) {
          await transaction.idempotencyRecord.delete({
            where: {
              id: stored.id,
            },
          });
        }

        const product = await transaction.product.findFirst({
          select: {
            id: true,
            status: true,
          },
          where: {
            id: input.productId,
            batch: {
              manufacturerOrganizationId: input.organizationId,
            },
          },
        });

        if (product === null) {
          return {
            kind: "product-not-found",
          };
        }

        if (input.locationId !== undefined) {
          const location = await transaction.location.findFirst({
            select: {
              id: true,
            },
            where: {
              id: input.locationId,
              isKnown: true,
              OR: [
                {
                  organizationId: input.organizationId,
                },
                {
                  organizationId: null,
                },
              ],
            },
          });

          if (location === null) {
            return {
              kind: "location-not-found",
            };
          }
        }

        if (input.correctedEventId !== undefined) {
          const correctedEvent = await transaction.custodyEvent.findFirst({
            select: {
              id: true,
            },
            where: {
              id: input.correctedEventId,
              organizationId: input.organizationId,
              productId: product.id,
            },
          });

          if (correctedEvent === null) {
            return {
              kind: "corrected-event-not-found",
            };
          }
        }

        const transition = resolveProductStatus(product.status, input.type);

        if (transition.kind === "invalid") {
          return {
            kind: "invalid-transition",
            message: transition.message,
          };
        }

        const event = await transaction.custodyEvent.create({
          data: {
            actorId: input.actorId,
            ...(input.correctedEventId === undefined
              ? {}
              : {
                  correctedEventId: input.correctedEventId,
                }),
            eventAt: input.eventAt,
            idempotencyKey: input.idempotencyKey,
            ...(input.locationId === undefined
              ? {}
              : {
                  locationId: input.locationId,
                }),
            ...(input.metadata === undefined
              ? {}
              : {
                  metadata: toJsonValue(input.metadata),
                }),
            ...(input.notes === undefined
              ? {}
              : {
                  notes: input.notes,
                }),
            organizationId: input.organizationId,
            productId: product.id,
            requestId: input.requestId,
            ...(input.shipmentReference === undefined
              ? {}
              : {
                  shipmentReference: input.shipmentReference,
                }),
            ...(input.transportMode === undefined
              ? {}
              : {
                  transportMode: input.transportMode,
                }),
            type: input.type,
          },
          select: {
            eventAt: true,
            id: true,
            type: true,
          },
        });

        if (input.type === "BLOCKED") {
          await transaction.product.update({
            data: {
              blockedAt: input.eventAt,
              blockReason: input.notes ?? "Product blocked.",
              status: transition.status,
            },
            where: {
              id: product.id,
            },
          });
        } else if (input.type === "RELEASED") {
          await transaction.product.update({
            data: {
              blockedAt: null,
              blockReason: null,
              status: transition.status,
            },
            where: {
              id: product.id,
            },
          });
        } else if (transition.status !== product.status) {
          await transaction.product.update({
            data: {
              status: transition.status,
            },
            where: {
              id: product.id,
            },
          });
        }

        const afterData = {
          eventAt: event.eventAt.toISOString(),
          eventId: event.id,
          idempotencyKey: input.idempotencyKey,
          productId: product.id,
          productStatus: transition.status,
          type: event.type,
        } satisfies Prisma.InputJsonObject;

        await transaction.auditRecord.create({
          data: {
            action: "product.custody_event.created",
            actorEmail: input.actorEmail,
            actorId: input.actorId,
            actorRole: input.actorRole,
            afterData,
            entityId: event.id,
            entityType: "CustodyEvent",
            organizationId: input.organizationId,
            ...(input.notes === undefined
              ? {}
              : {
                  reason: input.notes,
                }),
            requestId: input.requestId,
          },
        });

        const responseBody = {
          eventId: event.id,
          productStatus: transition.status,
        } satisfies Prisma.InputJsonObject;

        await transaction.idempotencyRecord.create({
          data: {
            expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
            key: input.idempotencyKey,
            organizationId: input.organizationId,
            requestHash: input.requestHash,
            responseBody,
            responseStatus: 201,
            scope,
          },
        });

        return {
          eventId: event.id,
          kind: "created",
          productStatus: transition.status,
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      },
    );

    if (!("eventId" in result)) {
      return result;
    }

    const event = await prisma.custodyEvent.findUniqueOrThrow({
      select: custodyEventSelect,
      where: {
        id: result.eventId,
      },
    });

    return {
      event,
      kind: result.kind,
      productStatus: result.productStatus,
    };
  },
};
