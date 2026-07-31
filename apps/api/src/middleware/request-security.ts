import { CSRF_HEADER_NAME } from "@verilot/contracts";
import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { authValuesMatch, readAuthCookie } from "../security/auth-token.js";
import { authService } from "../services/auth.service.js";

export function requireAllowedOrigin(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (request.headers.origin !== env.APP_ORIGIN) {
    next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed."));
    return;
  }

  next();
}

export async function requireAuthentication(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    request.authenticatedSession = await authService.getSession(
      readAuthCookie(request.headers.cookie),
    );
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrfToken(request: Request, _response: Response, next: NextFunction): void {
  const expectedToken = request.authenticatedSession?.csrfToken;
  const receivedToken = request.get(CSRF_HEADER_NAME);

  if (
    expectedToken === undefined ||
    receivedToken === undefined ||
    !authValuesMatch(receivedToken, expectedToken)
  ) {
    next(new ApiError(403, "CSRF_TOKEN_INVALID", "CSRF token is missing or invalid."));
    return;
  }

  next();
}
