import {
  EVENT_TYPES,
  TRANSPORT_MODES,
  type AuthSessionResponse,
  type JsonPrimitive,
} from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { custodyEventService } from "../services/custody-event.service.js";
import { toFieldErrors } from "../validation/zod.js";

const metadataValueSchema = z.union([z.boolean(), z.null(), z.number(), z.string()]);

const eventBodySchema = z
  .object({
    correctedEventId: z.string().uuid("Enter a valid corrected event identifier.").optional(),
    eventAt: z.string().datetime({
      offset: true,
    }),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, "The idempotency key is too short.")
      .max(120, "The idempotency key is too long.")
      .regex(/^[A-Za-z0-9._:-]+$/, "The idempotency key contains unsupported characters."),
    locationId: z.string().uuid("Enter a valid location identifier.").optional(),
    metadata: z.record(z.string(), metadataValueSchema).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    shipmentReference: z.string().trim().min(1).max(100).optional(),
    transportMode: z.enum(TRANSPORT_MODES).optional(),
    type: z.enum(EVENT_TYPES),
  })
  .superRefine((value, context) => {
    if (value.type === "CORRECTION" && value.correctedEventId === undefined) {
      context.addIssue({
        code: "custom",
        message: "A correction event requires a corrected event identifier.",
        path: ["correctedEventId"],
      });
    }

    if (value.type !== "CORRECTION" && value.correctedEventId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only correction events accept a corrected event identifier.",
        path: ["correctedEventId"],
      });
    }

    if (value.type === "BLOCKED" && value.notes === undefined) {
      context.addIssue({
        code: "custom",
        message: "A blocked event requires notes.",
        path: ["notes"],
      });
    }
  });

const eventParamsSchema = z.object({
  productId: z.string().uuid("Enter a valid product identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function createProductEvent(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsedParams = eventParamsSchema.safeParse(request.params);
  const parsedBody = eventBodySchema.safeParse(request.body);

  if (!parsedParams.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The product event request is invalid.",
        toFieldErrors(parsedParams.error),
      ),
    );
    return;
  }

  if (!parsedBody.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The product event request is invalid.",
        toFieldErrors(parsedBody.error),
      ),
    );
    return;
  }

  try {
    const metadata: Readonly<Record<string, JsonPrimitive>> | undefined = parsedBody.data.metadata;

    const result = await custodyEventService.createProductEvent(readSession(request), {
      eventAt: new Date(parsedBody.data.eventAt),
      idempotencyKey: parsedBody.data.idempotencyKey,
      productId: parsedParams.data.productId,
      requestId: String(request.id),
      type: parsedBody.data.type,
      ...(parsedBody.data.correctedEventId === undefined
        ? {}
        : {
            correctedEventId: parsedBody.data.correctedEventId,
          }),
      ...(parsedBody.data.locationId === undefined
        ? {}
        : {
            locationId: parsedBody.data.locationId,
          }),
      ...(metadata === undefined
        ? {}
        : {
            metadata,
          }),
      ...(parsedBody.data.notes === undefined
        ? {}
        : {
            notes: parsedBody.data.notes,
          }),
      ...(parsedBody.data.shipmentReference === undefined
        ? {}
        : {
            shipmentReference: parsedBody.data.shipmentReference,
          }),
      ...(parsedBody.data.transportMode === undefined
        ? {}
        : {
            transportMode: parsedBody.data.transportMode,
          }),
    });

    response.status(result.replayed ? 200 : 201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
