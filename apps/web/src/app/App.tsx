import { PERMISSIONS } from "@verilot/contracts";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./AppShell.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { SignInPage } from "./SignInPage.js";
import { AuthGuard } from "../auth/SessionProvider.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";
import { BatchDetailPage, BatchListPage } from "../features/batches/BatchPages.js";
import { ProductDetailPage, ProductListPage } from "../features/products/ProductPages.js";
import { AlertDetailPage, AlertListPage } from "../features/alerts/AlertPages.js";
import { RecallDetailPage, RecallListPage } from "../features/recalls/RecallPages.js";

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
        <Route path="products" element={<ProductListPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="batches" element={<BatchListPage />} />
        <Route path="batches/:batchId" element={<BatchDetailPage />} />
        <Route path="alerts" element={<AlertListPage />} />
        <Route path="alerts/:alertId" element={<AlertDetailPage />} />
        <Route path="recalls" element={<RecallListPage />} />
        <Route path="recalls/:recallId" element={<RecallDetailPage />} />
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
