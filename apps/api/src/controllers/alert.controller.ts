import {
  ALERT_RULES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type AuthSessionResponse,
} from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { alertService } from "../services/alert.service.js";
import { toFieldErrors } from "../validation/zod.js";

const alertListQuerySchema = z.object({
  assignedToId: z.string().uuid("Enter a valid assignee identifier.").optional(),
  batchId: z.string().uuid("Enter a valid batch identifier.").optional(),
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  productId: z.string().uuid("Enter a valid product identifier.").optional(),
  rule: z.enum(ALERT_RULES).optional(),
  search: z.string().trim().max(100).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  status: z.enum(ALERT_STATUSES).optional(),
});

const alertParamsSchema = z.object({
  alertId: z.string().uuid("Enter a valid alert identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getAlert(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = alertParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The alert request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await alertService.getAlert(readSession(request), parsed.data.alertId);

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listAlerts(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = alertListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The alert list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await alertService.listAlerts(readSession(request), {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.assignedToId === undefined ? {} : { assignedToId: parsed.data.assignedToId }),
      ...(parsed.data.batchId === undefined ? {} : { batchId: parsed.data.batchId }),
      ...(parsed.data.productId === undefined ? {} : { productId: parsed.data.productId }),
      ...(parsed.data.rule === undefined ? {} : { rule: parsed.data.rule }),
      ...(parsed.data.search === undefined ? {} : { search: parsed.data.search }),
      ...(parsed.data.severity === undefined ? {} : { severity: parsed.data.severity }),
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
