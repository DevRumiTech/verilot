import {
  ALERT_RULES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  API_PATHS,
  type AlertDetailResponse,
  type AlertsResponse,
} from "@verilot/contracts";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { DetailList } from "../../components/DetailList.js";
import { Pagination, readEnum, readPage } from "../../components/ListControls.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { readableLabel, StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/formatters.js";
import { useApiResource } from "../../lib/use-api-resource.js";
import { AlertWorkflow } from "./AlertWorkflow.js";

function alertListPath(parameters: URLSearchParams): string {
  const query = new URLSearchParams({ page: String(readPage(parameters)), pageSize: "20" });
  const search = parameters.get("search")?.trim();

  if (search !== undefined && search.length > 0) {
    query.set("search", search.slice(0, 100));
  }

  for (const [name, values] of [
    ["status", ALERT_STATUSES],
    ["severity", ALERT_SEVERITIES],
    ["rule", ALERT_RULES],
  ] as const) {
    const value = parameters.get(name);

    if (value !== null && values.includes(value as never)) {
      query.set(name, value);
    }
  }

  for (const linkedField of ["assignedToId", "batchId", "productId"] as const) {
    const value = parameters.get(linkedField);

    if (value !== null && value.length > 0) {
      query.set(linkedField, value);
    }
  }

  return `${API_PATHS.alerts}?${query.toString()}`;
}

function AlertControls() {
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState(parameters.get("search") ?? "");
  const status = readEnum(parameters, "status", ALERT_STATUSES);
  const severity = readEnum(parameters, "severity", ALERT_SEVERITIES);
  const rule = readEnum(parameters, "rule", ALERT_RULES);
  const hasFilters =
    search.trim().length > 0 ||
    status !== "" ||
    severity !== "" ||
    rule !== "" ||
    ["assignedToId", "batchId", "productId"].some((name) => parameters.has(name));

  function update(name: string, value: string): void {
    const next = new URLSearchParams(parameters);
    value === "" ? next.delete(name) : next.set(name, value);
    next.set("page", "1");
    setParameters(next);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    update("search", search.trim().slice(0, 100));
  }

  function clear(): void {
    setSearch("");
    setParameters({ page: "1" });
  }

  return (
    <form className="surface list-controls list-controls-many" onSubmit={submit} role="search">
      <div className="field search-field">
        <label htmlFor="alert-search">Search alerts</label>
        <input
          id="alert-search"
          maxLength={100}
          name="search"
          onChange={(event) => setSearch(event.target.value)}
          type="search"
          value={search}
        />
      </div>
      <div className="field">
        <label htmlFor="alert-status">Status</label>
        <select
          id="alert-status"
          name="status"
          onChange={(event) => update("status", event.target.value)}
          value={status}
        >
          <option value="">All statuses</option>
          {ALERT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {readableLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="alert-severity">Severity</label>
        <select
          id="alert-severity"
          name="severity"
          onChange={(event) => update("severity", event.target.value)}
          value={severity}
        >
          <option value="">All severities</option>
          {ALERT_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {readableLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="alert-rule">Rule</label>
        <select
          id="alert-rule"
          name="rule"
          onChange={(event) => update("rule", event.target.value)}
          value={rule}
        >
          <option value="">All rules</option>
          {ALERT_RULES.map((value) => (
            <option key={value} value={value}>
              {readableLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="control-actions">
        <button className="button button-primary" type="submit">
          Search
        </button>
        {hasFilters ? (
          <button className="button button-secondary" onClick={clear} type="button">
            Clear filters
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AlertListPage() {
  const [parameters] = useSearchParams();
  const resource = useApiResource<AlertsResponse>(alertListPath(parameters));

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Anomaly review</p>
        <h1 id="page-title">Alerts</h1>
        <p>Investigate product movement and verification rules that require review.</p>
      </header>
      <AlertControls />
      {resource.status === "loading" ? <LoadingState label="Loading alerts…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.alerts.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No alerts found">
              Adjust the current filters and try again.
            </EmptyState>
          </section>
        ) : (
          <>
            <div className="surface table-wrap">
              <table className="data-table alerts-table">
                <caption className="visually-hidden">Alerts matching the current filters</caption>
                <thead>
                  <tr>
                    <th scope="col">Alert</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Rule</th>
                    <th scope="col">Related record</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.alerts.map((alert) => (
                    <tr key={alert.id}>
                      <th data-label="Alert" scope="row">
                        <Link to={`/alerts/${alert.id}`}>{alert.title}</Link>
                      </th>
                      <td data-label="Severity">
                        <StatusBadge value={alert.severity} />
                      </td>
                      <td data-label="Status">
                        <StatusBadge value={alert.status} />
                      </td>
                      <td data-label="Rule">{readableLabel(alert.rule)}</td>
                      <td data-label="Related record">
                        {alert.product !== null ? (
                          <Link to={`/products/${alert.product.id}`}>
                            {alert.product.serialNumber}
                          </Link>
                        ) : alert.batch !== null ? (
                          <Link to={`/batches/${alert.batch.id}`}>{alert.batch.code}</Link>
                        ) : (
                          "Verification record"
                        )}
                      </td>
                      <td data-label="Assigned to">
                        {alert.assignedTo?.displayName ?? "Unassigned"}
                      </td>
                      <td data-label="Created">{formatDateTime(alert.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...resource.data.pagination} />
          </>
        )
      ) : null}
    </section>
  );
}

function AlertDetailContent({
  onWorkflowComplete,
  response,
}: {
  onWorkflowComplete(message: string): void;
  response: AlertDetailResponse;
}) {
  const alert = response.alert;

  return (
    <>
      <section className="surface detail-card" aria-labelledby="alert-overview-title">
        <div className="detail-heading">
          <div>
            <p className="eyebrow">{readableLabel(alert.rule)}</p>
            <h2 id="alert-overview-title">{alert.title}</h2>
          </div>
          <div className="badge-group">
            <StatusBadge value={alert.severity} />
            <StatusBadge value={alert.status} />
          </div>
        </div>
        <p className="detail-summary">{alert.summary}</p>
        <DetailList
          items={[
            { label: "Created", value: formatDateTime(alert.createdAt) },
            { label: "Updated", value: formatDateTime(alert.updatedAt) },
            { label: "Assigned to", value: alert.assignedTo?.displayName ?? "Unassigned" },
            { label: "Resolved by", value: alert.resolvedBy?.displayName ?? "No decision" },
            {
              label: "Decision date",
              value: alert.decisionAt === null ? "No decision" : formatDateTime(alert.decisionAt),
            },
            { label: "Review notes", value: alert.reviewNotes ?? "No review notes" },
            { label: "Evidence request", value: alert.evidenceRequest ?? "No evidence requested" },
          ]}
        />
      </section>

      <AlertWorkflow alert={alert} onComplete={onWorkflowComplete} />

      <div className="detail-grid">
        <section className="surface panel" aria-labelledby="alert-links-title">
          <div className="panel-heading">
            <h2 id="alert-links-title">Related records</h2>
          </div>
          <ul className="related-list">
            {alert.product === null ? null : (
              <li>
                <span>Product</span>
                <Link to={`/products/${alert.product.id}`}>{alert.product.serialNumber}</Link>
              </li>
            )}
            {alert.batch === null ? null : (
              <li>
                <span>Batch</span>
                <Link to={`/batches/${alert.batch.id}`}>{alert.batch.code}</Link>
              </li>
            )}
            {alert.custodyEvent === null ? null : (
              <li>
                <span>Custody event</span>
                <span>
                  {readableLabel(alert.custodyEvent.type)} ·{" "}
                  {formatDateTime(alert.custodyEvent.eventAt)}
                </span>
              </li>
            )}
            {alert.verificationAttempt === null ? null : (
              <li>
                <span>Verification</span>
                <span>
                  {alert.verificationAttempt.serialNumber} ·{" "}
                  {readableLabel(alert.verificationAttempt.result)}
                </span>
              </li>
            )}
          </ul>
        </section>

        <section className="surface panel" aria-labelledby="alert-evidence-title">
          <div className="panel-heading">
            <h2 id="alert-evidence-title">Evidence details</h2>
          </div>
          <pre className="json-block">{JSON.stringify(alert.details, null, 2)}</pre>
        </section>
      </div>
    </>
  );
}

export function AlertDetailPage() {
  const { alertId = "" } = useParams();
  const resource = useApiResource<AlertDetailResponse>(`${API_PATHS.alerts}/${alertId}`);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  function handleWorkflowComplete(message: string): void {
    setWorkflowMessage(message);
    resource.retry();
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header detail-page-header">
        <div>
          <p className="eyebrow">Alert detail</p>
          <h1 id="page-title">Investigation record</h1>
        </div>
        <Link className="button button-secondary" to="/alerts">
          Back to alerts
        </Link>
      </header>
      {workflowMessage === null ? null : (
        <p className="notice success-notice" role="status">
          {workflowMessage}
        </p>
      )}
      {resource.status === "loading" ? <LoadingState label="Loading alert…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        <AlertDetailContent onWorkflowComplete={handleWorkflowComplete} response={resource.data} />
      ) : null}
    </section>
  );
}
