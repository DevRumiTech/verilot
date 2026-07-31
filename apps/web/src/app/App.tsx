import { PERMISSIONS } from "@verilot/contracts";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./AppShell.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { SignInPage } from "./SignInPage.js";
import { AuthGuard } from "../auth/SessionProvider.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";

function PendingPage({ description, title }: { description: string; title: string }) {
  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page-header">
        <p className="eyebrow">Operations</p>
        <h1 id="page-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div className="surface empty-state">
        <h2>API view scheduled</h2>
        <p>This route is ready for its resource interface in the next delivery milestone.</p>
      </div>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate replace to="/dashboard" />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="products/*"
          element={
            <PendingPage
              description="Review serialized products and their append-only custody history."
              title="Products"
            />
          }
        />
        <Route
          path="batches/*"
          element={
            <PendingPage
              description="Review manufacturing lots and product activation state."
              title="Batches"
            />
          }
        />
        <Route
          path="alerts/*"
          element={
            <PendingPage
              description="Investigate rule-based anomalies and document review decisions."
              title="Alerts"
            />
          }
        />
        <Route
          path="recalls/*"
          element={
            <PendingPage
              description="Track affected batches and recall progress."
              title="Recalls"
            />
          }
        />
        <Route
          path="locations"
          element={
            <PendingPage
              description="Reference Swiss custody locations and global handoff points."
              title="Locations"
            />
          }
        />
        <Route
          path="audit/*"
          element={
            <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
              <PendingPage
                description="Inspect immutable administrative and operational records."
                title="Audit"
              />
            </AuthGuard>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
