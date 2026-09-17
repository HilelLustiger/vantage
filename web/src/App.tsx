import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./routing/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { Layout } from "./layouts/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountsPage } from "./pages/AccountsPage";
import { AssetsPage } from "./pages/AssetsPage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewDocumentPage } from "./pages/ReviewDocumentPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="import/:documentId/review" element={<ReviewDocumentPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
