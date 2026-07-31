import { PERMISSIONS, type AuthSessionResponse } from "@verilot/contracts";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ApiClient, ApiClientError } from "../lib/api-client.js";
import { AuthApi } from "./auth-api.js";
import { AuthGuard, SessionProvider, useSession } from "./SessionProvider.js";

const administratorSession: AuthSessionResponse = {
  csrfToken: "csrf-runtime-only",
  expiresAt: "2026-08-01T12:00:00.000Z",
  user: {
    displayName: "Operations Administrator",
    email: "admin@verilot.local",
    id: "user-admin",
    organization: {
      id: "organization-one",
      name: "VeriLot Manufacturing Romandie",
      type: "MANUFACTURER",
    },
    role: "ADMINISTRATOR",
  },
};

function SessionProbe() {
  const { session, signIn, signOut, status } = useSession();

  return (
    <div>
      <output>{status}</output>
      <span>{session?.user.email}</span>
      <button
        type="button"
        onClick={() => void signIn({ email: "admin@test.local", password: "secret" })}
      >
        Sign in
      </button>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderProvider(options: {
  client: ApiClient;
  service: AuthApi;
  children?: React.ReactNode;
}) {
  return render(
    <MemoryRouter initialEntries={["/secure?tab=one"]}>
      <SessionProvider client={options.client} service={options.service}>
        {options.children ?? <SessionProbe />}
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("SessionProvider", () => {
  it("loads a session and supports sign-out", async () => {
    const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });
    const service = {
      loadSession: vi.fn().mockResolvedValue(administratorSession),
      signIn: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthApi;
    renderProvider({ client, service });

    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(screen.getByText("admin@verilot.local")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    expect(service.signOut).toHaveBeenCalledTimes(1);
  });

  it("signs in from an anonymous state", async () => {
    const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });
    const service = {
      loadSession: vi.fn().mockRejectedValue(
        new ApiClientError({
          code: "AUTHENTICATION_REQUIRED",
          message: "Required.",
          status: 401,
        }),
      ),
      signIn: vi.fn().mockResolvedValue(administratorSession),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderProvider({ client, service });

    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("authenticated")).toBeInTheDocument();
    expect(service.signIn).toHaveBeenCalledWith({ email: "admin@test.local", password: "secret" });
  });

  it("marks an authenticated session expired after a later 401", async () => {
    let respond: ((response: Response) => void) | undefined;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const client = new ApiClient({ fetchImplementation });
    const service = {
      loadSession: vi.fn().mockResolvedValue(administratorSession),
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderProvider({ client, service });

    expect(await screen.findByText("authenticated")).toBeInTheDocument();

    const request = client.request("/api/v1/products");
    await act(async () => {
      respond?.(
        new Response(
          JSON.stringify({
            error: {
              code: "AUTHENTICATION_REQUIRED",
              fieldErrors: {},
              message: "Authentication is required.",
              requestId: "req_expired",
            },
          }),
          { headers: { "content-type": "application/json" }, status: 401 },
        ),
      );
      await request.catch(() => undefined);
    });

    expect(await screen.findByText("expired")).toBeInTheDocument();
  });
});

describe("AuthGuard", () => {
  it("preserves the requested local path for anonymous users", async () => {
    const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });
    const service = {
      loadSession: vi.fn().mockRejectedValue(
        new ApiClientError({
          code: "AUTHENTICATION_REQUIRED",
          message: "Required.",
          status: 401,
        }),
      ),
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as AuthApi;

    render(
      <MemoryRouter initialEntries={["/secure?tab=one"]}>
        <SessionProvider client={client} service={service}>
          <Routes>
            <Route
              path="/secure"
              element={
                <AuthGuard>
                  <p>Secure content</p>
                </AuthGuard>
              }
            />
            <Route path="/sign-in" element={<p>Sign-in route</p>} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sign-in route")).toBeInTheDocument();
  });

  it("renders permission denial separately", async () => {
    const inspectorSession: AuthSessionResponse = {
      ...administratorSession,
      user: { ...administratorSession.user, role: "INSPECTOR" },
    };
    const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });
    const service = {
      loadSession: vi.fn().mockResolvedValue(inspectorSession),
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderProvider({
      children: (
        <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
          <p>Audit records</p>
        </AuthGuard>
      ),
      client,
      service,
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Permission required" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Audit records")).not.toBeInTheDocument();
  });
});
