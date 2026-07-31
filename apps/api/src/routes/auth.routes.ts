import { API_PATHS } from "@verilot/contracts";
import { Router } from "express";

import { getSession, signIn, signOut } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post(API_PATHS.auth.login, signIn);
authRouter.post(API_PATHS.auth.logout, signOut);
authRouter.get(API_PATHS.auth.session, getSession);
