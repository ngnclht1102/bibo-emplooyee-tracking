import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./auth/AuthContext";
import { BusinessProvider } from "./useBusinesses";
import { ThemeProvider } from "./theme/ThemeProvider";
import { Dashboard } from "./pages/Dashboard";
import { EmployeeDetail } from "./pages/EmployeeDetail";
import { Employees } from "./pages/Employees";
import { SignIn } from "./auth/SignIn";
import { SignupWizard } from "./auth/SignupWizard";
import { Settings } from "./pages/Settings";
import { SuperAdminRoute } from "./components/SuperAdminRoute";
import { MessagesAdmin } from "./pages/internal/MessagesAdmin";
import { BusinessOverview } from "./pages/internal/BusinessOverview";
import { MessageEditor } from "./pages/internal/MessageEditor";
import { MessageStats } from "./pages/internal/MessageStats";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "")}>
          <Routes>
            <Route path="/login" element={<SignIn />} />
            <Route path="/signup" element={<SignupWizard />} />
            <Route element={<ProtectedRoute />}>
              <Route
                element={
                  <BusinessProvider>
                    <AppShell />
                  </BusinessProvider>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="employees" element={<Employees />} />
                <Route path="employees/:id" element={<EmployeeDetail />} />
                <Route path="settings" element={<Settings />} />
                <Route element={<SuperAdminRoute />}>
                  <Route path="internal/overview" element={<BusinessOverview />} />
                  <Route path="internal/messages" element={<MessagesAdmin />} />
                  <Route path="internal/messages/new" element={<MessageEditor />} />
                  <Route path="internal/messages/:id" element={<MessageStats />} />
                  <Route path="internal/messages/:id/edit" element={<MessageEditor />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
