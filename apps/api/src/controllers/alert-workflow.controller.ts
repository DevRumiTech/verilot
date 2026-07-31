import type { AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { alertWorkflowService } from "../services/alert-workflow.service.js";
import { toFieldErrors } from "../validation/zod.js";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "The idempotency key is too short.")
  .max(120, "The idempotency key is too long.")
  .regex(/^[A-Za-z0-9._:-]+$/, "The idempotency key contains unsupported characters.");

const alertParamsSchema = z.object({
  alertId: z.string().uuid("Enter a valid alert identifier."),
});

const assignAlertBodySchema = z.object({
  assignedToId: z.string().uuid("Enter a valid assignee identifier."),
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(1000).optional(),
});

const decideAlertBodySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reviewNotes: z.string().trim().min(1).max(2000),
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
      "The alert workflow request is invalid.",
      toFieldErrors(error),
    ),
  );
}

export async function assignAlert(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsedParams = alertParamsSchema.safeParse(request.params);
  const parsedBody = assignAlertBodySchema.safeParse(request.body);

  if (!parsedParams.success) {
    rejectValidation(next, parsedParams.error);
    return;
  }

  if (!parsedBody.success) {
    rejectValidation(next, parsedBody.error);
    return;
  }

  try {
    const result = await alertWorkflowService.mutateAlert(readSession(request), {
      action: "assign",
      alertId: parsedParams.data.alertId,
      assignedToId: parsedBody.data.assignedToId,
      idempotencyKey: parsedBody.data.idempotencyKey,
      requestId: String(request.id),
      ...(parsedBody.data.reason === undefined ? {} : { reason: parsedBody.data.reason }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

function decideAlert(action: "dismiss" | "resolve") {
  return async function decideAlertHandler(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const parsedParams = alertParamsSchema.safeParse(request.params);
    const parsedBody = decideAlertBodySchema.safeParse(request.body);

    if (!parsedParams.success) {
      rejectValidation(next, parsedParams.error);
      return;
    }

    if (!parsedBody.success) {
      rejectValidation(next, parsedBody.error);
      return;
    }

    try {
      const result = await alertWorkflowService.mutateAlert(readSession(request), {
        action,
        alertId: parsedParams.data.alertId,
        idempotencyKey: parsedBody.data.idempotencyKey,
        requestId: String(request.id),
        reviewNotes: parsedBody.data.reviewNotes,
      });

      response.status(200).json({
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const dismissAlert = decideAlert("dismiss");
export const resolveAlert = decideAlert("resolve");
