import type {
  AuthSessionResponse,
  RecallDetail,
  RecallDetailResponse,
  RecallsResponse,
  RecallStatus,
  RecallSummary,
} from "@verilot/contracts";

import { ApiError } from "../errors/api-error.js";
import {
  recallRepository,
  type RecallDetailRecord,
  type RecallRepository,
  type RecallSummaryRecord,
} from "../repositories/recall.repository.js";

export interface ListRecallsServiceInput {
  announcedFrom?: Date;
  announcedTo?: Date;
  batchId?: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: RecallStatus;
}

function toRecallSummary(recall: RecallSummaryRecord): RecallSummary {
  return {
    announcedAt: recall.announcedAt.toISOString(),
    batch: {
      code: recall.batch.code,
      id: recall.batch.id,
      lotNumber: recall.batch.lotNumber,
      productName: recall.batch.productName,
      sku: recall.batch.sku,
      status: recall.batch.status,
    },
    completedAt: recall.completedAt?.toISOString() ?? null,
    id: recall.id,
    reason: recall.reason,
    reference: recall.reference,
    status: recall.status,
  };
}

function toRecallDetail(recall: RecallDetailRecord): RecallDetail {
  return {
    ...toRecallSummary(recall),
    createdBy: {
      displayName: recall.createdBy.displayName,
      id: recall.createdBy.id,
    },
    custodyEventCount: recall._count.events,
    productCount: recall.batch._count.products,
  };
}

export class RecallService {
  public constructor(private readonly repository: RecallRepository) {}

  public async getRecall(
    session: AuthSessionResponse,
    recallId: string,
  ): Promise<RecallDetailResponse> {
    const recall = await this.repository.findByIdAndOrganization(
      recallId,
      session.user.organization.id,
    );

    if (recall === null) {
      throw new ApiError(404, "RECALL_NOT_FOUND", "Recall not found.");
    }

    return {
      recall: toRecallDetail(recall),
    };
  }

  public async listRecalls(
    session: AuthSessionResponse,
    input: ListRecallsServiceInput,
  ): Promise<RecallsResponse> {
    const result = await this.repository.list({
      organizationId: session.user.organization.id,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.announcedFrom === undefined ? {} : { announcedFrom: input.announcedFrom }),
      ...(input.announcedTo === undefined ? {} : { announcedTo: input.announcedTo }),
      ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.pageSize),
      },
      recalls: result.recalls.map(toRecallSummary),
    };
  }
}

export const recallService = new RecallService(recallRepository);
