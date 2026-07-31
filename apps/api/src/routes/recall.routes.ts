import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getRecall, listRecalls } from "../controllers/recall.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

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
