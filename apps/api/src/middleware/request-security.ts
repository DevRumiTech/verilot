import { CSRF_HEADER_NAME, ROLE_PERMISSIONS, type Permission } from "@verilot/contracts";
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

export function requirePermission(permission: Permission) {
  return function permissionMiddleware(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void {
    const session = request.authenticatedSession;

    if (session === undefined) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }

    if (!ROLE_PERMISSIONS[session.user.role].includes(permission)) {
      next(
        new ApiError(
          403,
          "INSUFFICIENT_PERMISSIONS",
          "You do not have permission to perform this action.",
        ),
      );
      return;
    }

    next();
  };
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
