import type { AlertRule, AlertSeverity, AlertStatus } from "@verilot/contracts";
import type { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const alertSummarySelect = {
  assignedTo: {
    select: {
      displayName: true,
      id: true,
    },
  },
  batch: {
    select: {
      code: true,
      id: true,
      lotNumber: true,
      productName: true,
      sku: true,
    },
  },
  createdAt: true,
  id: true,
  product: {
    select: {
      id: true,
      serialNumber: true,
      status: true,
    },
  },
  rule: true,
  severity: true,
  status: true,
  summary: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.AlertSelect;

const alertDetailSelect = {
  ...alertSummarySelect,
  decisionAt: true,
  details: true,
  event: {
    select: {
      eventAt: true,
      id: true,
      recordedAt: true,
      type: true,
    },
  },
  evidenceRequest: true,
  resolvedBy: {
    select: {
      displayName: true,
      id: true,
    },
  },
  reviewNotes: true,
  verificationAttempt: {
    select: {
      attemptedAt: true,
      id: true,
      result: true,
      serialNumber: true,
    },
  },
} satisfies Prisma.AlertSelect;

export type AlertSummaryRecord = Prisma.AlertGetPayload<{
  select: typeof alertSummarySelect;
}>;

export type AlertDetailRecord = Prisma.AlertGetPayload<{
  select: typeof alertDetailSelect;
}>;

export interface ListAlertsInput {
  assignedToId?: string;
  batchId?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  productId?: string;
  rule?: AlertRule;
  search?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
}

export interface ListAlertsResult {
  alerts: readonly AlertSummaryRecord[];
  totalItems: number;
}

export interface AlertRepository {
  findByIdAndOrganization(
    alertId: string,
    organizationId: string,
  ): Promise<AlertDetailRecord | null>;
  list(input: ListAlertsInput): Promise<ListAlertsResult>;
}

function buildWhere(input: ListAlertsInput): Prisma.AlertWhereInput {
  const search = input.search?.trim();

  return {
    organizationId: input.organizationId,
    ...(input.assignedToId === undefined ? {} : { assignedToId: input.assignedToId }),
    ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
    ...(input.productId === undefined ? {} : { productId: input.productId }),
    ...(input.rule === undefined ? {} : { rule: input.rule }),
    ...(input.severity === undefined ? {} : { severity: input.severity }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(search === undefined || search === ""
      ? {}
      : {
          OR: [
            {
              title: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              summary: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              product: {
                serialNumber: {
                  contains: search,
                  mode: "insensitive",
                },
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
          ],
        }),
  };
}

export const alertRepository: AlertRepository = {
  async findByIdAndOrganization(alertId, organizationId) {
    return prisma.alert.findFirst({
      select: alertDetailSelect,
      where: {
        id: alertId,
        organizationId,
      },
    });
  },

  async list(input) {
    const where = buildWhere(input);

    const [alerts, totalItems] = await prisma.$transaction([
      prisma.alert.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: alertSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        where,
      }),
      prisma.alert.count({
        where,
      }),
    ]);

    return {
      alerts,
      totalItems,
    };
  },
};
