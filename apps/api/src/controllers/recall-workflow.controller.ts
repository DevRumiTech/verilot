import type { AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { recallWorkflowService } from "../services/recall-workflow.service.js";
import { toFieldErrors } from "../validation/zod.js";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "The idempotency key is too short.")
  .max(120, "The idempotency key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "The idempotency key contains unsupported characters.");

const recallParamsSchema = z.object({
  recallId: z.string().uuid("Enter a valid recall identifier."),
});

const createRecallBodySchema = z.object({
  batchId: z.string().uuid("Enter a valid batch identifier."),
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(1000),
  reference: z.string().trim().min(1).max(60),
});

const completeRecallBodySchema = z.object({
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
      "The recall workflow request is invalid.",
      toFieldErrors(error),
    ),
  );
}

export async function createRecall(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = createRecallBodySchema.safeParse(request.body);

  if (!parsed.success) {
    rejectValidation(next, parsed.error);
    return;
  }

  try {
    const result = await recallWorkflowService.mutateRecall(readSession(request), {
      action: "create",
      batchId: parsed.data.batchId,
      idempotencyKey: parsed.data.idempotencyKey,
      reason: parsed.data.reason,
      reference: parsed.data.reference,
      requestId: String(request.id),
    });

    response.status(201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function completeRecall(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsedParams = recallParamsSchema.safeParse(request.params);
  const parsedBody = completeRecallBodySchema.safeParse(request.body);

  if (!parsedParams.success) {
    rejectValidation(next, parsedParams.error);
    return;
  }

  if (!parsedBody.success) {
    rejectValidation(next, parsedBody.error);
    return;
  }

  try {
    const result = await recallWorkflowService.mutateRecall(readSession(request), {
      action: "complete",
      idempotencyKey: parsedBody.data.idempotencyKey,
      recallId: parsedParams.data.recallId,
      requestId: String(request.id),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
