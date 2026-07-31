import { API_PATHS } from "@verilot/contracts";

import { ApiClient, ApiClientError } from "./api-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("ApiClient", () => {
  it("binds the native browser request function to the global receiver", async () => {
    const browserFetch = vi.fn(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(jsonResponse({ data: { value: 42 } }));
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", browserFetch);

    try {
      const client = new ApiClient();
      await expect(client.request<{ value: number }>("/resource")).resolves.toEqual({ value: 42 });
      expect(browserFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads successful data envelopes and includes credentials", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: { value: 42 },
      }),
    );
    const client = new ApiClient({ baseUrl: "https://api.example/", fetchImplementation });

    await expect(client.request<{ value: number }>("/resource")).resolves.toEqual({ value: 42 });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.example/resource",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("preserves validation fields in typed errors", async () => {
    const client = new ApiClient({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              fieldErrors: { email: ["Enter a valid email address."] },
              message: "The request is invalid.",
              requestId: "req_validation",
            },
          },
          400,
        ),
      ),
    });

    const request = client.request(API_PATHS.auth.login, {
      body: { email: "invalid", password: "" },
      method: "POST",
    });

    await expect(request).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { email: ["Enter a valid email address."] },
      requestId: "req_validation",
      status: 400,
    });
  });

  it.each([403, 404])("keeps HTTP %s distinct", async (status) => {
    const client = new ApiClient({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: status === 403 ? "INSUFFICIENT_PERMISSIONS" : "NOT_FOUND",
              fieldErrors: {},
              message: "Unavailable.",
              requestId: `req_${status}`,
            },
          },
          status,
        ),
      ),
    });

    await expect(client.request("/resource")).rejects.toMatchObject({ status });
  });

  it("rejects non-JSON responses without exposing their contents", async () => {
    const client = new ApiClient({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("private upstream output", {
          headers: { "content-type": "text/plain" },
          status: 502,
        }),
      ),
    });

    const request = client.request("/resource");
    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.not.toThrow("private upstream output");
  });

  it("passes abort behavior through unchanged", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const client = new ApiClient({ fetchImplementation });
    const controller = new AbortController();
    const request = client.request("/resource", { signal: controller.signal });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("adds the runtime CSRF token to mutations without retrying", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { saved: true } }));
    const client = new ApiClient({ fetchImplementation });
    client.setCsrfToken("runtime-token");

    await client.request("/resource", { body: { value: 1 }, method: "POST" });

    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("x-csrf-token")).toBe("runtime-token");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
