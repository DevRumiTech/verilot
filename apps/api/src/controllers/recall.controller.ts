import { RECALL_STATUSES, type AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { recallService } from "../services/recall.service.js";
import { toFieldErrors } from "../validation/zod.js";

const isoDateTimeSchema = z.string().datetime({
  message: "Enter a valid ISO date-time.",
  offset: true,
});

const recallListQuerySchema = z
  .object({
    announcedFrom: isoDateTimeSchema.optional(),
    announcedTo: isoDateTimeSchema.optional(),
    batchId: z.string().uuid("Enter a valid batch identifier.").optional(),
    page: z.coerce.number().int().positive().max(10_000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.enum(RECALL_STATUSES).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.announcedFrom !== undefined &&
      input.announcedTo !== undefined &&
      new Date(input.announcedFrom) > new Date(input.announcedTo)
    ) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["announcedFrom"],
      });
    }
  });

const recallParamsSchema = z.object({
  recallId: z.string().uuid("Enter a valid recall identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getRecall(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = recallParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The recall request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await recallService.getRecall(readSession(request), parsed.data.recallId);

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listRecalls(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = recallListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The recall list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await recallService.listRecalls(readSession(request), {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.announcedFrom === undefined
        ? {}
        : { announcedFrom: new Date(parsed.data.announcedFrom) }),
      ...(parsed.data.announcedTo === undefined
        ? {}
        : { announcedTo: new Date(parsed.data.announcedTo) }),
      ...(parsed.data.batchId === undefined ? {} : { batchId: parsed.data.batchId }),
      ...(parsed.data.search === undefined ? {} : { search: parsed.data.search }),
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
