import type { ApiClientError } from "../lib/api-client.js";

function errorMessage(error: ApiClientError): string {
  if (error.status === 403) {
    return "Your account does not have permission to view this information.";
  }

  if (error.status === 404) {
    return "The requested information was not found.";
  }

  return "The information could not be loaded. Check the API connection and try again.";
}

export function LoadingState({ label = "Loading information…" }: { label?: string }) {
  return (
    <div className="surface state-panel" role="status">
      <span className="loading-dot" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: ApiClientError; retry(): void }) {
  return (
    <section className="surface state-panel" aria-labelledby="load-error-title">
      <p className="eyebrow">Request error</p>
      <h2 id="load-error-title">Unable to load this view</h2>
      <p>{errorMessage(error)}</p>
      {error.requestId === null ? null : <p className="request-id">Request: {error.requestId}</p>}
      <button className="button button-secondary" onClick={retry} type="button">
        Try again
      </button>
    </section>
  );
}

export function EmptyState({ children, title }: { children: string; title: string }) {
  return (
    <div className="empty-inline">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
