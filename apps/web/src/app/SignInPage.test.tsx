import type { AuthSessionResponse } from "@verilot/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";

import { SignInPage, safeRequestedPath } from "./SignInPage.js";
import { AuthApi } from "../auth/auth-api.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { ApiClient, ApiClientError } from "../lib/api-client.js";

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

function authenticationRequired(): ApiClientError {
  return new ApiClientError({
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
    status: 401,
  });
}

function renderSignIn(
  service: AuthApi,
  initialEntry: { pathname: string; state?: { requestedPath: unknown } } = { pathname: "/sign-in" },
) {
  const client = new ApiClient({ fetchImplementation: vi.fn<typeof fetch>() });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SessionProvider client={client} service={service}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/dashboard" element={<h1>Dashboard destination</h1>} />
          <Route path="/products" element={<h1>Products destination</h1>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("SignInPage", () => {
  it("validates both fields and moves keyboard position to the first invalid input", async () => {
    const service = {
      loadSession: vi.fn().mockRejectedValue(authenticationRequired()),
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderSignIn(service);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const email = screen.getByLabelText("Email address");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(document.activeElement).toBe(email);
    expect(service.signIn).not.toHaveBeenCalled();
  });

  it("signs in once and returns to a safe requested route", async () => {
    const service = {
      loadSession: vi.fn().mockRejectedValue(authenticationRequired()),
      signIn: vi.fn().mockResolvedValue(session),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderSignIn(service, { pathname: "/sign-in", state: { requestedPath: "/products" } });

    await userEvent.type(screen.getByLabelText("Email address"), "admin@verilot.local");
    await userEvent.type(screen.getByLabelText("Password"), "private-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Products destination" }),
    ).toBeInTheDocument();
    expect(service.signIn).toHaveBeenCalledTimes(1);
  });

  it("shows a generic credential error without clearing the form", async () => {
    const service = {
      loadSession: vi.fn().mockRejectedValue(authenticationRequired()),
      signIn: vi.fn().mockRejectedValue(
        new ApiClientError({
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect.",
          status: 401,
        }),
      ),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderSignIn(service);

    const email = screen.getByLabelText("Email address");
    await userEvent.type(email, "operator@verilot.local");
    await userEvent.type(screen.getByLabelText("Password"), "incorrect-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
    expect(email).toHaveValue("operator@verilot.local");
  });

  it("moves keyboard position to the first field rejected by the API", async () => {
    const service = {
      loadSession: vi.fn().mockRejectedValue(authenticationRequired()),
      signIn: vi.fn().mockRejectedValue(
        new ApiClientError({
          code: "VALIDATION_ERROR",
          fieldErrors: { password: ["Use the current account password."] },
          message: "The request contains invalid fields.",
          status: 400,
        }),
      ),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderSignIn(service);

    await userEvent.type(screen.getByLabelText("Email address"), "operator@verilot.local");
    const password = screen.getByLabelText("Password");
    await userEvent.type(password, "incorrect-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Use the current account password.")).toBeInTheDocument();
    expect(password).toHaveAttribute("aria-describedby", "password-error");
    expect(document.activeElement).toBe(password);
  });

  it("blocks duplicate submission while the request is pending", async () => {
    let completeRequest: ((value: AuthSessionResponse) => void) | undefined;
    const pending = new Promise<AuthSessionResponse>((resolve) => {
      completeRequest = resolve;
    });
    const service = {
      loadSession: vi.fn().mockRejectedValue(authenticationRequired()),
      signIn: vi.fn().mockReturnValue(pending),
      signOut: vi.fn(),
    } as unknown as AuthApi;
    renderSignIn(service);

    await userEvent.type(screen.getByLabelText("Email address"), "admin@verilot.local");
    await userEvent.type(screen.getByLabelText("Password"), "private-password");
    const button = screen.getByRole("button", { name: "Sign in" });
    await userEvent.dblClick(button);

    expect(service.signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();

    completeRequest?.(session);
    await waitFor(() => expect(screen.getByText("Dashboard destination")).toBeInTheDocument());
  });

  it("rejects external and protocol-relative return paths", () => {
    expect(safeRequestedPath("https://untrusted.example/products")).toBe("/dashboard");
    expect(safeRequestedPath("//untrusted.example/products")).toBe("/dashboard");
    expect(safeRequestedPath("/products?status=VERIFIED")).toBe("/products?status=VERIFIED");
  });
});
