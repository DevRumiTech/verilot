import type {
  BatchDetailResponse,
  BatchesResponse,
  BatchStatus,
  BatchSummary,
  AuthSessionResponse,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  batchRepository,
  type BatchRepository,
  type BatchSummaryRecord,
} from "../repositories/batch.repository.js";

export interface ListBatchesServiceInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: BatchStatus;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toBatchSummary(batch: BatchSummaryRecord): BatchSummary {
  return {
    activatedAt: batch.activatedAt?.toISOString() ?? null,
    code: batch.code,
    expiresAt: batch.expiresAt === null ? null : toDateOnly(batch.expiresAt),
    id: batch.id,
    lotNumber: batch.lotNumber,
    manufacturedAt: toDateOnly(batch.manufacturedAt),
    productCount: batch._count.products,
    productName: batch.productName,
    recallCount: batch._count.recalls,
    serialEnd: batch.serialEnd,
    serialPrefix: batch.serialPrefix,
    serialStart: batch.serialStart,
    sku: batch.sku,
    status: batch.status,
  };
}

export class BatchService {
  public constructor(private readonly repository: BatchRepository) {}

  public async getBatch(
    session: AuthSessionResponse,
    batchId: string,
  ): Promise<BatchDetailResponse> {
    const batch = await this.repository.findByIdAndOrganization(
      batchId,
      session.user.organization.id,
    );

    if (batch === null) {
      throw new ApiError(404, "BATCH_NOT_FOUND", "Batch not found.");
    }

    return {
      batch: toBatchSummary(batch),
    };
  }

  public async listBatches(
    session: AuthSessionResponse,
    input: ListBatchesServiceInput,
  ): Promise<BatchesResponse> {
    const result = await this.repository.list({
      organizationId: session.user.organization.id,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      batches: result.batches.map(toBatchSummary),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.pageSize),
      },
    };
  }
}

export const batchService = new BatchService(batchRepository);
