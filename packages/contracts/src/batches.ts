export const BATCH_STATUSES = ["DRAFT", "ACTIVE", "RECALLED", "CLOSED"] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const MAX_BATCH_PRODUCT_COUNT = 1_000;

export interface BatchSummary {
  activatedAt: string | null;
  code: string;
  expiresAt: string | null;
  id: string;
  lotNumber: string;
  manufacturedAt: string;
  productCount: number;
  productName: string;
  recallCount: number;
  serialEnd: number;
  serialPrefix: string;
  serialStart: number;
  sku: string;
  status: BatchStatus;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BatchesResponse {
  batches: readonly BatchSummary[];
  pagination: PaginationMetadata;
}

export interface BatchDetailResponse {
  batch: BatchSummary;
}

export interface CreateBatchRequest {
  code: string;
  expiresAt?: string;
  idempotencyKey: string;
  lotNumber: string;
  manufacturedAt: string;
  productName: string;
  serialEnd: number;
  serialPrefix: string;
  serialStart: number;
  sku: string;
}

export interface ChangeBatchStatusRequest {
  idempotencyKey: string;
}

export interface BatchWorkflowState {
  activatedAt: string | null;
  code: string;
  expiresAt: string | null;
  id: string;
  lotNumber: string;
  manufacturedAt: string;
  productCount: number;
  productName: string;
  serialEnd: number;
  serialPrefix: string;
  serialStart: number;
  sku: string;
  status: BatchStatus;
}

export interface BatchWorkflowMutationResponse {
  batch: BatchWorkflowState;
  replayed: boolean;
}
