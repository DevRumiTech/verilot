import {
  ALERT_SEVERITIES,
  API_PATHS,
  BATCH_STATUSES,
  PRODUCT_STATUSES,
  RECALL_STATUSES,
  VERIFICATION_RESULTS,
  type DashboardSummary,
} from "@verilot/contracts";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { readableLabel, StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/formatters.js";
import { useApiResource } from "../../lib/use-api-resource.js";

function sumCounts<T extends string>(values: Readonly<Record<T, number>>): number {
  return (Object.keys(values) as T[]).reduce((total, key) => total + values[key], 0);
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="surface metric-card">
      <span>{label}</span>
      <strong>{value.toLocaleString("en-CH")}</strong>
    </article>
  );
}

function CountList<T extends string>({
  counts,
  values,
}: {
  counts: Readonly<Record<T, number>>;
  values: readonly T[];
}) {
  return (
    <ul className="count-list">
      {values.map((value) => (
        <li key={value}>
          <StatusBadge value={value} />
          <strong>{counts[value].toLocaleString("en-CH")}</strong>
        </li>
      ))}
    </ul>
  );
}

function VerificationTrend({ summary }: { summary: DashboardSummary }) {
  const maximum = Math.max(1, ...summary.verificationTrend.map((point) => point.total));

  if (summary.verificationTrend.length === 0) {
    return (
      <EmptyState title="No verification trend">
        Verification activity will appear after checks are recorded.
      </EmptyState>
    );
  }

  return (
    <ol className="trend-list" aria-label="Verification activity by day">
      {summary.verificationTrend.map((point) => (
        <li key={point.periodStart}>
          <div className="trend-label">
            <span>{formatDateTime(point.periodStart)}</span>
            <strong>{point.total.toLocaleString("en-CH")}</strong>
          </div>
          <div className="trend-track" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (point.total / maximum) * 100)}%` }} />
          </div>
          <span className="visually-hidden">
            {VERIFICATION_RESULTS.map(
              (result) => `${readableLabel(result)} ${point.byResult[result]}`,
            ).join(", ")}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const activeAlertCount =
    summary.alertCounts.byStatus.OPEN +
    summary.alertCounts.byStatus.IN_REVIEW +
    summary.alertCounts.byStatus.EVIDENCE_REQUESTED;

  return (
    <>
      <div className="metric-grid" aria-label="Operational totals">
        <MetricCard label="Products" value={sumCounts(summary.productCountsByStatus)} />
        <MetricCard label="Batches" value={sumCounts(summary.batchCountsByStatus)} />
        <MetricCard label="Active alerts" value={activeAlertCount} />
        <MetricCard label="Active recalls" value={summary.recallCountsByStatus.ACTIVE} />
      </div>

      <div className="dashboard-grid">
        <section className="surface panel" aria-labelledby="product-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inventory state</p>
              <h2 id="product-status-title">Products</h2>
            </div>
            <Link to="/products">View products</Link>
          </div>
          <CountList counts={summary.productCountsByStatus} values={PRODUCT_STATUSES} />
        </section>

        <section className="surface panel" aria-labelledby="batch-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Lot state</p>
              <h2 id="batch-status-title">Batches</h2>
            </div>
            <Link to="/batches">View batches</Link>
          </div>
          <CountList counts={summary.batchCountsByStatus} values={BATCH_STATUSES} />
        </section>

        <section className="surface panel" aria-labelledby="alert-severity-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Anomaly load</p>
              <h2 id="alert-severity-title">Alerts by severity</h2>
            </div>
            <Link to="/alerts">View alerts</Link>
          </div>
          <CountList counts={summary.alertCounts.bySeverity} values={ALERT_SEVERITIES} />
        </section>

        <section className="surface panel" aria-labelledby="recall-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Response state</p>
              <h2 id="recall-status-title">Recalls</h2>
            </div>
            <Link to="/recalls">View recalls</Link>
          </div>
          <CountList counts={summary.recallCountsByStatus} values={RECALL_STATUSES} />
        </section>
      </div>

      <section className="surface panel panel-wide" aria-labelledby="verification-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Last 30 days</p>
            <h2 id="verification-title">Verification activity</h2>
          </div>
          <span className="panel-note">
            {formatDateTime(summary.recentVerificationTotals.from)} –{" "}
            {formatDateTime(summary.recentVerificationTotals.to)}
          </span>
        </div>
        <CountList
          counts={summary.recentVerificationTotals.byResult}
          values={VERIFICATION_RESULTS}
        />
        <VerificationTrend summary={summary} />
      </section>

      <div className="dashboard-grid dashboard-grid-lists">
        <section className="surface panel" aria-labelledby="recent-alerts-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Newest first</p>
              <h2 id="recent-alerts-title">Recent alerts</h2>
            </div>
          </div>
          {summary.recentAlerts.length === 0 ? (
            <EmptyState title="No recent alerts">New anomaly alerts will appear here.</EmptyState>
          ) : (
            <ul className="record-list">
              {summary.recentAlerts.map((alert) => (
                <li key={alert.id}>
                  <div>
                    <Link to={`/alerts/${alert.id}`}>{alert.title}</Link>
                    <span>{formatDateTime(alert.createdAt)}</span>
                  </div>
                  <StatusBadge value={alert.severity} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface panel" aria-labelledby="recent-custody-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Latest records</p>
              <h2 id="recent-custody-title">Custody activity</h2>
            </div>
          </div>
          {summary.recentCustodyActivity.length === 0 ? (
            <EmptyState title="No recent custody records">
              New product events will appear here.
            </EmptyState>
          ) : (
            <ul className="record-list">
              {summary.recentCustodyActivity.map((activity) => (
                <li key={activity.id}>
                  <div>
                    <Link to={`/products/${activity.product.id}`}>
                      {activity.product.serialNumber}
                    </Link>
                    <span>
                      {readableLabel(activity.type)} · {formatDateTime(activity.eventAt)}
                    </span>
                  </div>
                  <span className="location-label">
                    {activity.location === null
                      ? "Location unavailable"
                      : `${activity.location.municipality}, ${activity.location.canton}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="generated-at">Summary generated {formatDateTime(summary.generatedAt)}</p>
    </>
  );
}

export function DashboardPage() {
  const resource = useApiResource<DashboardSummary>(API_PATHS.dashboardSummary);

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Operational overview</p>
        <h1 id="page-title">Dashboard</h1>
        <p>Current product movement, verification, anomaly, and recall activity.</p>
      </header>

      {resource.status === "loading" ? <LoadingState label="Loading dashboard…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? <DashboardContent summary={resource.data} /> : null}
    </section>
  );
}
