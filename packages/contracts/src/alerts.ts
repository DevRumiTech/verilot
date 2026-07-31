import type { JsonValue, ProductStatus } from "./products.js";

export const ALERT_RULES = [
  "DUPLICATE_SCAN",
  "IMPOSSIBLE_TRAVEL",
  "INVALID_EVENT_ORDER",
  "SCAN_AFTER_BLOCK",
  "SCAN_AFTER_RECALL",
  "UNKNOWN_LOCATION",
  "REUSED_IDEMPOTENCY_KEY",
  "EXCESSIVE_VERIFICATION_ATTEMPTS",
  "MISSING_ORGANIZATION_HANDOFF",
  "FUTURE_TIMESTAMP",
] as const;

export type AlertRule = (typeof ALERT_RULES)[number];

export const ALERT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "EVIDENCE_REQUESTED",
  "RESOLVED",
  "DISMISSED",
] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertUserReference {
  displayName: string;
  id: string;
}

export interface AlertProductReference {
  id: string;
  serialNumber: string;
  status: ProductStatus;
}

export interface AlertBatchReference {
  code: string;
  id: string;
  lotNumber: string;
  productName: string;
  sku: string;
}

export interface AlertCustodyEventReference {
  eventAt: string;
  id: string;
  recordedAt: string;
  type: string;
}

export interface AlertVerificationAttemptReference {
  attemptedAt: string;
  id: string;
  result: string;
  serialNumber: string;
}

export interface AlertSummary {
  assignedTo: AlertUserReference | null;
  batch: AlertBatchReference | null;
  createdAt: string;
  id: string;
  product: AlertProductReference | null;
  rule: AlertRule;
  severity: AlertSeverity;
  status: AlertStatus;
  summary: string;
  title: string;
  updatedAt: string;
}

export interface AlertDetail extends AlertSummary {
  custodyEvent: AlertCustodyEventReference | null;
  decisionAt: string | null;
  details: JsonValue;
  evidenceRequest: string | null;
  resolvedBy: AlertUserReference | null;
  reviewNotes: string | null;
  verificationAttempt: AlertVerificationAttemptReference | null;
}

export interface AlertsResponse {
  alerts: readonly AlertSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AlertDetailResponse {
  alert: AlertDetail;
}

export interface AssignAlertRequest {
  assignedToId: string;
  idempotencyKey: string;
  reason?: string;
}

export interface DecideAlertRequest {
  idempotencyKey: string;
  reviewNotes: string;
}

export interface AlertWorkflowState {
  assignedTo: AlertUserReference | null;
  decisionAt: string | null;
  id: string;
  resolvedBy: AlertUserReference | null;
  reviewNotes: string | null;
  status: AlertStatus;
  updatedAt: string;
}

export interface AlertWorkflowMutationResponse {
  alert: AlertWorkflowState;
  replayed: boolean;
}
