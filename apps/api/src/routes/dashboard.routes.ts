import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getDashboardSummary } from "../controllers/dashboard.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  API_PATHS.dashboardSummary,
  requireAuthentication,
  requirePermission(PERMISSIONS.dashboardRead),
  getDashboardSummary,
);
