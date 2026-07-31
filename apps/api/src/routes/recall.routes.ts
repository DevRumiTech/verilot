import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getRecall, listRecalls } from "../controllers/recall.controller.js";
import { completeRecall, createRecall } from "../controllers/recall-workflow.controller.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission,
} from "../middleware/request-security.js";

export const recallRouter = Router();

recallRouter.get(
  API_PATHS.recalls,
  requireAuthentication,
  requirePermission(PERMISSIONS.recallsRead),
  listRecalls,
);

recallRouter.get(
  `${API_PATHS.recalls}/:recallId`,
  requireAuthentication,
  requirePermission(PERMISSIONS.recallsRead),
  getRecall,
);

recallRouter.post(
  API_PATHS.recalls,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission(PERMISSIONS.recallsManage),
  createRecall,
);

recallRouter.post(
  `${API_PATHS.recalls}/:recallId/complete`,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission(PERMISSIONS.recallsManage),
  completeRecall,
);
