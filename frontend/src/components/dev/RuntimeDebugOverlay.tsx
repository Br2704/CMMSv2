import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import { usePermissionsStore } from "@/store/permissions.store";

export function RuntimeDebugOverlay() {
  const isDev = import.meta.env.DEV;
  const location = useLocation();
  const { isLoading, isAuthenticated, user } = useAuthStore();
  const rbacVersion = usePermissionsStore((state) => state.rbacVersion);
  const permissionsLoading = usePermissionsStore((state) => state.loading);
  const lastSyncedAt = usePermissionsStore((state) => state.lastSyncedAt);

  const authStatus = useMemo(() => {
    if (isLoading) return "loading";
    return isAuthenticated ? "authenticated" : "anonymous";
  }, [isAuthenticated, isLoading]);

  if (!isDev) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-2 right-2 z-[60] rounded-md border border-border bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-lg backdrop-blur">
      <div>route: {location.pathname}</div>
      <div>auth: {authStatus}</div>
      <div>user: {user?.userCode ?? "-"}</div>
      <div>permissionsLoading: {permissionsLoading ? "yes" : "no"}</div>
      <div>rbacVersion: {typeof rbacVersion === "number" ? rbacVersion : "-"}</div>
      <div>lastPermSync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "-"}</div>
    </div>
  );
}
