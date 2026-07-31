import type { BatchStatus, PaginationMetadata } from "./batches.js";

export const RECALL_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const;

export type RecallStatus = (typeof RECALL_STATUSES)[number];

export interface RecallBatchReference {
  code: string;
  id: string;
  lotNumber: string;
  productName: string;
  sku: string;
  status: BatchStatus;
}

export interface RecallUserReference {
  displayName: string;
  id: string;
}

export interface RecallSummary {
  announcedAt: string;
  batch: RecallBatchReference;
  completedAt: string | null;
  id: string;
  reason: string;
  reference: string;
  status: RecallStatus;
}

export interface RecallDetail extends RecallSummary {
  createdBy: RecallUserReference;
  custodyEventCount: number;
  productCount: number;
}

export interface RecallsResponse {
  pagination: PaginationMetadata;
  recalls: readonly RecallSummary[];
}

export interface RecallDetailResponse {
  recall: RecallDetail;
}
