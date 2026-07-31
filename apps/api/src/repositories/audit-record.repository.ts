import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const auditRecordSummarySelect = {
  action: true,
  actor: {
    select: {
      displayName: true,
      id: true,
    },
  },
  actorEmail: true,
  actorRole: true,
  createdAt: true,
  entityId: true,
  entityType: true,
  id: true,
  reason: true,
  requestId: true,
} satisfies Prisma.AuditRecordSelect;

const auditRecordDetailSelect = {
  ...auditRecordSummarySelect,
  afterData: true,
  beforeData: true,
} satisfies Prisma.AuditRecordSelect;

export type AuditRecordSummaryRecord = Prisma.AuditRecordGetPayload<{
  select: typeof auditRecordSummarySelect;
}>;

export type AuditRecordDetailRecord = Prisma.AuditRecordGetPayload<{
  select: typeof auditRecordDetailSelect;
}>;

export interface ListAuditRecordsInput {
  action?: string;
  actorId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  entityId?: string;
  entityType?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  requestId?: string;
  search?: string;
}

export interface ListAuditRecordsResult {
  auditRecords: readonly AuditRecordSummaryRecord[];
  totalItems: number;
}

export interface AuditRecordRepository {
  findByIdAndOrganization(
    auditRecordId: string,
    organizationId: string,
  ): Promise<AuditRecordDetailRecord | null>;
  list(input: ListAuditRecordsInput): Promise<ListAuditRecordsResult>;
}

function buildWhere(input: ListAuditRecordsInput): Prisma.AuditRecordWhereInput {
  const search = input.search?.trim();

  return {
    organizationId: input.organizationId,
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.createdFrom === undefined && input.createdTo === undefined
      ? {}
      : {
          createdAt: {
            ...(input.createdFrom === undefined ? {} : { gte: input.createdFrom }),
            ...(input.createdTo === undefined ? {} : { lte: input.createdTo }),
          },
        }),
    ...(search === undefined || search === ""
      ? {}
      : {
          OR: [
            {
              action: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              entityType: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              actorEmail: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              entityId: {
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
              requestId: {
                contains: search,
                mode: "insensitive",
              },
            },
          ],
        }),
  };
}

export const auditRecordRepository: AuditRecordRepository = {
  async findByIdAndOrganization(auditRecordId, organizationId) {
    return prisma.auditRecord.findFirst({
      select: auditRecordDetailSelect,
      where: {
        id: auditRecordId,
        organizationId,
      },
    });
  },

  async list(input) {
    const where = buildWhere(input);

    const [auditRecords, totalItems] = await prisma.$transaction([
      prisma.auditRecord.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: auditRecordSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
      prisma.auditRecord.count({
        where,
      }),
    ]);

    return {
      auditRecords,
      totalItems,
    };
  },
};
