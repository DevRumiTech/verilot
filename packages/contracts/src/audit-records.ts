import type { UserRole } from "./auth.js";
import type { PaginationMetadata } from "./batches.js";
import type { JsonValue } from "./products.js";

export interface AuditActorReference {
  displayName: string;
  id: string;
}

export interface AuditRecordSummary {
  action: string;
  actor: AuditActorReference | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: string;
  reason: string | null;
  requestId: string;
}

export interface AuditRecordDetail extends AuditRecordSummary {
  afterData: JsonValue | null;
  beforeData: JsonValue | null;
}

export interface AuditRecordsResponse {
  auditRecords: readonly AuditRecordSummary[];
  pagination: PaginationMetadata;
}

export interface AuditRecordDetailResponse {
  auditRecord: AuditRecordDetail;
}
