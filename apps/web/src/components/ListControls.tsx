import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { readableLabel } from "./StatusBadge.js";

function positivePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : 1;
}

export function readPage(parameters: URLSearchParams): number {
  return positivePage(parameters.get("page"));
}

export function readEnum<T extends string>(
  parameters: URLSearchParams,
  name: string,
  values: readonly T[],
): T | "" {
  const value = parameters.get(name);
  return value !== null && values.includes(value as T) ? (value as T) : "";
}

export function buildListPath(
  basePath: string,
  parameters: URLSearchParams,
  allowedStatuses: readonly string[],
  includeBatch = false,
): string {
  const query = new URLSearchParams({
    page: String(readPage(parameters)),
    pageSize: "20",
  });
  const search = parameters.get("search")?.trim();
  const status = parameters.get("status");
  const batchId = parameters.get("batchId");

  if (search !== undefined && search.length > 0) {
    query.set("search", search.slice(0, 100));
  }

  if (status !== null && allowedStatuses.includes(status)) {
    query.set("status", status);
  }

  if (includeBatch && batchId !== null && batchId.length > 0) {
    query.set("batchId", batchId);
  }

  return `${basePath}?${query.toString()}`;
}

export function ListControls<T extends string>({
  searchLabel,
  statuses,
}: {
  searchLabel: string;
  statuses: readonly T[];
}) {
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState(parameters.get("search") ?? "");
  const status = readEnum(parameters, "status", statuses);
  const hasFilters = search.trim().length > 0 || status !== "" || parameters.has("batchId");

  useEffect(() => {
    setSearch(parameters.get("search") ?? "");
  }, [parameters]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = new URLSearchParams(parameters);
    const trimmed = search.trim();

    if (trimmed.length === 0) {
      next.delete("search");
    } else {
      next.set("search", trimmed.slice(0, 100));
    }

    next.set("page", "1");
    setParameters(next);
  }

  function changeStatus(value: string): void {
    const next = new URLSearchParams(parameters);

    if (value === "") {
      next.delete("status");
    } else {
      next.set("status", value);
    }

    next.set("page", "1");
    setParameters(next);
  }

  function clearFilters(): void {
    const next = new URLSearchParams();
    next.set("page", "1");
    setParameters(next);
    setSearch("");
  }

  return (
    <form className="surface list-controls" onSubmit={submit} role="search">
      <div className="field search-field">
        <label htmlFor="list-search">{searchLabel}</label>
        <input
          id="list-search"
          maxLength={100}
          name="search"
          onChange={(event) => setSearch(event.target.value)}
          type="search"
          value={search}
        />
      </div>
      <div className="field status-field">
        <label htmlFor="list-status">Status</label>
        <select
          id="list-status"
          name="status"
          onChange={(event) => changeStatus(event.target.value)}
          value={status}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
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
          <button className="button button-secondary" onClick={clearFilters} type="button">
            Clear filters
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function Pagination({
  page,
  totalItems,
  totalPages,
}: {
  page: number;
  totalItems: number;
  totalPages: number;
}) {
  const [parameters, setParameters] = useSearchParams();
  const boundedTotalPages = Math.max(1, totalPages);

  function moveTo(nextPage: number): void {
    const next = new URLSearchParams(parameters);
    next.set("page", String(nextPage));
    setParameters(next);
  }

  return (
    <nav aria-label="Pagination" className="pagination">
      <p>
        Page {page.toLocaleString("en-CH")} of {boundedTotalPages.toLocaleString("en-CH")} ·{" "}
        {totalItems.toLocaleString("en-CH")} records
      </p>
      <div>
        <button
          className="button button-secondary"
          disabled={page <= 1}
          onClick={() => moveTo(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className="button button-secondary"
          disabled={page >= boundedTotalPages}
          onClick={() => moveTo(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
