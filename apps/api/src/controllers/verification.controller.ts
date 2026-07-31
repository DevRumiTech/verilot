import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError, type FieldErrors } from "../errors/api-error.js";
import { verificationService } from "../services/verification.service.js";

const verificationParamsSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^VL-\d{4}-\d{6}$/, "Use the format VL-YYYY-NNNNNN."),
});

function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    const messages = fieldErrors[field] ?? [];
    messages.push(issue.message);
    fieldErrors[field] = messages;
  }

  return fieldErrors;
}

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
