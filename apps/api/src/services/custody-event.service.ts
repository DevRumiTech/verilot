import { createHash } from "node:crypto";

import type {
  AuthSessionResponse,
  EventType,
  JsonPrimitive,
  ProductCustodyEvent,
  ProductEventMutationResponse,
  TransportMode,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  custodyEventRepository,
  type CreateCustodyEventInput,
  type CustodyEventRecord,
  type CustodyEventRepository,
} from "../repositories/custody-event.repository.js";

export interface CreateProductEventInput {
  correctedEventId?: string;
  eventAt: Date;
  idempotencyKey: string;
  locationId?: string;
  metadata?: Readonly<Record<string, JsonPrimitive>>;
  notes?: string;
  now?: Date;
  productId: string;
  requestId: string;
  shipmentReference?: string;
  transportMode?: TransportMode;
  type: EventType;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeValue(entryValue)]);

    return Object.fromEntries(entries);
  }

  return value;
}

function hashRequest(input: CreateProductEventInput): string {
  const normalized = normalizeValue({
    ...(input.correctedEventId === undefined
      ? {}
      : {
          correctedEventId: input.correctedEventId,
        }),
    eventAt: input.eventAt.toISOString(),
    idempotencyKey: input.idempotencyKey,
    ...(input.locationId === undefined
      ? {}
      : {
          locationId: input.locationId,
        }),
    ...(input.metadata === undefined
      ? {}
      : {
          metadata: input.metadata,
        }),
    ...(input.notes === undefined
      ? {}
      : {
          notes: input.notes,
        }),
    productId: input.productId,
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
  });

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function toCustodyEvent(event: CustodyEventRecord): ProductCustodyEvent {
  return {
    actor:
      event.actor === null
        ? null
        : {
            displayName: event.actor.displayName,
          },
    eventAt: event.eventAt.toISOString(),
    id: event.id,
    location:
      event.location === null
        ? null
        : {
            canton: event.location.canton,
            countryCode: event.location.countryCode,
            municipality: event.location.municipality,
            name: event.location.name,
          },
    notes: event.notes,
    organization: {
      name: event.organization.name,
      type: event.organization.type,
    },
    recordedAt: event.recordedAt.toISOString(),
    shipmentReference: event.shipmentReference,
    transportMode: event.transportMode,
    type: event.type,
  };
}

export class CustodyEventService {
  public constructor(private readonly repository: CustodyEventRepository) {}

  public async createProductEvent(
    session: AuthSessionResponse,
    input: CreateProductEventInput,
  ): Promise<ProductEventMutationResponse> {
    const now = input.now ?? new Date();

    if (input.eventAt.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw new ApiError(400, "EVENT_TIME_INVALID", "The event time is too far in the future.");
    }

    const repositoryInput: CreateCustodyEventInput = {
      actorEmail: session.user.email,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventAt: input.eventAt,
      idempotencyKey: input.idempotencyKey,
      now,
      organizationId: session.user.organization.id,
      productId: input.productId,
      requestHash: hashRequest(input),
      requestId: input.requestId,
      type: input.type,
      ...(input.correctedEventId === undefined
        ? {}
        : {
            correctedEventId: input.correctedEventId,
          }),
      ...(input.locationId === undefined
        ? {}
        : {
            locationId: input.locationId,
          }),
      ...(input.metadata === undefined
        ? {}
        : {
            metadata: input.metadata,
          }),
      ...(input.notes === undefined
        ? {}
        : {
            notes: input.notes,
          }),
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
    };

    const result = await this.repository.create(repositoryInput);

    switch (result.kind) {
      case "product-not-found":
        throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
      case "location-not-found":
        throw new ApiError(404, "LOCATION_NOT_FOUND", "Location not found.");
      case "corrected-event-not-found":
        throw new ApiError(404, "CORRECTED_EVENT_NOT_FOUND", "The corrected event was not found.");
      case "idempotency-conflict":
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used with different data.",
        );
      case "invalid-transition":
        throw new ApiError(
          409,
          "INVALID_PRODUCT_TRANSITION",
          result.message ?? "The product transition is invalid.",
        );
      case "created":
      case "replayed":
        return {
          event: toCustodyEvent(result.event),
          productStatus: result.productStatus,
          replayed: result.kind === "replayed",
        };
    }
  }
}

export const custodyEventService = new CustodyEventService(custodyEventRepository);
