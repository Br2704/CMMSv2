import { Navigate } from "react-router-dom";
import { useAccessibleRoutes } from "@/hooks/useAccessibleRoutes";

export default function Forbidden() {
  const { resolveLandingPath } = useAccessibleRoutes();

  return (
    <Navigate to={resolveLandingPath()} replace />
  );
}
