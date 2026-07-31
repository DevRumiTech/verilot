import {
  API_PATHS,
  type AuditRecordDetailResponse,
  type AuditRecordsResponse,
  type JsonValue,
} from "@verilot/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { DetailList } from "../../components/DetailList.js";
import { Pagination, readPage } from "../../components/ListControls.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { readableLabel, StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/formatters.js";
import { moveKeyboardPosition } from "../../lib/keyboard.js";
import { useApiResource } from "../../lib/use-api-resource.js";

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "credential",
  "password",
  "token",
  "secret",
  "session",
  "cookie",
  "csrf",
  "apikey",
  "keyhash",
  "passwordhash",
  "tokenhash",
  "csrfhash",
  "iphash",
  "useragenthash",
] as const;

const TEXT_FILTERS = [
  "search",
  "action",
  "entityType",
  "entityId",
  "actorId",
  "requestId",
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function redactAuditJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactAuditJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactAuditJson(nested),
      ]),
    );
  }

  return value;
}

function dateInputValue(value: string | null): string {
  if (value === null || Number.isNaN(Date.parse(value))) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function dateToIso(value: string, endOfDay: boolean): string {
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function buildAuditPath(parameters: URLSearchParams): string {
  const query = new URLSearchParams({
    page: String(readPage(parameters)),
    pageSize: "20",
  });

  for (const name of TEXT_FILTERS) {
    const value = parameters.get(name)?.trim();

    if (value !== undefined && value.length > 0) {
      query.set(name, value.slice(0, 100));
    }
  }

  for (const name of ["createdFrom", "createdTo"] as const) {
    const value = parameters.get(name);

    if (value !== null && !Number.isNaN(Date.parse(value))) {
      query.set(name, new Date(value).toISOString());
    }
  }

  return `${API_PATHS.auditRecords}?${query.toString()}`;
}

interface AuditControlValues {
  action: string;
  actorId: string;
  createdFrom: string;
  createdTo: string;
  entityId: string;
  entityType: string;
  requestId: string;
  search: string;
}

function readControlValues(parameters: URLSearchParams): AuditControlValues {
  return {
    action: parameters.get("action") ?? "",
    actorId: parameters.get("actorId") ?? "",
    createdFrom: dateInputValue(parameters.get("createdFrom")),
    createdTo: dateInputValue(parameters.get("createdTo")),
    entityId: parameters.get("entityId") ?? "",
    entityType: parameters.get("entityType") ?? "",
    requestId: parameters.get("requestId") ?? "",
    search: parameters.get("search") ?? "",
  };
}

function AuditControls() {
  const [parameters, setParameters] = useSearchParams();
  const [values, setValues] = useState<AuditControlValues>(() => readControlValues(parameters));
  const [dateError, setDateError] = useState<string | null>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const hasFilters = Object.values(values).some((value) => value.trim().length > 0);

  useEffect(() => {
    setValues(readControlValues(parameters));
    setDateError(null);
  }, [parameters]);

  function update(name: keyof AuditControlValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (
      values.createdFrom !== "" &&
      values.createdTo !== "" &&
      values.createdFrom > values.createdTo
    ) {
      setDateError("The start date must not be after the end date.");
      moveKeyboardPosition(fromInputRef.current);
      return;
    }

    const next = new URLSearchParams();

    for (const name of TEXT_FILTERS) {
      const value = values[name].trim();
      if (value.length > 0) {
        next.set(name, value.slice(0, 100));
      }
    }

    if (values.createdFrom !== "") {
      next.set("createdFrom", dateToIso(values.createdFrom, false));
    }

    if (values.createdTo !== "") {
      next.set("createdTo", dateToIso(values.createdTo, true));
    }

    next.set("page", "1");
    setDateError(null);
    setParameters(next);
  }

  function clearFilters(): void {
    setValues(readControlValues(new URLSearchParams()));
    setDateError(null);
    setParameters(new URLSearchParams({ page: "1" }));
  }

  return (
    <form className="surface list-controls list-controls-many audit-controls" onSubmit={submit}>
      <div className="field">
        <label htmlFor="audit-search">Search audit history</label>
        <input
          id="audit-search"
          maxLength={100}
          name="search"
          onChange={(event) => update("search", event.target.value)}
          type="search"
          value={values.search}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-action">Action</label>
        <input
          id="audit-action"
          maxLength={100}
          name="action"
          onChange={(event) => update("action", event.target.value)}
          value={values.action}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-entity-type">Entity type</label>
        <input
          id="audit-entity-type"
          maxLength={80}
          name="entityType"
          onChange={(event) => update("entityType", event.target.value)}
          value={values.entityType}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-entity-id">Entity identifier</label>
        <input
          id="audit-entity-id"
          maxLength={100}
          name="entityId"
          onChange={(event) => update("entityId", event.target.value)}
          value={values.entityId}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-actor-id">Actor identifier</label>
        <input
          id="audit-actor-id"
          name="actorId"
          onChange={(event) => update("actorId", event.target.value)}
          value={values.actorId}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-request-id">Request identifier</label>
        <input
          id="audit-request-id"
          maxLength={100}
          name="requestId"
          onChange={(event) => update("requestId", event.target.value)}
          value={values.requestId}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-created-from">Created from</label>
        <input
          aria-describedby={dateError === null ? undefined : "audit-date-error"}
          aria-invalid={dateError === null ? "false" : "true"}
          id="audit-created-from"
          name="createdFrom"
          onChange={(event) => update("createdFrom", event.target.value)}
          ref={fromInputRef}
          type="date"
          value={values.createdFrom}
        />
      </div>
      <div className="field">
        <label htmlFor="audit-created-to">Created to</label>
        <input
          aria-describedby={dateError === null ? undefined : "audit-date-error"}
          aria-invalid={dateError === null ? "false" : "true"}
          id="audit-created-to"
          name="createdTo"
          onChange={(event) => update("createdTo", event.target.value)}
          type="date"
          value={values.createdTo}
        />
      </div>
      {dateError === null ? null : (
        <p className="field-error controls-error" id="audit-date-error" role="alert">
          {dateError}
        </p>
      )}
      <div className="control-actions">
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
        {hasFilters ? (
          <button className="button button-secondary" onClick={clearFilters} type="button">
            Clear filters
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AuditListPage() {
  const [parameters] = useSearchParams();
  const resource = useApiResource<AuditRecordsResponse>(buildAuditPath(parameters));

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Administrator record</p>
        <h1 id="page-title">Audit</h1>
        <p>Inspect immutable administrative and operational history for your organization.</p>
      </header>

      <AuditControls />
      {resource.status === "loading" ? <LoadingState label="Loading audit history…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.auditRecords.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No audit records found">
              Adjust the current filters and try again.
            </EmptyState>
          </section>
        ) : (
          <>
            <div className="surface table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Audit records matching the current filters
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Created</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Request</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.auditRecords.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Created">{formatDateTime(record.createdAt)}</td>
                      <th data-label="Action" scope="row">
                        <Link to={`/audit/${record.id}`}>{readableLabel(record.action)}</Link>
                      </th>
                      <td data-label="Entity">
                        {record.entityType} · {record.entityId}
                      </td>
                      <td data-label="Actor">
                        {record.actor?.displayName ?? record.actorEmail ?? "System"}
                      </td>
                      <td data-label="Request">{record.requestId}</td>
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

function AuditJsonPanel({ title, value }: { title: string; value: JsonValue | null }) {
  return (
    <section className="surface panel" aria-labelledby={`${title.toLowerCase()}-data-title`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Redacted payload</p>
          <h2 id={`${title.toLowerCase()}-data-title`}>{title} data</h2>
        </div>
      </div>
      {value === null ? (
        <EmptyState title={`No ${title.toLowerCase()} data`}>
          This audit record does not contain a corresponding payload.
        </EmptyState>
      ) : (
        <pre className="json-block">{JSON.stringify(redactAuditJson(value), null, 2)}</pre>
      )}
    </section>
  );
}

function AuditDetailContent({ response }: { response: AuditRecordDetailResponse }) {
  const record = response.auditRecord;

  return (
    <>
      <section className="surface detail-card" aria-labelledby="audit-overview-title">
        <div className="detail-heading">
          <div>
            <p className="eyebrow">Immutable record</p>
            <h2 id="audit-overview-title">{readableLabel(record.action)}</h2>
          </div>
          <StatusBadge value={record.actorRole ?? "SYSTEM"} />
        </div>
        <DetailList
          items={[
            { label: "Created", value: formatDateTime(record.createdAt) },
            { label: "Entity type", value: record.entityType },
            { label: "Entity identifier", value: record.entityId },
            { label: "Actor", value: record.actor?.displayName ?? record.actorEmail ?? "System" },
            {
              label: "Actor role",
              value: record.actorRole === null ? "System" : readableLabel(record.actorRole),
            },
            { label: "Request identifier", value: record.requestId },
            { label: "Reason", value: record.reason ?? "Not provided" },
          ]}
        />
      </section>
      <div className="detail-grid">
        <AuditJsonPanel title="Before" value={record.beforeData} />
        <AuditJsonPanel title="After" value={record.afterData} />
      </div>
    </>
  );
}

export function AuditDetailPage() {
  const { auditRecordId = "" } = useParams();
  const resource = useApiResource<AuditRecordDetailResponse>(
    `${API_PATHS.auditRecords}/${auditRecordId}`,
  );

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header detail-page-header">
        <div>
          <p className="eyebrow">Audit detail</p>
          <h1 id="page-title">Record history</h1>
        </div>
        <Link className="button button-secondary" to="/audit">
          Back to audit
        </Link>
      </header>
      {resource.status === "loading" ? <LoadingState label="Loading audit record…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? <AuditDetailContent response={resource.data} /> : null}
    </section>
  );
}
