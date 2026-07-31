import { API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { env } from "../config/env.js";
import { getPublicVerification } from "../controllers/verification.controller.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

export const verificationRouter = Router();

const verificationRateLimit = createRateLimitMiddleware({
  identity(request) {
    return request.ip ?? "unknown";
  },
  limit: env.RATE_LIMIT_VERIFICATION_MAX,
  scope: "public-verification",
  windowSeconds: env.RATE_LIMIT_VERIFICATION_WINDOW_SECONDS,
});

verificationRouter.get(
  `${API_PATHS.verification}/:serialNumber`,
  verificationRateLimit,
  getPublicVerification,
);
