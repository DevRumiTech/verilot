import { API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { getPublicVerification } from "../controllers/verification.controller.js";

export const verificationRouter = Router();

verificationRouter.get(`${API_PATHS.verification}/:serialNumber`, getPublicVerification);
