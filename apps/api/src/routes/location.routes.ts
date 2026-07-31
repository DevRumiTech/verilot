import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { listLocations } from "../controllers/location.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const locationRouter = Router();

locationRouter.get(
  API_PATHS.locations,
  requireAuthentication,
  requirePermission(PERMISSIONS.locationsRead),
  listLocations,
);
