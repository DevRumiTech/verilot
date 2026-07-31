import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getAlert, listAlerts } from "../controllers/alert.controller.js";
import {
  assignAlert,
  dismissAlert,
  resolveAlert,
} from "../controllers/alert-workflow.controller.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission,
} from "../middleware/request-security.js";

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

for (const [path, handler] of [
  ["assign", assignAlert],
  ["resolve", resolveAlert],
  ["dismiss", dismissAlert],
] as const) {
  alertRouter.post(
    `${API_PATHS.alerts}/:alertId/${path}`,
    requireAllowedOrigin,
    requireAuthentication,
    requireCsrfToken,
    requirePermission(PERMISSIONS.alertsManage),
    handler,
  );
}
