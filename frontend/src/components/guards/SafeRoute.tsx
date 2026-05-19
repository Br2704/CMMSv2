import { RouteErrorBoundary } from "./RouteErrorBoundary";
import type { ReactNode } from "react";

export function SafeRoute({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      {children}
    </RouteErrorBoundary>
  );
}
