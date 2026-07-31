import type {
  AuthSessionResponse,
  BatchDetailResponse,
  BatchesResponse,
  BatchSummary,
  BatchWorkflowMutationResponse,
} from "@verilot/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { BatchDetailPage, BatchListPage } from "./BatchPages.js";
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

const draftBatch: BatchSummary = {
  activatedAt: null,
  code: "VL-BATCH-2026-009",
  expiresAt: "2028-07-30",
  id: "batch-nine",
  lotNumber: "LOT-009",
  manufacturedAt: "2026-07-30",
  productCount: 0,
  productName: "Control Interface Module",
  recallCount: 0,
  serialEnd: 200,
  serialPrefix: "VL-2026-",
  serialStart: 181,
  sku: "CIM-400",
  status: "DRAFT",
};

const batches: BatchesResponse = {
  batches: [draftBatch],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};

function mutationResponse(status: "ACTIVE" | "CLOSED" | "DRAFT"): BatchWorkflowMutationResponse {
  return {
    batch: {
      activatedAt: status === "DRAFT" ? null : "2026-07-31T12:00:00.000Z",
      code: draftBatch.code,
      expiresAt: draftBatch.expiresAt,
      id: draftBatch.id,
      lotNumber: draftBatch.lotNumber,
      manufacturedAt: draftBatch.manufacturedAt,
      productCount: status === "DRAFT" ? 0 : 20,
      productName: draftBatch.productName,
      serialEnd: draftBatch.serialEnd,
      serialPrefix: draftBatch.serialPrefix,
      serialStart: draftBatch.serialStart,
      sku: draftBatch.sku,
      status,
    },
    replayed: false,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderPage(
  initialEntry: string,
  fetchImplementation: typeof fetch,
  currentSession = session,
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
          <Route path="/batches" element={<BatchListPage />} />
          <Route path="/batches/:batchId" element={<BatchDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("batch workflow", () => {
  it("validates quantity and creates a draft without browser-generated products", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      if (String(input) === "/api/v1/batches" && options?.method === "POST") {
        return Promise.resolve(jsonResponse({ data: mutationResponse("DRAFT") }, 201));
      }

      return Promise.resolve(jsonResponse({ data: batches }));
    });
    renderPage("/batches", fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Create batch" }));
    const dialog = screen.getByRole("dialog", { name: "Create batch" });
    await userEvent.type(within(dialog).getByLabelText("Batch code"), draftBatch.code);
    await userEvent.type(within(dialog).getByLabelText("Lot number"), draftBatch.lotNumber);
    await userEvent.type(within(dialog).getByLabelText("Product name"), draftBatch.productName);
    await userEvent.type(within(dialog).getByLabelText("SKU"), draftBatch.sku);
    fireEvent.change(within(dialog).getByLabelText("Manufactured on"), {
      target: { value: draftBatch.manufacturedAt },
    });
    fireEvent.change(within(dialog).getByLabelText("Expires on (optional)"), {
      target: { value: draftBatch.expiresAt },
    });
    await userEvent.type(within(dialog).getByLabelText("Serial prefix"), draftBatch.serialPrefix);
    await userEvent.type(within(dialog).getByLabelText("Serial start"), "1");
    await userEvent.type(within(dialog).getByLabelText("Serial end"), "1001");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create draft batch" }));

    expect(
      within(dialog).getByText("A batch cannot contain more than 1000 products."),
    ).toBeInTheDocument();
    expect(
      fetchImplementation.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(0);

    await userEvent.clear(within(dialog).getByLabelText("Serial end"));
    await userEvent.type(within(dialog).getByLabelText("Serial end"), "20");
    expect(within(dialog).getByText("20 products")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create draft batch" }));

    expect(
      await screen.findByText(
        "Draft batch VL-BATCH-2026-009 was created; its 20-product serial range was saved.",
      ),
    ).toBeInTheDocument();
    const mutationCall = fetchImplementation.mock.calls.find(
      ([input, options]) => String(input) === "/api/v1/batches" && options?.method === "POST",
    );
    const body = JSON.parse(String(mutationCall?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      serialEnd: 20,
      serialPrefix: "VL-2026-",
      serialStart: 1,
    });
    expect(body).not.toHaveProperty("products");
    expect(String(body.idempotencyKey)).toMatch(/^batch-create:/);
    expect(new Headers(mutationCall?.[1]?.headers).get("x-csrf-token")).toBe("runtime-csrf-token");
  });

  it("activates a draft through the API without sending product records", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      if (options?.method === "POST" && String(input).endsWith("/activate")) {
        return Promise.resolve(jsonResponse({ data: mutationResponse("ACTIVE") }));
      }

      return Promise.resolve(
        jsonResponse({ data: { batch: draftBatch } satisfies BatchDetailResponse }),
      );
    });
    renderPage("/batches/batch-nine", fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Activate batch" }));
    const dialog = screen.getByRole("dialog", { name: "Activate batch" });
    expect(dialog).toHaveTextContent(
      "The API will create and validate 20 serialized product records from the saved range.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Activate batch" }));

    expect(
      await screen.findByText(
        "Batch VL-BATCH-2026-009 was activated; the API confirmed 20 serialized products.",
      ),
    ).toBeInTheDocument();
    const mutationCall = fetchImplementation.mock.calls.find(
      ([input, options]) => String(input).endsWith("/activate") && options?.method === "POST",
    );
    const body = JSON.parse(String(mutationCall?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("products");
    expect(String(body.idempotencyKey)).toMatch(/^batch-activate:/);
  });

  it("closes an active batch through a confirmation dialog", async () => {
    const activeBatch: BatchSummary = {
      ...draftBatch,
      activatedAt: "2026-07-31T12:00:00.000Z",
      productCount: 20,
      status: "ACTIVE",
    };
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      if (options?.method === "POST" && String(input).endsWith("/close")) {
        return Promise.resolve(jsonResponse({ data: mutationResponse("CLOSED") }));
      }

      return Promise.resolve(
        jsonResponse({ data: { batch: activeBatch } satisfies BatchDetailResponse }),
      );
    });
    renderPage("/batches/batch-nine", fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Close batch" }));
    const dialog = screen.getByRole("dialog", { name: "Close batch" });
    expect(dialog).toHaveTextContent("Closed batches remain available in traceability history.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close batch" }));

    expect(await screen.findByText("Batch VL-BATCH-2026-009 was closed.")).toBeInTheDocument();
  });

  it("hides batch management controls from an inspector", async () => {
    renderPage(
      "/batches",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: batches })),
      { ...session, user: { ...session.user, role: "INSPECTOR" } },
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Batches" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Create batch" })).not.toBeInTheDocument();
  });
});
