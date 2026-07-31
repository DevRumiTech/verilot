import type { AuthSessionResponse } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { locationService } from "../services/location.service.js";
import { toFieldErrors } from "../validation/zod.js";

const locationQuerySchema = z.object({
  canton: z
    .string()
    .trim()
    .length(2, "Enter a two-letter canton code.")
    .transform((value) => value.toUpperCase())
    .optional(),
  search: z.string().trim().max(100).optional(),
});

function readSession(request: Request): AuthSessionResponse {
  const session = request.authenticatedSession;

  if (session === undefined) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return session;
}

export async function listLocations(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = locationQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The location list request is invalid.",
        toFieldErrors(parsed.error),
      ),
    );
    return;
  }

  try {
    const result = await locationService.listLocations(readSession(request), {
      ...(parsed.data.canton === undefined
        ? {}
        : {
            canton: parsed.data.canton,
          }),
      ...(parsed.data.search === undefined
        ? {}
        : {
            search: parsed.data.search,
          }),
    });

    response.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
