import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getAuditRecord, listAuditRecords } from "../controllers/audit-record.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

export const auditRecordRouter = Router();

auditRecordRouter.get(
  API_PATHS.auditRecords,
  requireAuthentication,
  requirePermission(PERMISSIONS.auditRecordsRead),
  listAuditRecords,
);

auditRecordRouter.get(
  `${API_PATHS.auditRecords}/:auditRecordId`,
  requireAuthentication,
  requirePermission(PERMISSIONS.auditRecordsRead),
  getAuditRecord,
);
