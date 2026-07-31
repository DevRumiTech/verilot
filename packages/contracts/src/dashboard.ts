import type { AlertRule, AlertSeverity, AlertStatus } from "./alerts.js";
import type { BatchStatus } from "./batches.js";
import type { EventType, ProductStatus } from "./products.js";
import type { RecallStatus } from "./recalls.js";
import type { VerificationResult } from "./verification.js";

export const DASHBOARD_RECENT_ITEM_LIMIT = 10;

export const DASHBOARD_VERIFICATION_TOTAL_DAYS = 30;

export const DASHBOARD_VERIFICATION_TREND_DAYS = 14;

export interface DashboardCustodyActivity {
  eventAt: string;
  id: string;
  location: {
    canton: string;
    municipality: string;
    name: string;
  } | null;
  product: {
    id: string;
    serialNumber: string;
  };
  recordedAt: string;
  type: EventType;
}

export interface DashboardAlert {
  batch: {
    code: string;
    id: string;
  } | null;
  createdAt: string;
  id: string;
  product: {
    id: string;
    serialNumber: string;
  } | null;
  rule: AlertRule;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
}

export interface DashboardVerificationTrendPoint {
  byResult: Readonly<Record<VerificationResult, number>>;
  periodStart: string;
  total: number;
}

export interface DashboardSummary {
  alertCounts: {
    bySeverity: Readonly<Record<AlertSeverity, number>>;
    byStatus: Readonly<Record<AlertStatus, number>>;
  };
  batchCountsByStatus: Readonly<Record<BatchStatus, number>>;
  generatedAt: string;
  productCountsByStatus: Readonly<Record<ProductStatus, number>>;
  recallCountsByStatus: Readonly<Record<RecallStatus, number>>;
  recentAlerts: readonly DashboardAlert[];
  recentCustodyActivity: readonly DashboardCustodyActivity[];
  recentVerificationTotals: {
    byResult: Readonly<Record<VerificationResult, number>>;
    from: string;
    to: string;
  };
  verificationTrend: readonly DashboardVerificationTrendPoint[];
}
