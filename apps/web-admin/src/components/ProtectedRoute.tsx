import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Gate for authenticated routes. Unauthenticated visitors are redirected to
// /login, preserving where they came from so we can return after sign-in.
export function ProtectedRoute() {
  const { isAuthed } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
