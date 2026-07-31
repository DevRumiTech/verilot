import { PARTNER_API_KEY_HEADER_NAME } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { partnerAuthService } from "../services/partner-auth.service.js";
import { partnerRequestService } from "../services/partner-request.service.js";
import { rateLimitService } from "../services/rate-limit.service.js";

const PARTNER_RATE_LIMIT_SCOPE = "partner-verification";

function readSerialNumber(request: Request): string {
  return typeof request.params.serialNumber === "string" ? request.params.serialNumber : "";
}

async function recordRejectedRequest(
  request: Request,
  apiClientId: string | undefined,
  error: ApiError,
): Promise<void> {
  if (apiClientId === undefined) {
    return;
  }

  await partnerRequestService.recordError({
    apiClientId,
    error,
    requestId: String(request.id),
    serialNumber: readSerialNumber(request),
  });
}

export async function requirePartnerApiClient(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await partnerAuthService.authenticate(request.get(PARTNER_API_KEY_HEADER_NAME));

    if (result.kind !== "authenticated") {
      const error =
        result.kind === "missing"
          ? new ApiError(401, "PARTNER_API_KEY_REQUIRED", "A partner API key is required.")
          : new ApiError(401, "PARTNER_API_KEY_INVALID", "The partner API key is invalid.");

      await recordRejectedRequest(request, result.apiClientId, error);
      next(error);
      return;
    }

    request.partnerApiClient = result.client;
    next();
  } catch (error) {
    next(error);
  }
}

export async function partnerVerificationRateLimit(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const client = request.partnerApiClient;

  if (client === undefined) {
    next(new ApiError(401, "PARTNER_API_KEY_REQUIRED", "A partner API key is required."));
    return;
  }

  try {
    const decision = await rateLimitService.consume({
      identity: client.id,
      limit: env.RATE_LIMIT_PARTNER_MAX,
      scope: PARTNER_RATE_LIMIT_SCOPE,
      windowSeconds: env.RATE_LIMIT_PARTNER_WINDOW_SECONDS,
    });

    response.setHeader("RateLimit-Limit", String(decision.limit));
    response.setHeader("RateLimit-Remaining", String(decision.remaining));
    response.setHeader("RateLimit-Reset", String(decision.retryAfterSeconds));
    response.setHeader(
      "RateLimit-Policy",
      `${decision.limit};w=${env.RATE_LIMIT_PARTNER_WINDOW_SECONDS}`,
    );

    if (!decision.allowed) {
      response.setHeader("Retry-After", String(decision.retryAfterSeconds));
      const error = new ApiError(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Try again later.");

      await partnerRequestService.recordError({
        apiClientId: client.id,
        error,
        requestId: String(request.id),
        serialNumber: readSerialNumber(request),
      });
      next(error);
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
