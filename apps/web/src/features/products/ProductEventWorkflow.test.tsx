import type {
  AuthSessionResponse,
  LocationsResponse,
  ProductCustodyEvent,
  ProductDetailResponse,
  ProductEventMutationResponse,
} from "@verilot/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthApi } from "../../auth/auth-api.js";
import { SessionProvider } from "../../auth/SessionProvider.js";
import { ApiClient } from "../../lib/api-client.js";
import { ProductDetailPage } from "./ProductPages.js";

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

const originalEvent: ProductCustodyEvent = {
  actor: { displayName: "Supply Chain Operator" },
  eventAt: "2026-07-30T08:00:00.000Z",
  id: "00000000-0000-4000-8000-000005000001",
  location: {
    canton: "VD",
    countryCode: "CH",
    municipality: "Lausanne",
    name: "Lausanne Hub",
  },
  notes: "Inbound inspection complete.",
  organization: { name: "VeriLot Manufacturing Romandie", type: "MANUFACTURER" },
  recordedAt: "2026-07-30T08:05:00.000Z",
  shipmentReference: "SHIP-41",
  transportMode: "ROAD",
  type: "RECEIVED",
};

const productDetail: ProductDetailResponse = {
  product: {
    activatedAt: "2026-07-01T08:00:00.000Z",
    batch: {
      code: "VL-BATCH-2026-003",
      id: "batch-three",
      lotNumber: "LOT-003",
      productName: "Thermal Control Module",
      sku: "TCM-100",
      status: "ACTIVE",
    },
    blockedAt: null,
    blockReason: null,
    custodyEvents: [originalEvent],
    eventCount: 1,
    id: "product-one",
    serialNumber: "VL-2026-000042",
    status: "VERIFIED",
    updatedAt: "2026-07-31T08:00:00.000Z",
  },
};

const locations: LocationsResponse = {
  locations: [
    {
      canton: "VD",
      code: "MFG-LAUSANNE",
      countryCode: "CH",
      id: "00000000-0000-4000-8000-000003000001",
      isGlobal: false,
      latitude: 46.5197,
      longitude: 6.6323,
      municipality: "Lausanne",
      name: "Lausanne Hub",
    },
    {
      canton: "ZH",
      code: "GLOBAL-ZRH",
      countryCode: "CH",
      id: "00000000-0000-4000-8000-000003000002",
      isGlobal: true,
      latitude: 47.3769,
      longitude: 8.5417,
      municipality: "Zürich",
      name: "Zürich Shared Depot",
    },
  ],
};

function recordedEvent(overrides: Partial<ProductCustodyEvent> = {}): ProductCustodyEvent {
  return {
    actor: { displayName: "Operations Administrator" },
    eventAt: "2026-07-31T09:30:00.000Z",
    id: "00000000-0000-4000-8000-000005000099",
    location: null,
    notes: null,
    organization: { name: "VeriLot Manufacturing Romandie", type: "MANUFACTURER" },
    recordedAt: "2026-07-31T09:31:00.000Z",
    shipmentReference: null,
    transportMode: null,
    type: "INSPECTED",
    ...overrides,
  };
}

function mutationResponse(
  overrides: Partial<ProductEventMutationResponse> = {},
): ProductEventMutationResponse {
  return {
    event: recordedEvent(),
    productStatus: "VERIFIED",
    replayed: false,
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  fieldErrors: Record<string, string[]> = {},
): Response {
  return jsonResponse(
    {
      error: {
        code,
        fieldErrors,
        message,
        requestId: `req_${code.toLowerCase()}`,
      },
    },
    status,
  );
}

function renderPage(fetchImplementation: typeof fetch, currentSession = session): void {
  const service = {
    loadSession: vi.fn().mockResolvedValue(currentSession),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as unknown as AuthApi;
  const client = new ApiClient({ fetchImplementation });

  render(
    <MemoryRouter initialEntries={["/products/product-one"]}>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route path="/products/:productId" element={<ProductDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

function createFetch(
  mutation: () => Promise<Response> = () =>
    Promise.resolve(jsonResponse({ data: mutationResponse() }, 201)),
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation((input, options) => {
    const path = String(input);

    if (path === "/api/v1/locations") {
      return Promise.resolve(jsonResponse({ data: locations }));
    }

    if (options?.method === "POST" && path.endsWith("/events")) {
      return mutation();
    }

    return Promise.resolve(jsonResponse({ data: productDetail }));
  });
}

async function openDialog(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "Record event" }));
  return screen.getByRole("dialog", { name: "Record custody event" });
}

async function fillRequired(dialog: HTMLElement, type = "INSPECTED"): Promise<void> {
  await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), type);
  fireEvent.change(within(dialog).getByLabelText("Event timestamp"), {
    target: { value: "2026-07-31T09:30" },
  });
}

function mutationCalls(fetchImplementation: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchImplementation.mock.calls.filter(
    ([input, options]) => options?.method === "POST" && String(input).endsWith("/events"),
  );
}

describe("product event workflow", () => {
  it("shows the permitted control and loads organization and global locations", async () => {
    const fetchImplementation = createFetch();
    renderPage(fetchImplementation, {
      ...session,
      user: { ...session.user, role: "OPERATOR" },
    });

    const dialog = await openDialog();
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "Add a timestamped event to this append-only custody history.",
    );
    expect(
      await within(dialog).findByRole("option", {
        name: "Lausanne Hub · Lausanne VD · Organization",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", {
        name: "Zürich Shared Depot · Zürich ZH · Global",
      }),
    ).toBeInTheDocument();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v1/locations",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("does not show the control to an inspector", async () => {
    renderPage(createFetch(), {
      ...session,
      user: { ...session.user, role: "INSPECTOR" },
    });

    expect(await screen.findByRole("heading", { name: "VL-2026-000042" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record event" })).not.toBeInTheDocument();
  });

  it("validates required, blocked, and correction fields and moves to the first error", async () => {
    const fetchImplementation = createFetch();
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    const submit = within(dialog).getByRole("button", { name: "Record event" });

    await userEvent.click(submit);
    expect(within(dialog).getByText("Select an event type.")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the event timestamp.")).toBeInTheDocument();
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Event type"));

    await fillRequired(dialog, "BLOCKED");
    await userEvent.click(submit);
    expect(
      within(dialog).getByText("Enter notes explaining why the product is blocked."),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Notes"));

    await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), "CORRECTION");
    await userEvent.click(submit);
    expect(within(dialog).getByText("Select the event this record corrects.")).toBeInTheDocument();
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Event being corrected"));
    expect(mutationCalls(fetchImplementation)).toHaveLength(0);
  });

  it("submits through the typed client, omits a hidden correction, and updates the timeline", async () => {
    const response = mutationResponse({
      event: recordedEvent({
        notes: "Packaging damage found during handoff.",
        type: "BLOCKED",
      }),
      productStatus: "BLOCKED",
      replayed: true,
    });
    const fetchImplementation = createFetch(() =>
      Promise.resolve(jsonResponse({ data: response }, 200)),
    );
    renderPage(fetchImplementation);
    const opener = await screen.findByRole("button", { name: "Record event" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Record custody event" });

    await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), "CORRECTION");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Event being corrected"),
      originalEvent.id,
    );
    expect(within(dialog).getByText(originalEvent.id)).toHaveClass("identifier-value");
    await userEvent.selectOptions(within(dialog).getByLabelText("Event type"), "BLOCKED");
    expect(within(dialog).queryByLabelText("Event being corrected")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Event timestamp"), {
      target: { value: "2026-07-31T09:30" },
    });
    await userEvent.type(
      within(dialog).getByLabelText("Notes"),
      "Packaging damage found during handoff.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Record event" }));

    expect(
      await screen.findByText(
        "Blocked event recorded for VL-2026-000042. The saved response was safely replayed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Blocked" })).toBeInTheDocument();
    expect(screen.getByText("Packaging damage found during handoff.")).toBeInTheDocument();
    expect(document.querySelector(".status-badge")).toHaveTextContent("Blocked");
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);

    const calls = mutationCalls(fetchImplementation);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("correctedEventId");
    expect(body).toMatchObject({
      notes: "Packaging damage found during handoff.",
      type: "BLOCKED",
    });
    expect(String(body.idempotencyKey)).toMatch(/^product-event:product-one:/);
    expect(new Headers(calls[0]?.[1]?.headers).get("x-csrf-token")).toBe("runtime-csrf-token");
  });

  it("prevents duplicate submissions while a request is pending", async () => {
    let resolveMutation: (response: Response) => void = () => undefined;
    const pendingMutation = new Promise<Response>((resolve) => {
      resolveMutation = resolve;
    });
    const fetchImplementation = createFetch(() => pendingMutation);
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    await fillRequired(dialog);
    const submit = within(dialog).getByRole("button", { name: "Record event" });

    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mutationCalls(fetchImplementation)).toHaveLength(1);

    resolveMutation(jsonResponse({ data: mutationResponse() }, 201));
    expect(
      await screen.findByText("Inspected event recorded for VL-2026-000042."),
    ).toBeInTheDocument();
  });

  it("preserves values and the idempotency key when retrying an unchanged conflict", async () => {
    let attempt = 0;
    const fetchImplementation = createFetch(() => {
      attempt += 1;
      return Promise.resolve(
        attempt === 1
          ? errorResponse(409, "INVALID_PRODUCT_TRANSITION", "The transition is invalid.")
          : jsonResponse({ data: mutationResponse() }, 201),
      );
    });
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    await fillRequired(dialog);
    await userEvent.type(
      within(dialog).getByLabelText("Shipment reference (optional)"),
      "SHIP-RETRY",
    );
    const submit = within(dialog).getByRole("button", { name: "Record event" });

    await userEvent.click(submit);
    expect(
      await within(dialog).findByText(
        "The transition is invalid. Your entries have been preserved.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Shipment reference (optional)")).toHaveValue(
      "SHIP-RETRY",
    );
    await userEvent.click(submit);
    expect(
      await screen.findByText("Inspected event recorded for VL-2026-000042."),
    ).toBeInTheDocument();

    const bodies = mutationCalls(fetchImplementation).map(
      (call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.idempotencyKey).toBe(bodies[1]?.idempotencyKey);
  });

  it("generates a new idempotency key when a failed request is changed", async () => {
    const fetchImplementation = createFetch(() =>
      Promise.resolve(errorResponse(409, "INVALID_PRODUCT_TRANSITION", "Try another event.")),
    );
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    await fillRequired(dialog);
    const shipment = within(dialog).getByLabelText("Shipment reference (optional)");
    const submit = within(dialog).getByRole("button", { name: "Record event" });

    await userEvent.type(shipment, "SHIP-ONE");
    await userEvent.click(submit);
    await within(dialog).findByText("Try another event. Your entries have been preserved.");
    await userEvent.clear(shipment);
    await userEvent.type(shipment, "SHIP-TWO");
    await userEvent.click(submit);
    await waitFor(() => expect(mutationCalls(fetchImplementation)).toHaveLength(2));

    const bodies = mutationCalls(fetchImplementation).map(
      (call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
    );
    expect(bodies[0]?.idempotencyKey).not.toBe(bodies[1]?.idempotencyKey);
  });

  it("connects backend field errors to their inputs", async () => {
    const fetchImplementation = createFetch(() =>
      Promise.resolve(
        errorResponse(400, "VALIDATION_ERROR", "The event request is invalid.", {
          shipmentReference: ["The shipment reference is invalid."],
        }),
      ),
    );
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    await fillRequired(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Record event" }));
    const shipment = within(dialog).getByLabelText("Shipment reference (optional)");
    const error = await within(dialog).findByText("The shipment reference is invalid.");
    expect(shipment).toHaveAttribute("aria-describedby", error.id);
    expect(document.activeElement).toBe(shipment);
  });

  it.each([
    [403, "PERMISSION_DENIED", "Your account no longer has permission to record product events."],
    [
      404,
      "LOCATION_NOT_FOUND",
      "This product, location, or referenced event is no longer available. Your entries have been preserved.",
    ],
  ])("keeps a %s response distinct", async (status, code, expectedMessage) => {
    const fetchImplementation = createFetch(() =>
      Promise.resolve(errorResponse(status, code, "Server detail.")),
    );
    renderPage(fetchImplementation);
    const dialog = await openDialog();
    await fillRequired(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Record event" }));
    expect(await within(dialog).findByText(expectedMessage)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Event timestamp")).toHaveValue("2026-07-31T09:30");
  });

  it("ignores backdrop interaction, closes with Escape, and returns keyboard position", async () => {
    renderPage(createFetch());
    const opener = await screen.findByRole("button", { name: "Record event" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Record custody event" });
    const backdrop = dialog.parentElement;
    const shipment = within(dialog).getByLabelText("Shipment reference (optional)");

    await userEvent.type(shipment, "SHIP-PRESERVED");

    expect(backdrop).not.toBeNull();
    if (backdrop !== null) {
      fireEvent.click(backdrop);
    }
    expect(screen.getByRole("dialog", { name: "Record custody event" })).toBeInTheDocument();
    expect(shipment).toHaveValue("SHIP-PRESERVED");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Record custody event" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });
});
