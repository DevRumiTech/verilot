import type {
  AuthSessionResponse,
  BatchDetailResponse,
  BatchesResponse,
  ProductDetailResponse,
  ProductsResponse,
} from "@verilot/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { BatchDetailPage, BatchListPage } from "../batches/BatchPages.js";
import { ProductDetailPage, ProductListPage } from "./ProductPages.js";
import { AuthApi } from "../../auth/auth-api.js";
import { SessionProvider } from "../../auth/SessionProvider.js";
import { ApiClient } from "../../lib/api-client.js";

const session: AuthSessionResponse = {
  csrfToken: "runtime-csrf-token",
  expiresAt: "2026-08-01T12:00:00.000Z",
  user: {
    displayName: "Supply Chain Operator",
    email: "operator@verilot.local",
    id: "operator-user",
    organization: {
      id: "manufacturer-one",
      name: "VeriLot Manufacturing Romandie",
      type: "MANUFACTURER",
    },
    role: "OPERATOR",
  },
};

const products: ProductsResponse = {
  pagination: { page: 3, pageSize: 20, totalItems: 41, totalPages: 3 },
  products: [
    {
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
      eventCount: 4,
      id: "product-one",
      serialNumber: "VL-2026-000042",
      status: "VERIFIED",
      updatedAt: "2026-07-31T08:00:00.000Z",
    },
  ],
};

const productDetail: ProductDetailResponse = {
  product: {
    ...products.products[0]!,
    custodyEvents: [
      {
        actor: { displayName: "Supply Chain Operator" },
        eventAt: "2026-07-01T08:00:00.000Z",
        id: "event-one",
        location: {
          canton: "VD",
          countryCode: "CH",
          municipality: "Lausanne",
          name: "Lausanne Hub",
        },
        notes: "Inbound inspection complete.",
        organization: { name: "VeriLot Manufacturing Romandie", type: "MANUFACTURER" },
        recordedAt: "2026-07-01T08:05:00.000Z",
        shipmentReference: "SHIP-42",
        transportMode: "ROAD",
        type: "RECEIVED",
      },
    ],
  },
};

const batches: BatchesResponse = {
  batches: [
    {
      activatedAt: "2026-07-01T08:00:00.000Z",
      code: "VL-BATCH-2026-003",
      expiresAt: "2029-07-01",
      id: "batch-three",
      lotNumber: "LOT-003",
      manufacturedAt: "2026-07-01",
      productCount: 20,
      productName: "Thermal Control Module",
      recallCount: 0,
      serialEnd: 60,
      serialPrefix: "VL-2026-",
      serialStart: 41,
      sku: "TCM-100",
      status: "ACTIVE",
    },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 },
};

const batchDetail: BatchDetailResponse = { batch: batches.batches[0]! };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status,
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
          <Route path="/products" element={<ProductListPage />} />
          <Route path="/products/:productId" element={<ProductDetailPage />} />
          <Route path="/batches" element={<BatchListPage />} />
          <Route path="/batches/:batchId" element={<BatchDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("product pages", () => {
  it("renders a responsive product list and resets the URL page when searching", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: products })));
    renderResource("/products?page=3&status=VERIFIED", fetchImplementation);

    expect(await screen.findByRole("link", { name: "VL-2026-000042" })).toHaveAttribute(
      "href",
      "/products/product-one",
    );
    expect(screen.getByRole("rowheader", { name: "VL-2026-000042" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Thermal Control Module" })).toHaveAttribute(
      "data-label",
      "Product",
    );

    await userEvent.type(screen.getByLabelText("Search serial number or batch"), "000042");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const lastUrl = String(fetchImplementation.mock.calls.at(-1)?.[0]);
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("status=VERIFIED");
      expect(lastUrl).toContain("search=000042");
    });
  });

  it("renders product details and custody history", async () => {
    renderResource(
      "/products/product-one",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: productDetail })),
    );

    expect(await screen.findByRole("heading", { name: "VL-2026-000042" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Received" })).toBeInTheDocument();
    expect(screen.getByText("Inbound inspection complete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VL-BATCH-2026-003" })).toHaveAttribute(
      "href",
      "/batches/batch-three",
    );
  });

  it("shows an explicit product empty state", async () => {
    const empty: ProductsResponse = { ...products, products: [] };
    renderResource(
      "/products",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: empty })),
    );

    expect(await screen.findByText("No products found")).toBeInTheDocument();
  });
});

describe("batch pages", () => {
  it("renders batch rows and moves through URL pagination", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: batches })));
    renderResource("/batches", fetchImplementation);

    expect(await screen.findByRole("link", { name: "VL-BATCH-2026-003" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "VL-BATCH-2026-003" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(String(fetchImplementation.mock.calls.at(-1)?.[0])).toContain("page=2");
    });
  });

  it("renders batch detail and a bounded product-filter link", async () => {
    renderResource(
      "/batches/batch-three",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: batchDetail })),
    );

    expect(await screen.findByRole("heading", { name: "VL-BATCH-2026-003" })).toBeInTheDocument();
    expect(screen.getByText("VL-2026-41 – VL-2026-60")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "20 serialized products" })).toHaveAttribute(
      "href",
      "/products?batchId=batch-three",
    );
  });

  it("keeps a batch API error distinct and retryable", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "BATCH_NOT_FOUND",
              fieldErrors: {},
              message: "Batch not found.",
              requestId: "req_batch_missing",
            },
          },
          404,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ data: batchDetail }));
    renderResource("/batches/batch-three", fetchImplementation);

    expect(await screen.findByText("The requested information was not found.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "VL-BATCH-2026-003" })).toBeInTheDocument();
  });
});
