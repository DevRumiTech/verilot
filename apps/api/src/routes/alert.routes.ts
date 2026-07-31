import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getAlert, listAlerts } from "../controllers/alert.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const alertRouter = Router();

alertRouter.get(
  API_PATHS.alerts,
  requireAuthentication,
  requirePermission(PERMISSIONS.alertsRead),
  listAlerts,
);

alertRouter.get(
  `${API_PATHS.alerts}/:alertId`,
  requireAuthentication,
  requirePermission(PERMISSIONS.alertsRead),
  getAlert,
);
