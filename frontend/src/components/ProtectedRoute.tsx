import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  requireAdmin?: boolean;
};

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: Props) {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (requireAdmin && user.role !== "ADMIN") {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}
