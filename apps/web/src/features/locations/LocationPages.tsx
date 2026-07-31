import { API_PATHS, type LocationsResponse } from "@verilot/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { EmptyState, ErrorState, LoadingState } from "../../components/ResourceState.js";
import { useApiResource } from "../../lib/use-api-resource.js";

const CANTONS = [
  "AG",
  "AI",
  "AR",
  "BE",
  "BL",
  "BS",
  "FR",
  "GE",
  "GL",
  "GR",
  "JU",
  "LU",
  "NE",
  "NW",
  "OW",
  "SG",
  "SH",
  "SO",
  "SZ",
  "TG",
  "TI",
  "UR",
  "VD",
  "VS",
  "ZG",
  "ZH",
] as const;

function buildLocationPath(parameters: URLSearchParams): string {
  const query = new URLSearchParams();
  const search = parameters.get("search")?.trim();
  const canton = parameters.get("canton")?.toUpperCase();

  if (search !== undefined && search.length > 0) {
    query.set("search", search.slice(0, 100));
  }

  if (canton !== undefined && CANTONS.includes(canton as (typeof CANTONS)[number])) {
    query.set("canton", canton);
  }

  const suffix = query.toString();
  return suffix.length === 0 ? API_PATHS.locations : `${API_PATHS.locations}?${suffix}`;
}

function LocationControls() {
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState(parameters.get("search") ?? "");
  const canton = parameters.get("canton")?.toUpperCase() ?? "";
  const validCanton = CANTONS.includes(canton as (typeof CANTONS)[number]) ? canton : "";
  const hasFilters = search.trim().length > 0 || validCanton !== "";

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

    setParameters(next);
  }

  function changeSearch(value: string): void {
    setSearch(value);

    if (value.trim().length !== 0 || !parameters.has("search")) {
      return;
    }

    const next = new URLSearchParams(parameters);
    next.delete("search");
    setParameters(next);
  }

  function changeCanton(value: string): void {
    const next = new URLSearchParams(parameters);

    if (value === "") {
      next.delete("canton");
    } else {
      next.set("canton", value);
    }

    setParameters(next);
  }

  function clearFilters(): void {
    setSearch("");
    setParameters(new URLSearchParams());
  }

  return (
    <form className="surface list-controls" onSubmit={submit} role="search">
      <div className="field search-field">
        <label htmlFor="location-search">Search locations</label>
        <input
          id="location-search"
          maxLength={100}
          name="search"
          onChange={(event) => changeSearch(event.target.value)}
          type="search"
          value={search}
        />
      </div>
      <div className="field status-field">
        <label htmlFor="location-canton">Canton</label>
        <select
          id="location-canton"
          name="canton"
          onChange={(event) => changeCanton(event.target.value)}
          value={validCanton}
        >
          <option value="">All cantons</option>
          {CANTONS.map((value) => (
            <option key={value} value={value}>
              {value}
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

export function LocationListPage() {
  const [parameters] = useSearchParams();
  const resource = useApiResource<LocationsResponse>(buildLocationPath(parameters));

  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Custody reference</p>
        <h1 id="page-title">Locations</h1>
        <p>Review organization sites and shared handoff points used in custody records.</p>
      </header>

      <LocationControls />
      {resource.status === "loading" ? <LoadingState label="Loading locations…" /> : null}
      {resource.status === "error" ? (
        <ErrorState error={resource.error} retry={resource.retry} />
      ) : null}
      {resource.status === "success" ? (
        resource.data.locations.length === 0 ? (
          <section className="surface panel">
            <EmptyState title="No locations found">
              Adjust the current canton or search text and try again.
            </EmptyState>
          </section>
        ) : (
          <div className="surface table-wrap">
            <table className="data-table">
              <caption className="visually-hidden">Locations matching the current filters</caption>
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Code</th>
                  <th scope="col">Municipality</th>
                  <th scope="col">Canton</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.locations.map((location) => (
                  <tr key={location.id}>
                    <th data-label="Location" scope="row">
                      {location.name}
                    </th>
                    <td data-label="Code">{location.code}</td>
                    <td data-label="Municipality">{location.municipality}</td>
                    <td data-label="Canton">{location.canton}</td>
                    <td data-label="Scope">
                      <span
                        className={`scope-marker${location.isGlobal ? " scope-marker-global" : ""}`}
                      >
                        {location.isGlobal ? "Global" : "Organization"}
                      </span>
                    </td>
                    <td data-label="Coordinates">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
