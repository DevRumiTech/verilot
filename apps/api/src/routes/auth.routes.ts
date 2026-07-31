import { API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { env } from "../config/env.js";
import { getSession, signIn, signOut } from "../controllers/auth.controller.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
} from "../middleware/request-security.js";

export const authRouter = Router();

const loginRateLimit = createRateLimitMiddleware({
  identity(request) {
    const email =
      typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "invalid";

    return `${request.ip ?? "unknown"}:${email}`;
  },
  limit: env.RATE_LIMIT_LOGIN_MAX,
  scope: "auth-login",
  windowSeconds: env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
});

authRouter.post(API_PATHS.auth.login, requireAllowedOrigin, loginRateLimit, signIn);

authRouter.post(
  API_PATHS.auth.logout,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  signOut,
);

authRouter.get(API_PATHS.auth.session, getSession);
