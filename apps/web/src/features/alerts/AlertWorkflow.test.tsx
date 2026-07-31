import type {
  AlertDetailResponse,
  AlertWorkflowMutationResponse,
  AuthSessionResponse,
  UsersResponse,
} from "@verilot/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AlertDetailPage } from "./AlertPages.js";
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

const detail: AlertDetailResponse = {
  alert: {
    assignedTo: null,
    batch: {
      code: "VL-BATCH-2026-003",
      id: "batch-three",
      lotNumber: "LOT-003",
      productName: "Thermal Control Module",
      sku: "TCM-100",
    },
    createdAt: "2026-07-31T08:00:00.000Z",
    custodyEvent: null,
    decisionAt: null,
    details: { distanceKm: 280 },
    evidenceRequest: null,
    id: "alert-one",
    product: { id: "product-one", serialNumber: "VL-2026-000042", status: "WARNING" },
    resolvedBy: null,
    reviewNotes: null,
    rule: "IMPOSSIBLE_TRAVEL",
    severity: "HIGH",
    status: "OPEN",
    summary: "Two custody records imply an impossible travel interval.",
    title: "Travel sequence requires review",
    updatedAt: "2026-07-31T08:05:00.000Z",
    verificationAttempt: null,
  },
};

const users: UsersResponse = {
  users: [
    {
      displayName: "Operations Administrator",
      email: "admin@verilot.local",
      id: "admin-user",
      organization: session.user.organization,
      role: "ADMINISTRATOR",
      status: "ACTIVE",
    },
    {
      displayName: "Quality Inspector",
      email: "inspector@verilot.local",
      id: "inspector-user",
      organization: session.user.organization,
      role: "INSPECTOR",
      status: "ACTIVE",
    },
  ],
};

function workflowResponse(action: "assign" | "dismiss" | "resolve"): AlertWorkflowMutationResponse {
  return {
    alert: {
      assignedTo:
        action === "assign" ? { displayName: "Quality Inspector", id: "inspector-user" } : null,
      decisionAt: action === "assign" ? null : "2026-07-31T10:00:00.000Z",
      id: "alert-one",
      resolvedBy:
        action === "assign" ? null : { displayName: "Operations Administrator", id: "admin-user" },
      reviewNotes: action === "assign" ? null : "Evidence confirms the recorded route.",
      status: action === "assign" ? "IN_REVIEW" : action === "resolve" ? "RESOLVED" : "DISMISSED",
      updatedAt: "2026-07-31T10:00:00.000Z",
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

function renderPage(fetchImplementation: typeof fetch, currentSession = session) {
  const service = {
    loadSession: vi.fn().mockResolvedValue(currentSession),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as unknown as AuthApi;
  const client = new ApiClient({ fetchImplementation });

  render(
    <MemoryRouter initialEntries={["/alerts/alert-one"]}>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route path="/alerts/:alertId" element={<AlertDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("alert workflow", () => {
  it("preserves assignment input and reuses its idempotency key after a failed request", async () => {
    let assignmentAttempts = 0;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      const path = String(input);

      if (path === "/api/v1/users") {
        return Promise.resolve(jsonResponse({ data: users }));
      }

      if (options?.method === "POST" && path.endsWith("/assign")) {
        assignmentAttempts += 1;

        if (assignmentAttempts === 1) {
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: "SERVICE_UNAVAILABLE",
                  fieldErrors: {},
                  message: "The service is temporarily unavailable.",
                  requestId: "req_assignment_failure",
                },
              },
              503,
            ),
          );
        }

        return Promise.resolve(jsonResponse({ data: workflowResponse("assign") }));
      }

      return Promise.resolve(jsonResponse({ data: detail }));
    });
    renderPage(fetchImplementation);

    expect(
      await screen.findByRole("heading", { name: "Travel sequence requires review" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Assign" }));
    await userEvent.selectOptions(await screen.findByLabelText("Assign to"), "inspector-user");
    await userEvent.type(
      screen.getByLabelText("Assignment reason (optional)"),
      "Regional quality review",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    expect(await screen.findByText(/entries have been preserved; try again/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Assign to")).toHaveValue("inspector-user");
    expect(screen.getByLabelText("Assignment reason (optional)")).toHaveValue(
      "Regional quality review",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    expect(await screen.findByText("Alert assigned to Quality Inspector.")).toBeInTheDocument();
    const postCalls = fetchImplementation.mock.calls.filter(
      ([input, options]) => String(input).endsWith("/assign") && options?.method === "POST",
    );
    expect(postCalls).toHaveLength(2);
    const firstBody = JSON.parse(String(postCalls[0]?.[1]?.body)) as Record<string, string>;
    const secondBody = JSON.parse(String(postCalls[1]?.[1]?.body)) as Record<string, string>;
    expect(firstBody.idempotencyKey).toBe(secondBody.idempotencyKey);
    expect(firstBody).toMatchObject({
      assignedToId: "inspector-user",
      reason: "Regional quality review",
    });
    expect(new Headers(postCalls[1]?.[1]?.headers).get("x-csrf-token")).toBe("runtime-csrf-token");
  });

  it("validates and submits a resolution, and closes a dismissal with Escape", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, options) => {
      if (options?.method === "POST" && String(input).endsWith("/resolve")) {
        return Promise.resolve(jsonResponse({ data: workflowResponse("resolve") }));
      }

      return Promise.resolve(jsonResponse({ data: detail }));
    });
    renderPage(fetchImplementation);
    expect(await screen.findByRole("button", { name: "Resolve" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("dialog", { name: "Dismiss alert" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Dismiss alert" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await userEvent.click(screen.getByRole("button", { name: "Resolve alert" }));
    expect(screen.getByText("Enter review notes for this decision.")).toBeInTheDocument();
    expect(
      fetchImplementation.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(0);

    await userEvent.type(
      screen.getByLabelText("Review notes"),
      "Evidence confirms the recorded route.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve alert" }));

    expect(
      await screen.findByText("Alert resolved and the investigation record was updated."),
    ).toBeInTheDocument();
    const resolutionCall = fetchImplementation.mock.calls.find(
      ([input, options]) => String(input).endsWith("/resolve") && options?.method === "POST",
    );
    expect(JSON.parse(String(resolutionCall?.[1]?.body))).toMatchObject({
      reviewNotes: "Evidence confirms the recorded route.",
    });
  });

  it("hides mutation controls from an operator", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: detail }));
    renderPage(fetchImplementation, {
      ...session,
      user: { ...session.user, role: "OPERATOR" },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Travel sequence requires review" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "Update alert" })).not.toBeInTheDocument();
  });

  it("hides mutation controls for a closed alert", async () => {
    renderPage(
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          data: {
            alert: {
              ...detail.alert,
              decisionAt: "2026-07-31T10:00:00.000Z",
              status: "RESOLVED",
            },
          } satisfies AlertDetailResponse,
        }),
      ),
    );

    expect(
      await screen.findByRole("heading", { name: "Travel sequence requires review" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Update alert" })).not.toBeInTheDocument();
  });
});
