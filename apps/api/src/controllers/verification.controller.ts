import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { verificationService } from "../services/verification.service.js";
import { toFieldErrors } from "../validation/zod.js";

const verificationParamsSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^VL-\d{4}-\d{6}$/, "Use the format VL-YYYY-NNNNNN."),
});

export async function getPublicVerification(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const result = verificationParamsSchema.safeParse(request.params);

  if (!result.success) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "The verification request is invalid.",
        toFieldErrors(result.error),
      ),
    );
    return;
  }

  try {
    const verification = await verificationService.verifyProduct({
      ipAddress: request.ip ?? "unknown",
      requestId: String(request.id),
      serialNumber: result.data.serialNumber,
      ...(request.headers["user-agent"] === undefined
        ? {}
        : { userAgent: request.headers["user-agent"] }),
    });

    response.status(200).json({
      data: verification,
    });
  } catch (error) {
    next(error);
  }
}
