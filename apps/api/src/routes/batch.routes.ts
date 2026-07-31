import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import {
  activateBatch,
  closeBatch,
  createBatch,
} from "../controllers/batch-workflow.controller.js";
import { getBatch, listBatches } from "../controllers/batch.controller.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission,
} from "../middleware/request-security.js";

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

batchRouter.post(
  API_PATHS.batches,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission(PERMISSIONS.batchesWrite),
  createBatch,
);

for (const [path, handler] of [
  ["activate", activateBatch],
  ["close", closeBatch],
] as const) {
  batchRouter.post(
    `${API_PATHS.batches}/:batchId/${path}`,
    requireAllowedOrigin,
    requireAuthentication,
    requireCsrfToken,
    requirePermission(PERMISSIONS.batchesWrite),
    handler,
  );
}
