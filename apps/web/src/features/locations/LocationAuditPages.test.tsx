import {
  PERMISSIONS,
  type AuditRecordDetailResponse,
  type AuditRecordsResponse,
  type AuthSessionResponse,
  type LocationsResponse,
} from "@verilot/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { LocationListPage } from "./LocationPages.js";
import { AuthApi } from "../../auth/auth-api.js";
import { AuthGuard, SessionProvider } from "../../auth/SessionProvider.js";
import { AuditDetailPage, AuditListPage } from "../audit/AuditPages.js";
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

const locations: LocationsResponse = {
  locations: [
    {
      canton: "FR",
      code: "FR-HUB-01",
      countryCode: "CH",
      id: "location-global",
      isGlobal: true,
      latitude: 46.8065,
      longitude: 7.1619,
      municipality: "Fribourg",
      name: "Fribourg Handoff Hub",
    },
    {
      canton: "VD",
      code: "VD-PLANT-01",
      countryCode: "CH",
      id: "location-own",
      isGlobal: false,
      latitude: 46.5197,
      longitude: 6.6323,
      municipality: "Lausanne",
      name: "Romandie Assembly Site",
    },
  ],
};

const audits: AuditRecordsResponse = {
  auditRecords: [
    {
      action: "BATCH_ACTIVATED",
      actor: { displayName: "Operations Administrator", id: "admin-user" },
      actorEmail: "admin@verilot.local",
      actorRole: "ADMINISTRATOR",
      createdAt: "2026-07-31T08:00:00.000Z",
      entityId: "batch-three",
      entityType: "Batch",
      id: "audit-one",
      reason: "Released for serialization.",
      requestId: "req_batch_activation",
    },
  ],
  pagination: { page: 3, pageSize: 20, totalItems: 41, totalPages: 3 },
};

const auditDetail: AuditRecordDetailResponse = {
  auditRecord: {
    ...audits.auditRecords[0]!,
    afterData: {
      nested: {
        password: "should-not-render",
        quantity: 20,
      },
      status: "ACTIVE",
    },
    beforeData: null,
  },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function renderResource(
  initialEntry: string,
  fetchImplementation: typeof fetch,
  currentSession: AuthSessionResponse = session,
) {
  const service = {
    loadSession: vi.fn().mockResolvedValue(currentSession),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as unknown as AuthApi;
  const client = new ApiClient({ fetchImplementation });

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route path="/locations" element={<LocationListPage />} />
          <Route
            path="/audit"
            element={
              <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
                <AuditListPage />
              </AuthGuard>
            }
          />
          <Route
            path="/audit/:auditRecordId"
            element={
              <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
                <AuditDetailPage />
              </AuthGuard>
            }
          />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("location page", () => {
  it("renders global scope and sends supported search filters", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: locations }));
    renderResource("/locations?search=handoff&canton=FR", fetchImplementation);

    expect(await screen.findByText("Fribourg Handoff Hub")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Fribourg Handoff Hub" })).toBeInTheDocument();
    expect(screen.getByText("Global")).toHaveClass("scope-marker-global");
    expect(screen.getByText("46.8065, 7.1619")).toBeInTheDocument();

    const url = new URL(String(fetchImplementation.mock.calls.at(-1)?.[0]), "http://local");
    expect(url.searchParams.get("search")).toBe("handoff");
    expect(url.searchParams.get("canton")).toBe("FR");
  });

  it("renders a location empty state", async () => {
    renderResource(
      "/locations",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: { locations: [] } satisfies LocationsResponse })),
    );

    expect(await screen.findByText("No locations found")).toBeInTheDocument();
  });
});

describe("audit pages", () => {
  it("renders summaries and applies supported URL filters", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: audits }));
    renderResource("/audit?page=3", fetchImplementation);

    expect(await screen.findByRole("link", { name: "Batch Activated" })).toHaveAttribute(
      "href",
      "/audit/audit-one",
    );
    expect(screen.getByRole("rowheader", { name: "Batch Activated" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Action"), "BATCH_CREATED");
    await userEvent.type(screen.getByLabelText("Entity type"), "Batch");
    fireEvent.change(screen.getByLabelText("Created from"), {
      target: { value: "2026-08-02" },
    });
    fireEvent.change(screen.getByLabelText("Created to"), {
      target: { value: "2026-08-01" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByText("The start date must not be after the end date.")).toBeInTheDocument();
    const createdFrom = screen.getByLabelText("Created from");
    expect(createdFrom).toHaveAttribute("name", "createdFrom");
    expect(createdFrom).toHaveAttribute("aria-describedby", "audit-date-error");
    expect(document.activeElement).toBe(createdFrom);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Created to"), {
      target: { value: "2026-08-03" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(2));
    const url = new URL(String(fetchImplementation.mock.calls.at(-1)?.[0]), "http://local");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("action")).toBe("BATCH_CREATED");
    expect(url.searchParams.get("entityType")).toBe("Batch");
    expect(url.searchParams.get("createdFrom")).toBe("2026-08-02T00:00:00.000Z");
    expect(url.searchParams.get("createdTo")).toBe("2026-08-03T23:59:59.999Z");
  });

  it("renders wrapped audit JSON with sensitive keys redacted", async () => {
    renderResource(
      "/audit/audit-one",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: auditDetail })),
    );

    expect(await screen.findByRole("heading", { name: "Batch Activated" })).toBeInTheDocument();
    expect(screen.getByText(/"password": "\[REDACTED\]"/)).toHaveClass("json-block");
    expect(screen.queryByText(/should-not-render/)).not.toBeInTheDocument();
    expect(screen.getByText("No before data")).toBeInTheDocument();
  });

  it("denies audit access to an operator before requesting data", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    renderResource("/audit", fetchImplementation, {
      ...session,
      user: { ...session.user, role: "OPERATOR" },
    });

    expect(await screen.findByRole("heading", { name: "Permission required" })).toBeInTheDocument();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
