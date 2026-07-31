import type { NextFunction, Request, RequestHandler, Response } from "express";

import { ApiError } from "../errors/api-error.js";
import { rateLimitService } from "../services/rate-limit.service.js";

export interface RateLimitOptions {
  identity(request: Request): string;
  limit: number;
  scope: string;
  windowSeconds: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  return async function rateLimitMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const decision = await rateLimitService.consume({
        identity: options.identity(request),
        limit: options.limit,
        scope: options.scope,
        windowSeconds: options.windowSeconds,
      });

      response.setHeader("RateLimit-Limit", String(decision.limit));
      response.setHeader("RateLimit-Remaining", String(decision.remaining));
      response.setHeader("RateLimit-Reset", String(decision.retryAfterSeconds));
      response.setHeader("RateLimit-Policy", `${decision.limit};w=${options.windowSeconds}`);

      if (!decision.allowed) {
        response.setHeader("Retry-After", String(decision.retryAfterSeconds));

        next(new ApiError(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Try again later."));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
