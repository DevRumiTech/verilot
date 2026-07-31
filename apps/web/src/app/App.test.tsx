import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { App } from "./App.js";

describe("App", () => {
  it("renders the application entry", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "VeriLot" })).toBeInTheDocument();
    expect(screen.getByText("Secure operational oversight", { exact: false })).toBeInTheDocument();
  });

  it("renders a not-found page for an unknown route", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to the start" })).toHaveAttribute("href", "/");
  });
});
