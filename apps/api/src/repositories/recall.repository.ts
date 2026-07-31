import type { RecallStatus } from "@verilot/contracts";
import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const recallSummarySelect = {
  announcedAt: true,
  batch: {
    select: {
      code: true,
      id: true,
      lotNumber: true,
      productName: true,
      sku: true,
      status: true,
    },
  },
  completedAt: true,
  id: true,
  reason: true,
  reference: true,
  status: true,
} satisfies Prisma.RecallSelect;

const recallDetailSelect = {
  ...recallSummarySelect,
  _count: {
    select: {
      events: true,
    },
  },
  batch: {
    select: {
      _count: {
        select: {
          products: true,
        },
      },
      code: true,
      id: true,
      lotNumber: true,
      productName: true,
      sku: true,
      status: true,
    },
  },
  createdBy: {
    select: {
      displayName: true,
      id: true,
    },
  },
} satisfies Prisma.RecallSelect;

export type RecallSummaryRecord = Prisma.RecallGetPayload<{
  select: typeof recallSummarySelect;
}>;

export type RecallDetailRecord = Prisma.RecallGetPayload<{
  select: typeof recallDetailSelect;
}>;

export interface ListRecallsInput {
  announcedFrom?: Date;
  announcedTo?: Date;
  batchId?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: RecallStatus;
}

export interface ListRecallsResult {
  recalls: readonly RecallSummaryRecord[];
  totalItems: number;
}

export interface RecallRepository {
  findByIdAndOrganization(
    recallId: string,
    organizationId: string,
  ): Promise<RecallDetailRecord | null>;
  list(input: ListRecallsInput): Promise<ListRecallsResult>;
}

function buildWhere(input: ListRecallsInput): Prisma.RecallWhereInput {
  const search = input.search?.trim();

  return {
    organizationId: input.organizationId,
    ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.announcedFrom === undefined && input.announcedTo === undefined
      ? {}
      : {
          announcedAt: {
            ...(input.announcedFrom === undefined ? {} : { gte: input.announcedFrom }),
            ...(input.announcedTo === undefined ? {} : { lte: input.announcedTo }),
          },
        }),
    ...(search === undefined || search === ""
      ? {}
      : {
          OR: [
            {
              reference: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              reason: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              batch: {
                code: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                lotNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                productName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                sku: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }),
  };
}

export const recallRepository: RecallRepository = {
  async findByIdAndOrganization(recallId, organizationId) {
    return prisma.recall.findFirst({
      select: recallDetailSelect,
      where: {
        id: recallId,
        organizationId,
      },
    });
  },

  async list(input) {
    const where = buildWhere(input);

    const [recalls, totalItems] = await prisma.$transaction([
      prisma.recall.findMany({
        orderBy: [{ announcedAt: "desc" }, { id: "desc" }],
        select: recallSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
      prisma.recall.count({
        where,
      }),
    ]);

    return {
      recalls,
      totalItems,
    };
  },
};
