import { BATCH_STATUSES, type AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { batchService } from "../services/batch.service.js";
import { toFieldErrors } from "../validation/zod.js";

const batchListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(BATCH_STATUSES).optional(),
});

const batchParamsSchema = z.object({
  batchId: z.string().uuid("Enter a valid batch identifier."),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function getBatch(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = batchParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The batch request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await batchService.getBatch(readSession(request), parsed.data.batchId);

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listBatches(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = batchListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The batch list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await batchService.listBatches(readSession(request), {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
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
