import type {
  BatchesResponse,
  AuthSessionResponse,
  RecallDetailResponse,
  RecallsResponse,
  RecallWorkflowMutationResponse,
} from "@verilot/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { RecallDetailPage, RecallListPage } from "./RecallPages.js";
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

const activeBatches: BatchesResponse = {
  batches: [
    {
      activatedAt: "2026-07-28T08:00:00.000Z",
      code: "VL-BATCH-2026-008",
      expiresAt: "2028-07-28T00:00:00.000Z",
      id: "batch-eight",
      lotNumber: "LOT-008",
      manufacturedAt: "2026-07-27T00:00:00.000Z",
      productCount: 20,
      productName: "Optical Relay Module",
      recallCount: 0,
      serialEnd: 180,
      serialPrefix: "VL-2026-",
      serialStart: 161,
      sku: "ORM-300",
      status: "ACTIVE",
    },
  ],
  pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
};

function workflowResponse(action: "complete" | "create"): RecallWorkflowMutationResponse {
  return {
    recall: {
      announcedAt: "2026-07-31T11:00:00.000Z",
      batchId: action === "create" ? "batch-eight" : "batch-seven",
      completedAt: action === "complete" ? "2026-07-31T12:00:00.000Z" : null,
      id: action === "create" ? "recall-two" : "recall-one",
      reference: action === "create" ? "VL-REC-2026-002" : "VL-REC-2026-001",
      status: action === "complete" ? "COMPLETED" : "ACTIVE",
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
          <Route path="/recalls" element={<RecallListPage />} />
          <Route path="/recalls/:recallId" element={<RecallDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("recall workflow", () => {
  it("creates a recall for an active batch with CSRF and an idempotency key", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      const path = String(input);

      if (path.includes("/batches?")) {
        return Promise.resolve(jsonResponse({ data: activeBatches }));
      }

      if (path === "/api/v1/recalls" && options?.method === "POST") {
        return Promise.resolve(jsonResponse({ data: workflowResponse("create") }, 201));
      }

      return Promise.resolve(jsonResponse({ data: recalls }));
    });
    renderPage("/recalls", fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Create recall" }));
    const dialog = await screen.findByRole("dialog", { name: "Create recall" });
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "marks the selected active batch and its eligible products as recalled",
    );
    const createButton = within(dialog).getByRole("button", { name: "Create recall" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await userEvent.click(createButton);
    const batchSelect = within(dialog).getByLabelText("Active batch");
    expect(batchSelect).toHaveAttribute("aria-describedby", "recall-batch-help recall-batch-error");
    expect(document.activeElement).toBe(batchSelect);
    expect(
      fetchImplementation.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(0);
    await userEvent.selectOptions(batchSelect, "batch-eight");
    await userEvent.type(within(dialog).getByLabelText("Recall reference"), "VL-REC-2026-002");
    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "Calibration documentation requires a controlled return.",
    );
    await userEvent.click(createButton);

    expect(
      await screen.findByText(
        "Recall VL-REC-2026-002 was created and the batch was marked as recalled.",
      ),
    ).toBeInTheDocument();
    const mutationCall = fetchImplementation.mock.calls.find(
      ([input, options]) => String(input) === "/api/v1/recalls" && options?.method === "POST",
    );
    const body = JSON.parse(String(mutationCall?.[1]?.body)) as Record<string, string>;
    expect(body).toMatchObject({
      batchId: "batch-eight",
      reason: "Calibration documentation requires a controlled return.",
      reference: "VL-REC-2026-002",
    });
    expect(body.idempotencyKey).toMatch(/^recall-create:/);
    expect(new Headers(mutationCall?.[1]?.headers).get("x-csrf-token")).toBe("runtime-csrf-token");
  });

  it("completes only an active recall after confirmation", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      if (options?.method === "POST" && String(input).endsWith("/complete")) {
        return Promise.resolve(jsonResponse({ data: workflowResponse("complete") }));
      }

      return Promise.resolve(jsonResponse({ data: recallDetail }));
    });
    renderPage("/recalls/recall-one", fetchImplementation);

    await userEvent.click(await screen.findByRole("button", { name: "Complete recall" }));
    const dialog = screen.getByRole("dialog", { name: "Complete recall" });
    expect(dialog).toHaveTextContent("The recall and its audit history remain available.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Complete recall" }));

    expect(
      await screen.findByText("Recall VL-REC-2026-001 was marked as completed."),
    ).toBeInTheDocument();
    const mutationCall = fetchImplementation.mock.calls.find(
      ([input, options]) => String(input).endsWith("/complete") && options?.method === "POST",
    );
    expect(JSON.parse(String(mutationCall?.[1]?.body)).idempotencyKey).toMatch(/^recall-complete:/);
  });

  it("hides recall management controls from an inspector", async () => {
    renderPage(
      "/recalls",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: recalls })),
      { ...session, user: { ...session.user, role: "INSPECTOR" } },
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Recalls" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Create recall" })).not.toBeInTheDocument();
  });

  it("hides completion for a recall that is no longer active", async () => {
    renderPage(
      "/recalls/recall-one",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          data: {
            recall: {
              ...recallDetail.recall,
              completedAt: "2026-07-31T12:00:00.000Z",
              status: "COMPLETED",
            },
          } satisfies RecallDetailResponse,
        }),
      ),
    );

    expect(await screen.findByRole("heading", { name: "VL-REC-2026-001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete recall" })).not.toBeInTheDocument();
  });
});
