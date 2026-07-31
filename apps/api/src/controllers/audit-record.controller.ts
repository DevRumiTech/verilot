import type { AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { auditRecordService } from "../services/audit-record.service.js";
import { toFieldErrors } from "../validation/zod.js";

const isoDateTimeSchema = z.string().datetime({
  message: "Enter a valid ISO date-time.",
  offset: true,
});

const auditRecordListQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(100).optional(),
    actorId: z.string().uuid("Enter a valid actor identifier.").optional(),
    createdFrom: isoDateTimeSchema.optional(),
    createdTo: isoDateTimeSchema.optional(),
    entityId: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    requestId: z.string().trim().min(1).max(100).optional(),
    search: z.string().trim().max(100).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.createdFrom !== undefined &&
      input.createdTo !== undefined &&
      new Date(input.createdFrom) > new Date(input.createdTo)
    ) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["createdFrom"],
      });
    }
  });

const auditRecordParamsSchema = z.object({
  auditRecordId: z.string().uuid("Enter a valid audit record identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getAuditRecord(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = auditRecordParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The audit record request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await auditRecordService.getAuditRecord(
      readSession(request),
      parsed.data.auditRecordId,
    );

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listAuditRecords(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = auditRecordListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The audit record list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await auditRecordService.listAuditRecords(readSession(request), {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.action === undefined ? {} : { action: parsed.data.action }),
      ...(parsed.data.actorId === undefined ? {} : { actorId: parsed.data.actorId }),
      ...(parsed.data.createdFrom === undefined
        ? {}
        : { createdFrom: new Date(parsed.data.createdFrom) }),
      ...(parsed.data.createdTo === undefined
        ? {}
        : { createdTo: new Date(parsed.data.createdTo) }),
      ...(parsed.data.entityId === undefined ? {} : { entityId: parsed.data.entityId }),
      ...(parsed.data.entityType === undefined ? {} : { entityType: parsed.data.entityType }),
      ...(parsed.data.requestId === undefined ? {} : { requestId: parsed.data.requestId }),
      ...(parsed.data.search === undefined ? {} : { search: parsed.data.search }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
