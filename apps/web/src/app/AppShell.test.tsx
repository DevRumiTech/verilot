import type { AuthSessionResponse } from "@verilot/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { AppShell } from "./AppShell.js";
import { AuthApi } from "../auth/auth-api.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { ApiClient } from "../lib/api-client.js";

const baseSession: AuthSessionResponse = {
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

function renderShell(
  options: { role?: AuthSessionResponse["user"]["role"]; signOut?: () => Promise<void> } = {},
) {
  const loadedSession: AuthSessionResponse = {
    ...baseSession,
    user: { ...baseSession.user, role: options.role ?? "ADMINISTRATOR" },
  };
  const service = {
    loadSession: vi.fn().mockResolvedValue(loadedSession),
    signIn: vi.fn(),
    signOut: vi.fn(options.signOut ?? (() => Promise.resolve())),
  } as unknown as AuthApi;
  const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });

  render(
    <MemoryRouter>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Dashboard view</h1>} />
            <Route path="products" element={<h1>Products view</h1>} />
          </Route>
          <Route path="sign-in" element={<h1>Signed out</h1>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );

  return { service };
}

describe("AppShell", () => {
  it("shows organization context and administrator navigation", async () => {
    renderShell();

    expect(await screen.findByRole("heading", { name: "Dashboard view" })).toBeInTheDocument();
    expect(screen.getByText("Operations Administrator")).toBeInTheDocument();
    expect(screen.getByText("VeriLot Manufacturing Romandie")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("hides audit navigation from operators", async () => {
    renderShell({ role: "OPERATOR" });

    expect(await screen.findByRole("heading", { name: "Dashboard view" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
  });

  it("signs out from the account panel", async () => {
    const { service } = renderShell();
    expect(await screen.findByRole("heading", { name: "Dashboard view" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(service.signOut).toHaveBeenCalledTimes(1));
  });

  it("opens the mobile menu, closes it with Escape, and closes after navigation", async () => {
    renderShell();
    expect(await screen.findByRole("heading", { name: "Dashboard view" })).toBeInTheDocument();
    const menuButton = screen.getByRole("button", { name: "Menu" });

    await userEvent.click(menuButton);
    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(within(mobileNavigation).getByRole("link", { name: "Products" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(menuButton);
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();

    await userEvent.click(menuButton);
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("link", {
        name: "Products",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Products view" })).toBeInTheDocument();
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });
});
