import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import "./styles/global.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The application root is unavailable.");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
