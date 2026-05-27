import { useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getAccessibleAppPages,
  isPathAccessible,
  resolveAccessibleLandingPath,
  type AccessibleRouteContext,
} from "@/lib/accessible-routes";

export function useAccessibleRoutes() {
  const { user } = useAuthStore();
  const { hasModuleAccess } = usePermissions();

  const context = useMemo<AccessibleRouteContext>(() => ({
    roles: user?.roles ?? [],
    roleKey: user?.roleKey ?? null,
    canAccessModule: hasModuleAccess,
  }), [hasModuleAccess, user?.roleKey, user?.roles]);

  const accessiblePages = useMemo(() => getAccessibleAppPages(context), [context]);
  const resolveLandingPath = useMemo(() => () => resolveAccessibleLandingPath(context), [context]);
  const canAccessPath = useMemo(() => (path: string) => isPathAccessible(path, context), [context]);

  return {
    context,
    accessiblePages,
    resolveLandingPath,
    canAccessPath,
  };
}
