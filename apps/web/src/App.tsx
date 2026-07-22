import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./routes/LoginPage";
import { Layout } from "./routes/Layout";
import { DashboardPage } from "./routes/DashboardPage";
import { AccountsPage } from "./routes/AccountsPage";
import { AssetsPage } from "./routes/AssetsPage";
import { ImportPage } from "./routes/ImportPage";
import { ReviewDocumentPage } from "./routes/ReviewDocumentPage";

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
