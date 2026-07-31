import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { ApiError } from "../errors/api-error.js";
import { partnerRequestService } from "../services/partner-request.service.js";
import { verificationService } from "../services/verification.service.js";
import { toFieldErrors } from "../validation/zod.js";

const verificationParamsSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^VL-\d{4}-\d{6}$/, "Use the format VL-YYYY-NNNNNN."),
});

function readApiClientId(request: Request): string {
  const client = request.partnerApiClient;

  if (client === undefined) {
    throw new ApiError(401, "PARTNER_API_KEY_REQUIRED", "A partner API key is required.");
  }

  return client.id;
}

async function recordError(request: Request, serialNumber: string, error: ApiError): Promise<void> {
  await partnerRequestService.recordError({
    apiClientId: readApiClientId(request),
    error,
    requestId: String(request.id),
    serialNumber,
  });
}

export async function getPartnerVerification(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = verificationParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    const error = new ApiError(
      400,
      "VALIDATION_ERROR",
      "The verification request is invalid.",
      toFieldErrors(parsed.error),
    );

    try {
      await recordError(
        request,
        typeof request.params.serialNumber === "string" ? request.params.serialNumber : "",
        error,
      );
      next(error);
    } catch (loggingError) {
      next(loggingError);
    }
    return;
  }

  try {
    const verification = await verificationService.verifyProduct({
      ipAddress: request.ip ?? "unknown",
      requestId: String(request.id),
      serialNumber: parsed.data.serialNumber,
      ...(request.headers["user-agent"] === undefined
        ? {}
        : { userAgent: request.headers["user-agent"] }),
    });

    await partnerRequestService.recordVerification({
      apiClientId: readApiClientId(request),
      requestId: String(request.id),
      serialNumber: parsed.data.serialNumber,
      verification,
    });

    response.status(200).json({
      data: verification,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      try {
        await recordError(request, parsed.data.serialNumber, error);
      } catch (loggingError) {
        next(loggingError);
        return;
      }
    }

    next(error);
  }
}
