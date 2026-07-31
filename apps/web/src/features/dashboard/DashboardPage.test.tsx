import { API_PATHS, type AuthSessionResponse, type DashboardSummary } from "@verilot/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "./DashboardPage.js";
import { AuthApi } from "../../auth/auth-api.js";
import { SessionProvider } from "../../auth/SessionProvider.js";
import { ApiClient } from "../../lib/api-client.js";

const session: AuthSessionResponse = {
  csrfToken: "runtime-csrf-token",
  expiresAt: "2026-08-01T12:00:00.000Z",
  user: {
    displayName: "Operations Administrator",
    email: "admin@verilot.local",
    id: "admin-user",
    organization: {
      id: "manufacturer-one",
      name: "VeriLot Manufacturing Romandie",
      type: "MANUFACTURER",
    },
    role: "ADMINISTRATOR",
  },
};

const summary: DashboardSummary = {
  alertCounts: {
    bySeverity: { CRITICAL: 2, HIGH: 3, LOW: 1, MEDIUM: 4 },
    byStatus: { DISMISSED: 5, EVIDENCE_REQUESTED: 1, IN_REVIEW: 2, OPEN: 3, RESOLVED: 7 },
  },
  batchCountsByStatus: { ACTIVE: 4, CLOSED: 2, DRAFT: 1, RECALLED: 1 },
  generatedAt: "2026-07-31T09:00:00.000Z",
  productCountsByStatus: {
    BLOCKED: 2,
    DESTROYED: 1,
    PENDING: 5,
    RECALLED: 3,
    VERIFIED: 120,
    WARNING: 4,
  },
  recallCountsByStatus: { ACTIVE: 2, CANCELLED: 1, COMPLETED: 3 },
  recentAlerts: [
    {
      batch: { code: "VL-BATCH-2026-003", id: "batch-three" },
      createdAt: "2026-07-31T08:00:00.000Z",
      id: "alert-one",
      product: { id: "product-one", serialNumber: "VL-2026-000042" },
      rule: "IMPOSSIBLE_TRAVEL",
      severity: "HIGH",
      status: "OPEN",
      title: "Travel sequence requires review",
    },
  ],
  recentCustodyActivity: [
    {
      eventAt: "2026-07-31T07:00:00.000Z",
      id: "event-one",
      location: { canton: "VD", municipality: "Lausanne", name: "Lausanne Hub" },
      product: { id: "product-one", serialNumber: "VL-2026-000042" },
      recordedAt: "2026-07-31T07:05:00.000Z",
      type: "RECEIVED",
    },
  ],
  recentVerificationTotals: {
    byResult: { BLOCKED: 2, RECALLED: 1, UNKNOWN: 3, VERIFIED: 40, WARNING: 4 },
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-31T00:00:00.000Z",
  },
  verificationTrend: [
    {
      byResult: { BLOCKED: 0, RECALLED: 0, UNKNOWN: 1, VERIFIED: 8, WARNING: 1 },
      periodStart: "2026-07-30T00:00:00.000Z",
      total: 10,
    },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderDashboard(fetchImplementation: typeof fetch) {
  const client = new ApiClient({ fetchImplementation });
  const service = {
    loadSession: vi.fn().mockResolvedValue(session),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as unknown as AuthApi;

  render(
    <MemoryRouter>
      <SessionProvider client={client} service={service}>
        <DashboardPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  it("renders API totals, recent records, links, and trend text", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ data: summary }));
    renderDashboard(fetchImplementation);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("135")).toBeInTheDocument();
    expect(screen.getByText("Travel sequence requires review")).toHaveAttribute(
      "href",
      "/alerts/alert-one",
    );
    expect(screen.getByRole("link", { name: "VL-2026-000042" })).toHaveAttribute(
      "href",
      "/products/product-one",
    );
    expect(screen.getByLabelText("Verification activity by day")).toHaveTextContent("Verified 8");
    expect(fetchImplementation).toHaveBeenCalledWith(
      API_PATHS.dashboardSummary,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("shows a loading state while the request is pending", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockReturnValue(new Promise<Response>(() => undefined));
    renderDashboard(fetchImplementation);

    expect(await screen.findByText("Loading dashboard…")).toBeInTheDocument();
  });

  it("renders explicit empty states", async () => {
    const emptySummary: DashboardSummary = {
      ...summary,
      recentAlerts: [],
      recentCustodyActivity: [],
      verificationTrend: [],
    };
    renderDashboard(vi.fn<typeof fetch>().mockResolvedValue(response({ data: emptySummary })));

    expect(await screen.findByText("No recent alerts")).toBeInTheDocument();
    expect(screen.getByText("No recent custody records")).toBeInTheDocument();
    expect(screen.getByText("No verification trend")).toBeInTheDocument();
  });

  it("retries a failed request", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: "INTERNAL_SERVER_ERROR",
              fieldErrors: {},
              message: "An unexpected error occurred.",
              requestId: "req_dashboard_error",
            },
          },
          500,
        ),
      )
      .mockResolvedValueOnce(response({ data: summary }));
    renderDashboard(fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Travel sequence requires review")).toBeInTheDocument();
  });
});
