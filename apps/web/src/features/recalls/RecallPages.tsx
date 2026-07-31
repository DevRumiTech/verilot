import {
  API_PATHS,
  RECALL_STATUSES,
  type RecallDetailResponse,
  type RecallsResponse,
} from "@verilot/contracts";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DetailList } from "../../components/DetailList.js";
import { Pagination, readEnum, readPage } from "../../components/ListControls.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { readableLabel, StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/formatters.js";
import { useApiResource } from "../../lib/use-api-resource.js";
import { CompleteRecallButton, CreateRecallButton } from "./RecallWorkflow.js";

function toIsoDate(value: string, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function recallListPath(parameters: URLSearchParams): string {
  const query = new URLSearchParams({ page: String(readPage(parameters)), pageSize: "20" });
  const search = parameters.get("search")?.trim();
  const status = readEnum(parameters, "status", RECALL_STATUSES);
  const announcedFrom = toIsoDate(parameters.get("from") ?? "");
  const announcedTo = toIsoDate(parameters.get("to") ?? "", true);

  if (search !== undefined && search.length > 0) query.set("search", search.slice(0, 100));
  if (status !== "") query.set("status", status);
  if (announcedFrom !== null) query.set("announcedFrom", announcedFrom);
  if (announcedTo !== null) query.set("announcedTo", announcedTo);

  const batchId = parameters.get("batchId");
  if (batchId !== null && batchId.length > 0) query.set("batchId", batchId);

  return `${API_PATHS.recalls}?${query.toString()}`;
}

function RecallControls() {
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState(parameters.get("search") ?? "");
  const [fromInput, setFromInput] = useState(parameters.get("from") ?? "");
  const [toInput, setToInput] = useState(parameters.get("to") ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const status = readEnum(parameters, "status", RECALL_STATUSES);

  function update(name: string, value: string): void {
    const next = new URLSearchParams(parameters);
    value === "" ? next.delete(name) : next.set(name, value);
    next.set("page", "1");
    setParameters(next);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (fromInput !== "" && toInput !== "" && fromInput > toInput) {
      setDateError("The start date must not be after the end date.");
      return;
    }

    setDateError(null);
    const next = new URLSearchParams(parameters);

    for (const [name, value] of [
      ["search", search.trim().slice(0, 100)],
      ["from", fromInput],
      ["to", toInput],
    ] as const) {
      value === "" ? next.delete(name) : next.set(name, value);
    }

    next.set("page", "1");
    setParameters(next);
  }

  function clear(): void {
    setSearch("");
    setFromInput("");
    setToInput("");
    setDateError(null);
    setParameters({ page: "1" });
  }

  const hasFilters =
    search.trim().length > 0 || status !== "" || fromInput !== "" || toInput !== "";

  return (
    <form className="surface list-controls recall-controls" onSubmit={submit} role="search">
      <div className="field search-field">
        <label htmlFor="recall-search">Search recalls</label>
        <input
          id="recall-search"
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          type="search"
          value={search}
        />
      </div>
      <div className="field">
        <label htmlFor="recall-status">Status</label>
        <select
          id="recall-status"
          onChange={(event) => update("status", event.target.value)}
          value={status}
        >
          <option value="">All statuses</option>
          {RECALL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {readableLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="recall-from">Announced from</label>
        <input
          id="recall-from"
          onChange={(event) => setFromInput(event.target.value)}
          type="date"
          value={fromInput}
        />
      </div>
      <div className="field">
        <label htmlFor="recall-to">Announced to</label>
        <input
          id="recall-to"
          onChange={(event) => setToInput(event.target.value)}
          type="date"
          value={toInput}
        />
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
      <p aria-live="polite" className="form-error controls-error">
        {dateError}
      </p>
    </form>
  );
}

export function RecallListPage() {
  const [parameters] = useSearchParams();
  const resource = useApiResource<RecallsResponse>(recallListPath(parameters));
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  function handleWorkflowComplete(message: string): void {
    setWorkflowMessage(message);
    resource.retry();
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header page-header-action">
        <div>
          <p className="eyebrow">Batch response</p>
          <h1 id="page-title">Recalls</h1>
          <p>Track announced actions, affected lots, product totals, and completion state.</p>
        </div>
        <CreateRecallButton onComplete={handleWorkflowComplete} />
      </header>
      {workflowMessage === null ? null : (
        <p className="notice success-notice" role="status">
          {workflowMessage}
        </p>
      )}
      <RecallControls />
      {resource.status === "loading" ? <LoadingState label="Loading recalls…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.recalls.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No recalls found">
              Adjust the current filters and try again.
            </EmptyState>
          </section>
        ) : (
          <>
            <div className="surface table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">Recalls matching the current filters</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Batch</th>
                    <th scope="col">Product</th>
                    <th scope="col">Status</th>
                    <th scope="col">Announced</th>
                    <th scope="col">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.recalls.map((recall) => (
                    <tr key={recall.id}>
                      <td data-label="Reference">
                        <Link to={`/recalls/${recall.id}`}>{recall.reference}</Link>
                      </td>
                      <td data-label="Batch">
                        <Link to={`/batches/${recall.batch.id}`}>{recall.batch.code}</Link>
                      </td>
                      <td data-label="Product">{recall.batch.productName}</td>
                      <td data-label="Status">
                        <StatusBadge value={recall.status} />
                      </td>
                      <td data-label="Announced">{formatDateTime(recall.announcedAt)}</td>
                      <td data-label="Completed">
                        {recall.completedAt === null
                          ? "Not completed"
                          : formatDateTime(recall.completedAt)}
                      </td>
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

export function RecallDetailPage() {
  const { recallId = "" } = useParams();
  const resource = useApiResource<RecallDetailResponse>(`${API_PATHS.recalls}/${recallId}`);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);

  function handleWorkflowComplete(message: string): void {
    setWorkflowMessage(message);
    resource.retry();
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header detail-page-header">
        <div>
          <p className="eyebrow">Recall detail</p>
          <h1 id="page-title">Response record</h1>
        </div>
        <Link className="button button-secondary" to="/recalls">
          Back to recalls
        </Link>
      </header>
      {workflowMessage === null ? null : (
        <p className="notice success-notice" role="status">
          {workflowMessage}
        </p>
      )}
      {resource.status === "loading" ? <LoadingState label="Loading recall…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        <>
          <section className="surface detail-card" aria-labelledby="recall-overview-title">
            <div className="detail-heading">
              <div>
                <p className="eyebrow">{resource.data.recall.batch.productName}</p>
                <h2 id="recall-overview-title">{resource.data.recall.reference}</h2>
              </div>
              <StatusBadge value={resource.data.recall.status} />
            </div>
            <p className="detail-summary">{resource.data.recall.reason}</p>
            <DetailList
              items={[
                {
                  label: "Batch",
                  value: (
                    <Link to={`/batches/${resource.data.recall.batch.id}`}>
                      {resource.data.recall.batch.code}
                    </Link>
                  ),
                },
                { label: "Lot number", value: resource.data.recall.batch.lotNumber },
                { label: "SKU", value: resource.data.recall.batch.sku },
                { label: "Announced", value: formatDateTime(resource.data.recall.announcedAt) },
                {
                  label: "Completed",
                  value:
                    resource.data.recall.completedAt === null
                      ? "Not completed"
                      : formatDateTime(resource.data.recall.completedAt),
                },
                { label: "Created by", value: resource.data.recall.createdBy.displayName },
                {
                  label: "Affected products",
                  value: resource.data.recall.productCount.toLocaleString("en-CH"),
                },
                {
                  label: "Recall custody records",
                  value: resource.data.recall.custodyEventCount.toLocaleString("en-CH"),
                },
              ]}
            />
          </section>
          <div className="detail-action-row">
            <CompleteRecallButton
              onComplete={handleWorkflowComplete}
              recall={resource.data.recall}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
