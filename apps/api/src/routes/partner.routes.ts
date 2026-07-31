import { PARTNER_API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { getPartnerVerification } from "../controllers/partner-verification.controller.js";
import {
  partnerVerificationRateLimit,
  requirePartnerApiClient,
} from "../middleware/partner-security.js";

export const partnerRouter = Router();

partnerRouter.get(
  `${PARTNER_API_PATHS.verification}/:serialNumber`,
  requirePartnerApiClient,
  partnerVerificationRateLimit,
  getPartnerVerification,
);
