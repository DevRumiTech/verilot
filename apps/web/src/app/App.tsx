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
import { AuditDetailPage, AuditListPage } from "../features/audit/AuditPages.js";
import { LocationListPage } from "../features/locations/LocationPages.js";
import { RecallDetailPage, RecallListPage } from "../features/recalls/RecallPages.js";

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
        <Route path="locations" element={<LocationListPage />} />
        <Route
          path="audit"
          element={
            <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
              <AuditListPage />
            </AuthGuard>
          }
        />
        <Route
          path="audit/:auditRecordId"
          element={
            <AuthGuard permission={PERMISSIONS.auditRecordsRead}>
              <AuditDetailPage />
            </AuthGuard>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
