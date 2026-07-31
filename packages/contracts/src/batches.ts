export const BATCH_STATUSES = ["DRAFT", "ACTIVE", "RECALLED", "CLOSED"] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

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
