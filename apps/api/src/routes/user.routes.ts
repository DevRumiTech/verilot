import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { listUsers } from "../controllers/user.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const userRouter = Router();

userRouter.get(
  API_PATHS.users,
  requireAuthentication,
  requirePermission(PERMISSIONS.usersRead),
  listUsers,
);
