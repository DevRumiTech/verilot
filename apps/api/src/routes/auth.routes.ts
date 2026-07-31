import { API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { getSession, signIn, signOut } from "../controllers/auth.controller.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
} from "../middleware/request-security.js";

export const authRouter = Router();

authRouter.post(API_PATHS.auth.login, requireAllowedOrigin, signIn);
authRouter.post(
  API_PATHS.auth.logout,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  signOut,
);
authRouter.get(API_PATHS.auth.session, getSession);
