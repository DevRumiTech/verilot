import type { BatchStatus } from "@verilot/contracts";
import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const batchSummarySelect = {
  _count: {
    select: {
      products: true,
      recalls: true,
    },
  },
  activatedAt: true,
  code: true,
  expiresAt: true,
  id: true,
  lotNumber: true,
  manufacturedAt: true,
  productName: true,
  serialEnd: true,
  serialPrefix: true,
  serialStart: true,
  sku: true,
  status: true,
} satisfies Prisma.BatchSelect;

export type BatchSummaryRecord = Prisma.BatchGetPayload<{
  select: typeof batchSummarySelect;
}>;

export interface ListBatchesInput {
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: BatchStatus;
}

export interface ListBatchesResult {
  batches: readonly BatchSummaryRecord[];
  totalItems: number;
}

export interface BatchRepository {
  findByIdAndOrganization(
    batchId: string,
    organizationId: string,
  ): Promise<BatchSummaryRecord | null>;
  list(input: ListBatchesInput): Promise<ListBatchesResult>;
}

function buildWhere(input: ListBatchesInput): Prisma.BatchWhereInput {
  const search = input.search?.trim();

  return {
    manufacturerOrganizationId: input.organizationId,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(search === undefined || search === ""
      ? {}
      : {
          OR: [
            {
              code: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              lotNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              productName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              sku: {
                contains: search,
                mode: "insensitive",
              },
            },
          ],
        }),
  };
}

export const batchRepository: BatchRepository = {
  async findByIdAndOrganization(batchId, organizationId) {
    return prisma.batch.findFirst({
      select: batchSummarySelect,
      where: {
        id: batchId,
        manufacturerOrganizationId: organizationId,
      },
    });
  },

  async list(input) {
    const where = buildWhere(input);

    const [batches, totalItems] = await prisma.$transaction([
      prisma.batch.findMany({
        orderBy: [{ createdAt: "desc" }, { code: "asc" }],
        select: batchSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
      prisma.batch.count({
        where,
      }),
    ]);

    return {
      batches,
      totalItems,
    };
  },
};
