import type { AlertSeverity, AlertStatus } from "@verilot/contracts";
import { Prisma, type VerificationResult } from "../generated/prisma/client.js";

import { prisma } from "../config/database.js";

const recentCustodyActivitySelect = {
  eventAt: true,
  id: true,
  location: {
    select: {
      canton: true,
      municipality: true,
      name: true,
    },
  },
  product: {
    select: {
      id: true,
      serialNumber: true,
    },
  },
  recordedAt: true,
  type: true,
} satisfies Prisma.CustodyEventSelect;

const recentAlertSelect = {
  batch: {
    select: {
      code: true,
      id: true,
    },
  },
  createdAt: true,
  id: true,
  product: {
    select: {
      id: true,
      serialNumber: true,
    },
  },
  rule: true,
  severity: true,
  status: true,
  title: true,
} satisfies Prisma.AlertSelect;

export type DashboardCustodyActivityRecord = Prisma.CustodyEventGetPayload<{
  select: typeof recentCustodyActivitySelect;
}>;

export type DashboardAlertRecord = Prisma.AlertGetPayload<{
  select: typeof recentAlertSelect;
}>;

interface StatusCountRecord<Status extends string> {
  _count: number;
  status: Status;
}

export interface DashboardAlertCountRecord {
  _count: number;
  severity: AlertSeverity;
  status: AlertStatus;
}

export interface DashboardVerificationCountRecord {
  _count: number;
  result: VerificationResult;
}

export interface DashboardVerificationTrendRecord {
  count: number;
  periodStart: Date;
  result: VerificationResult;
}

export interface DashboardRepositoryResult {
  alertCounts: readonly DashboardAlertCountRecord[];
  batchCounts: readonly StatusCountRecord<"ACTIVE" | "CLOSED" | "DRAFT" | "RECALLED">[];
  productCounts: readonly StatusCountRecord<
    "BLOCKED" | "DESTROYED" | "PENDING" | "RECALLED" | "VERIFIED" | "WARNING"
  >[];
  recallCounts: readonly StatusCountRecord<"ACTIVE" | "CANCELLED" | "COMPLETED">[];
  recentAlerts: readonly DashboardAlertRecord[];
  recentCustodyActivity: readonly DashboardCustodyActivityRecord[];
  verificationCounts: readonly DashboardVerificationCountRecord[];
  verificationTrend: readonly DashboardVerificationTrendRecord[];
}

export interface GetDashboardSummaryInput {
  organizationId: string;
  recentItemLimit: number;
  verificationFrom: Date;
  verificationTo: Date;
  verificationTrendFrom: Date;
}

export interface DashboardRepository {
  getSummary(input: GetDashboardSummaryInput): Promise<DashboardRepositoryResult>;
}

export const dashboardRepository: DashboardRepository = {
  async getSummary(input) {
    const [
      productCounts,
      batchCounts,
      alertCounts,
      recallCounts,
      recentCustodyActivity,
      recentAlerts,
      verificationCounts,
      verificationTrend,
    ] = await prisma.$transaction([
      prisma.product.groupBy({
        _count: true,
        by: ["status"],
        orderBy: {
          status: "asc",
        },
        where: {
          batch: {
            manufacturerOrganizationId: input.organizationId,
          },
        },
      }),
      prisma.batch.groupBy({
        _count: true,
        by: ["status"],
        orderBy: {
          status: "asc",
        },
        where: {
          manufacturerOrganizationId: input.organizationId,
        },
      }),
      prisma.alert.groupBy({
        _count: true,
        by: ["severity", "status"],
        orderBy: [{ severity: "asc" }, { status: "asc" }],
        where: {
          organizationId: input.organizationId,
        },
      }),
      prisma.recall.groupBy({
        _count: true,
        by: ["status"],
        orderBy: {
          status: "asc",
        },
        where: {
          organizationId: input.organizationId,
        },
      }),
      prisma.custodyEvent.findMany({
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        select: recentCustodyActivitySelect,
        take: input.recentItemLimit,
        where: {
          organizationId: input.organizationId,
        },
      }),
      prisma.alert.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: recentAlertSelect,
        take: input.recentItemLimit,
        where: {
          organizationId: input.organizationId,
        },
      }),
      prisma.verificationAttempt.groupBy({
        _count: true,
        by: ["result"],
        orderBy: {
          result: "asc",
        },
        where: {
          attemptedAt: {
            gte: input.verificationFrom,
            lte: input.verificationTo,
          },
          organizationId: input.organizationId,
        },
      }),
      prisma.$queryRaw<DashboardVerificationTrendRecord[]>(
        Prisma.sql`
          SELECT
            date_trunc('day', "attemptedAt") AS "periodStart",
            "result",
            COUNT(*)::integer AS "count"
          FROM "verification_attempts"
          WHERE
            "organizationId" = ${input.organizationId}::uuid
            AND "attemptedAt" >= ${input.verificationTrendFrom}
            AND "attemptedAt" <= ${input.verificationTo}
          GROUP BY date_trunc('day', "attemptedAt"), "result"
          ORDER BY date_trunc('day', "attemptedAt") ASC, "result" ASC
        `,
      ),
    ]);

    return {
      alertCounts,
      batchCounts,
      productCounts,
      recallCounts,
      recentAlerts,
      recentCustodyActivity,
      verificationCounts,
      verificationTrend,
    };
  },
};
