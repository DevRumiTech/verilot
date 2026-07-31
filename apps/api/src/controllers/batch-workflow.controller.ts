import { MAX_BATCH_PRODUCT_COUNT, type AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { batchWorkflowService } from "../services/batch-workflow.service.js";
import { toFieldErrors } from "../validation/zod.js";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "The idempotency key is too short.")
  .max(120, "The idempotency key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "The idempotency key contains unsupported characters.");

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

const batchParamsSchema = z.object({
  batchId: z.string().uuid("Enter a valid batch identifier."),
});

const createBatchBodySchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    expiresAt: dateOnlySchema.optional(),
    idempotencyKey: idempotencyKeySchema,
    lotNumber: z.string().trim().min(1).max(80),
    manufacturedAt: dateOnlySchema,
    productName: z.string().trim().min(1).max(160),
    serialEnd: z.number().int().positive().max(999_999),
    serialPrefix: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dots, underscores, or dashes."),
    serialStart: z.number().int().positive().max(999_999),
    sku: z.string().trim().min(1).max(80),
  })
  .superRefine((input, context) => {
    if (input.serialEnd < input.serialStart) {
      context.addIssue({
        code: "custom",
        message: "The serial range end must not be less than its start.",
        path: ["serialEnd"],
      });
    } else if (input.serialEnd - input.serialStart + 1 > MAX_BATCH_PRODUCT_COUNT) {
      context.addIssue({
        code: "custom",
        message: `A batch cannot generate more than ${MAX_BATCH_PRODUCT_COUNT} products.`,
        path: ["serialEnd"],
      });
    }

    if (
      input.expiresAt !== undefined &&
      new Date(`${input.expiresAt}T00:00:00.000Z`) <=
        new Date(`${input.manufacturedAt}T00:00:00.000Z`)
    ) {
      context.addIssue({
        code: "custom",
        message: "The expiry date must be after the manufacturing date.",
        path: ["expiresAt"],
      });
    }
  });

const changeBatchStatusBodySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

function rejectValidation(next: NextFunction, error: z.ZodError): void {
  next(
    new ApiError(
      400,
      "VALIDATION_ERROR",
      "The batch workflow request is invalid.",
      toFieldErrors(error),
    ),
  );
}

export async function createBatch(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = createBatchBodySchema.safeParse(request.body);

  if (!parsed.success) {
    rejectValidation(next, parsed.error);
    return;
  }

  try {
    const result = await batchWorkflowService.mutateBatch(readSession(request), {
      action: "create",
      code: parsed.data.code,
      idempotencyKey: parsed.data.idempotencyKey,
      lotNumber: parsed.data.lotNumber,
      manufacturedAt: new Date(`${parsed.data.manufacturedAt}T00:00:00.000Z`),
      productName: parsed.data.productName,
      requestId: String(request.id),
      serialEnd: parsed.data.serialEnd,
      serialPrefix: parsed.data.serialPrefix,
      serialStart: parsed.data.serialStart,
      sku: parsed.data.sku,
      ...(parsed.data.expiresAt === undefined
        ? {}
        : {
            expiresAt: new Date(`${parsed.data.expiresAt}T00:00:00.000Z`),
          }),
    });

    response.status(201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

function changeBatchStatus(action: "activate" | "close") {
  return async function changeBatchStatusHandler(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const parsedParams = batchParamsSchema.safeParse(request.params);
    const parsedBody = changeBatchStatusBodySchema.safeParse(request.body);

    if (!parsedParams.success) {
      rejectValidation(next, parsedParams.error);
      return;
    }

    if (!parsedBody.success) {
      rejectValidation(next, parsedBody.error);
      return;
    }

    try {
      const result = await batchWorkflowService.mutateBatch(readSession(request), {
        action,
        batchId: parsedParams.data.batchId,
        idempotencyKey: parsedBody.data.idempotencyKey,
        requestId: String(request.id),
      });

      response.status(200).json({
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const activateBatch = changeBatchStatus("activate");
export const closeBatch = changeBatchStatus("close");
