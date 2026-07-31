import { CSRF_HEADER_NAME } from "@verilot/contracts";

interface ApiErrorPayload {
  code: string;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
  message: string;
  requestId: string;
}

interface ErrorEnvelope {
  error: ApiErrorPayload;
}

interface DataEnvelope<T> {
  data: T;
}

export interface ApiRequestOptions {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  notifyUnauthorized?: boolean;
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
  readonly requestId: string | null;
  readonly status: number;

  constructor(options: {
    code: string;
    fieldErrors?: Readonly<Record<string, readonly string[]>>;
    message: string;
    requestId?: string | null;
    status: number;
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.fieldErrors = options.fieldErrors ?? {};
    this.requestId = options.requestId ?? null;
    this.status = options.status;
  }
}

type FetchImplementation = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldErrors(value: unknown): value is Readonly<Record<string, readonly string[]>> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (messages) =>
      Array.isArray(messages) && messages.every((message) => typeof message === "string"),
  );
}

function readErrorEnvelope(value: unknown): ApiErrorPayload | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }

  const { code, fieldErrors, message, requestId } = value.error;

  if (
    typeof code !== "string" ||
    !isFieldErrors(fieldErrors) ||
    typeof message !== "string" ||
    typeof requestId !== "string"
  ) {
    return null;
  }

  return { code, fieldErrors, message, requestId };
}

function readDataEnvelope<T>(value: unknown): T {
  if (!isRecord(value) || !("data" in value)) {
    throw new ApiClientError({
      code: "INVALID_RESPONSE",
      message: "The server returned an invalid response.",
      status: 502,
    });
  }

  return (value as unknown as DataEnvelope<T>).data;
}

function resolveBaseUrl(value: string | undefined): string {
  return (value ?? "").replace(/\/$/, "");
}

export class ApiClient {
  readonly baseUrl: string;
  readonly fetchImplementation: FetchImplementation;
  private csrfToken: string | null = null;
  private unauthorizedHandler: (() => void) | null = null;

  constructor(options: { baseUrl?: string; fetchImplementation?: FetchImplementation } = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  clearCsrfToken(): void {
    this.csrfToken = null;
  }

  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.unauthorizedHandler = handler;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    if (method !== "GET" && this.csrfToken !== null) {
      headers.set(CSRF_HEADER_NAME, this.csrfToken);
    }

    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      credentials: "include",
      headers,
      method,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (response.status === 204) {
      if (!response.ok) {
        throw new ApiClientError({
          code: `HTTP_${response.status}`,
          message: "The request could not be completed.",
          status: response.status,
        });
      }

      return undefined as T;
    }

    const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;

    if (!isJson) {
      await response.text();
      throw new ApiClientError({
        code: response.ok ? "INVALID_RESPONSE" : `HTTP_${response.status}`,
        message: response.ok
          ? "The server returned an invalid response."
          : "The request could not be completed.",
        status: response.ok ? 502 : response.status,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new ApiClientError({
        code: "INVALID_RESPONSE",
        message: "The server returned an invalid response.",
        status: 502,
      });
    }

    if (!response.ok) {
      const error = readErrorEnvelope(payload);
      const clientError = new ApiClientError({
        code: error?.code ?? `HTTP_${response.status}`,
        message: error?.message ?? "The request could not be completed.",
        status: response.status,
        ...(error === null
          ? {}
          : {
              fieldErrors: error.fieldErrors,
              requestId: error.requestId,
            }),
      });

      if (response.status === 401 && options.notifyUnauthorized !== false) {
        this.unauthorizedHandler?.();
      }

      throw clientError;
    }

    return readDataEnvelope<T>(payload);
  }
}

export const apiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL === undefined
    ? {}
    : { baseUrl: import.meta.env.VITE_API_BASE_URL },
);

export type { DataEnvelope, ErrorEnvelope };
