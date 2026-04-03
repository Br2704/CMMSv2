import { useAuthStore } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";
import { usePermissionsStore } from "@/store/permissions.store";
import { useFeaturesStore } from "@/store/features.store";

export function DebugStatusPanel() {
  const user = useAuthStore((state) => state.user);
  const organizationId = useBrandingStore((state) => state.organizationId);
  const brandingVersion = useBrandingStore((state) => state.version);
  const rbacVersion = usePermissionsStore((state) => state.rbacVersion);
  const featuresOrgId = useFeaturesStore((state) => state.organizationId);

  if (!import.meta.env.DEV || !user) return null;

  return (
    <div className="fixed bottom-2 right-2 z-[60] rounded-lg border border-border/70 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-md backdrop-blur">
      <div>role: {user.roleKey || user.roles?.[0] || "unknown"}</div>
      <div>org: {organizationId || featuresOrgId || "-"}</div>
      <div>plant: {user.plantId || "-"}</div>
      <div>rbacVersion: {rbacVersion ?? "-"}</div>
      <div>brandingVersion: {brandingVersion ?? "-"}</div>
    </div>
  );
}

