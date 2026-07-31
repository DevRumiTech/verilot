import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getBatch, listBatches } from "../controllers/batch.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const batchRouter = Router();

batchRouter.get(
  API_PATHS.batches,
  requireAuthentication,
  requirePermission(PERMISSIONS.batchesRead),
  listBatches,
);

batchRouter.get(
  `${API_PATHS.batches}/:batchId`,
  requireAuthentication,
  requirePermission(PERMISSIONS.batchesRead),
  getBatch,
);
