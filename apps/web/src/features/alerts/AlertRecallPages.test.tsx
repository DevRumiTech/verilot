import type {
  AlertDetailResponse,
  AlertsResponse,
  AuthSessionResponse,
  RecallDetailResponse,
  RecallsResponse,
} from "@verilot/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { AlertDetailPage, AlertListPage } from "./AlertPages.js";
import { AuthApi } from "../../auth/auth-api.js";
import { SessionProvider } from "../../auth/SessionProvider.js";
import { ApiClient } from "../../lib/api-client.js";
import { RecallDetailPage, RecallListPage } from "../recalls/RecallPages.js";

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

const alerts: AlertsResponse = {
  alerts: [
    {
      assignedTo: { displayName: "Operations Administrator", id: "admin-user" },
      batch: {
        code: "VL-BATCH-2026-003",
        id: "batch-three",
        lotNumber: "LOT-003",
        productName: "Thermal Control Module",
        sku: "TCM-100",
      },
      createdAt: "2026-07-31T08:00:00.000Z",
      id: "alert-one",
      product: { id: "product-one", serialNumber: "VL-2026-000042", status: "WARNING" },
      rule: "IMPOSSIBLE_TRAVEL",
      severity: "HIGH",
      status: "IN_REVIEW",
      summary: "Two custody records imply an impossible travel interval.",
      title: "Travel sequence requires review",
      updatedAt: "2026-07-31T08:05:00.000Z",
    },
  ],
  pagination: { page: 4, pageSize: 20, totalItems: 61, totalPages: 4 },
};

const alertDetail: AlertDetailResponse = {
  alert: {
    ...alerts.alerts[0]!,
    custodyEvent: {
      eventAt: "2026-07-31T07:00:00.000Z",
      id: "event-one",
      recordedAt: "2026-07-31T07:05:00.000Z",
      type: "RECEIVED",
    },
    decisionAt: null,
    details: { distanceKm: 280, intervalMinutes: 35, review: ["origin", "destination"] },
    evidenceRequest: "Confirm the shipment handoff record.",
    resolvedBy: null,
    reviewNotes: "Carrier documentation requested.",
    verificationAttempt: null,
  },
};

const recalls: RecallsResponse = {
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  recalls: [
    {
      announcedAt: "2026-07-29T08:00:00.000Z",
      batch: {
        code: "VL-BATCH-2026-007",
        id: "batch-seven",
        lotNumber: "LOT-007",
        productName: "Precision Sensor Module",
        sku: "PSM-200",
        status: "RECALLED",
      },
      completedAt: null,
      id: "recall-one",
      reason: "Supplier calibration variance requires controlled return.",
      reference: "VL-REC-2026-001",
      status: "ACTIVE",
    },
  ],
};

const recallDetail: RecallDetailResponse = {
  recall: {
    ...recalls.recalls[0]!,
    createdBy: { displayName: "Operations Administrator", id: "admin-user" },
    custodyEventCount: 20,
    productCount: 20,
  },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function renderResource(initialEntry: string, fetchImplementation: typeof fetch) {
  const service = {
    loadSession: vi.fn().mockResolvedValue(session),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as unknown as AuthApi;
  const client = new ApiClient({ fetchImplementation });

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route path="/alerts" element={<AlertListPage />} />
          <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
          <Route path="/recalls" element={<RecallListPage />} />
          <Route path="/recalls/:recallId" element={<RecallDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("alert pages", () => {
  it("renders alert rows and keeps enum filters when search resets the page", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: alerts })));
    renderResource(
      "/alerts?page=4&status=IN_REVIEW&severity=HIGH&rule=IMPOSSIBLE_TRAVEL",
      fetchImplementation,
    );

    expect(
      await screen.findByRole("link", { name: "Travel sequence requires review" }),
    ).toHaveAttribute("href", "/alerts/alert-one");
    expect(
      screen.getByRole("rowheader", { name: "Travel sequence requires review" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search alerts")).toHaveAttribute("name", "search");
    await userEvent.type(screen.getByLabelText("Search alerts"), "travel");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const url = new URL(String(fetchImplementation.mock.calls.at(-1)?.[0]), "http://local");
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("status")).toBe("IN_REVIEW");
      expect(url.searchParams.get("severity")).toBe("HIGH");
      expect(url.searchParams.get("rule")).toBe("IMPOSSIBLE_TRAVEL");
      expect(url.searchParams.get("search")).toBe("travel");
    });
  });

  it("renders bounded alert relationships and safe evidence JSON", async () => {
    renderResource(
      "/alerts/alert-one",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: alertDetail })),
    );

    expect(
      await screen.findByRole("heading", { name: "Travel sequence requires review" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VL-2026-000042" })).toHaveAttribute(
      "href",
      "/products/product-one",
    );
    expect(screen.getByText(/"distanceKm": 280/)).toBeInTheDocument();
    expect(screen.getByText("Confirm the shipment handoff record.")).toBeInTheDocument();
  });

  it("renders an alert empty state", async () => {
    renderResource(
      "/alerts",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: { ...alerts, alerts: [] } })),
    );

    expect(await screen.findByText("No alerts found")).toBeInTheDocument();
  });
});

describe("recall pages", () => {
  it("validates dates before adding ISO date filters", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: recalls })));
    renderResource("/recalls", fetchImplementation);
    expect(await screen.findByRole("link", { name: "VL-REC-2026-001" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "VL-REC-2026-001" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Announced from"), { target: { value: "2026-08-02" } });
    fireEvent.change(screen.getByLabelText("Announced to"), { target: { value: "2026-08-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByText("The start date must not be after the end date.")).toBeInTheDocument();
    const announcedFrom = screen.getByLabelText("Announced from");
    expect(announcedFrom).toHaveAttribute("name", "from");
    expect(announcedFrom).toHaveAttribute("aria-describedby", "recall-date-error");
    expect(document.activeElement).toBe(announcedFrom);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Announced to"), { target: { value: "2026-08-03" } });
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2));
    const url = new URL(String(fetchImplementation.mock.calls.at(-1)?.[0]), "http://local");
    expect(url.searchParams.get("announcedFrom")).toBe("2026-08-02T00:00:00.000Z");
    expect(url.searchParams.get("announcedTo")).toBe("2026-08-03T23:59:59.999Z");
  });

  it("renders recall detail and affected counts", async () => {
    renderResource(
      "/recalls/recall-one",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: recallDetail })),
    );

    expect(await screen.findByRole("heading", { name: "VL-REC-2026-001" })).toBeInTheDocument();
    expect(
      screen.getByText("Supplier calibration variance requires controlled return."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VL-BATCH-2026-007" })).toHaveAttribute(
      "href",
      "/batches/batch-seven",
    );
    expect(screen.getByText("Affected products").nextElementSibling).toHaveTextContent("20");
  });
});
