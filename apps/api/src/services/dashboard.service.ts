import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  BATCH_STATUSES,
  DASHBOARD_RECENT_ITEM_LIMIT,
  DASHBOARD_VERIFICATION_TOTAL_DAYS,
  DASHBOARD_VERIFICATION_TREND_DAYS,
  PRODUCT_STATUSES,
  RECALL_STATUSES,
  VERIFICATION_RESULTS,
  type AlertSeverity,
  type AlertStatus,
  type AuthSessionResponse,
  type BatchStatus,
  type DashboardSummary,
  type ProductStatus,
  type RecallStatus,
  type VerificationResult,
} from "@verilot/contracts";

import {
  dashboardRepository,
  type DashboardRepository,
  type DashboardRepositoryResult,
} from "../repositories/dashboard.repository.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

function createCountMap<const Values extends readonly string[]>(
  values: Values,
): Record<Values[number], number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<Values[number], number>;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toStatusCounts<Status extends string>(
  statuses: readonly Status[],
  records: ReadonlyArray<{ _count: number; status: Status }>,
): Record<Status, number> {
  const counts = createCountMap(statuses);

  for (const record of records) {
    counts[record.status] = record._count;
  }

  return counts;
}

function toVerificationCounts(
  records: ReadonlyArray<{ _count: number; result: VerificationResult }>,
): Record<VerificationResult, number> {
  const counts = createCountMap(VERIFICATION_RESULTS);

  for (const record of records) {
    counts[record.result] = record._count;
  }

  return counts;
}

function toSummary(
  result: DashboardRepositoryResult,
  generatedAt: Date,
  verificationFrom: Date,
  verificationTrendFrom: Date,
): DashboardSummary {
  const alertCountsBySeverity = createCountMap(ALERT_SEVERITIES);
  const alertCountsByStatus = createCountMap(ALERT_STATUSES);

  for (const record of result.alertCounts) {
    alertCountsBySeverity[record.severity] += record._count;
    alertCountsByStatus[record.status] += record._count;
  }

  const trendByPeriod = new Map<
    string,
    {
      byResult: Record<VerificationResult, number>;
      total: number;
    }
  >();

  for (let offset = 0; offset < DASHBOARD_VERIFICATION_TREND_DAYS; offset += 1) {
    const periodStart = new Date(verificationTrendFrom.getTime() + offset * MILLISECONDS_PER_DAY);

    trendByPeriod.set(periodStart.toISOString(), {
      byResult: createCountMap(VERIFICATION_RESULTS),
      total: 0,
    });
  }

  for (const record of result.verificationTrend) {
    const periodStart = startOfUtcDay(record.periodStart).toISOString();
    const point = trendByPeriod.get(periodStart);

    if (point !== undefined) {
      point.byResult[record.result] = record.count;
      point.total += record.count;
    }
  }

  return {
    alertCounts: {
      bySeverity: alertCountsBySeverity as Record<AlertSeverity, number>,
      byStatus: alertCountsByStatus as Record<AlertStatus, number>,
    },
    batchCountsByStatus: toStatusCounts<BatchStatus>(BATCH_STATUSES, result.batchCounts),
    generatedAt: generatedAt.toISOString(),
    productCountsByStatus: toStatusCounts<ProductStatus>(PRODUCT_STATUSES, result.productCounts),
    recallCountsByStatus: toStatusCounts<RecallStatus>(RECALL_STATUSES, result.recallCounts),
    recentAlerts: result.recentAlerts.map((alert) => ({
      batch:
        alert.batch === null
          ? null
          : {
              code: alert.batch.code,
              id: alert.batch.id,
            },
      createdAt: alert.createdAt.toISOString(),
      id: alert.id,
      product:
        alert.product === null
          ? null
          : {
              id: alert.product.id,
              serialNumber: alert.product.serialNumber,
            },
      rule: alert.rule,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
    })),
    recentCustodyActivity: result.recentCustodyActivity.map((event) => ({
      eventAt: event.eventAt.toISOString(),
      id: event.id,
      location:
        event.location === null
          ? null
          : {
              canton: event.location.canton,
              municipality: event.location.municipality,
              name: event.location.name,
            },
      product: {
        id: event.product.id,
        serialNumber: event.product.serialNumber,
      },
      recordedAt: event.recordedAt.toISOString(),
      type: event.type,
    })),
    recentVerificationTotals: {
      byResult: toVerificationCounts(result.verificationCounts),
      from: verificationFrom.toISOString(),
      to: generatedAt.toISOString(),
    },
    verificationTrend: [...trendByPeriod.entries()].map(([periodStart, point]) => ({
      byResult: point.byResult,
      periodStart,
      total: point.total,
    })),
  };
}

export class DashboardService {
  public constructor(
    private readonly repository: DashboardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getSummary(session: AuthSessionResponse): Promise<DashboardSummary> {
    const generatedAt = this.now();
    const verificationFrom = new Date(
      generatedAt.getTime() - DASHBOARD_VERIFICATION_TOTAL_DAYS * MILLISECONDS_PER_DAY,
    );
    const verificationTrendFrom = new Date(
      startOfUtcDay(generatedAt).getTime() -
        (DASHBOARD_VERIFICATION_TREND_DAYS - 1) * MILLISECONDS_PER_DAY,
    );
    const result = await this.repository.getSummary({
      organizationId: session.user.organization.id,
      recentItemLimit: DASHBOARD_RECENT_ITEM_LIMIT,
      verificationFrom,
      verificationTo: generatedAt,
      verificationTrendFrom,
    });

    return toSummary(result, generatedAt, verificationFrom, verificationTrendFrom);
  }
}

export const dashboardService = new DashboardService(dashboardRepository);
