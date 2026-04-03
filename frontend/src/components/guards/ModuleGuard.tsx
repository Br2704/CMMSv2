import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

interface ModuleGuardProps {
  moduleId: string;
  action?: string;
  children: React.ReactNode;
}

export function ModuleGuard({ moduleId, action = "view", children }: ModuleGuardProps) {
  const location = useLocation();
  const { hasModuleAccess, loading } = usePermissions();
  const wasAllowedRef = useRef<boolean | null>(null);
  const hasResolvedRef = useRef(false);
  const allowed = hasModuleAccess(moduleId, action);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[MOUNT] ModuleGuard", moduleId);
    }
    return () => {
      if (import.meta.env.DEV) {
        console.log("[UNMOUNT] ModuleGuard", moduleId);
      }
    };
  }, [moduleId]);

  useEffect(() => {
    if (loading && !hasResolvedRef.current) return;
    hasResolvedRef.current = true;
    if (import.meta.env.DEV) {
      console.log("[GUARD]", moduleId, { allowed, loading });
    }
    if (wasAllowedRef.current === true && !allowed) {
      toast.info("Access updated, redirecting");
    }
    wasAllowedRef.current = allowed;
  }, [allowed, loading]);

  if (loading && !hasResolvedRef.current) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    const redirectPath = wasAllowedRef.current === true ? "/" : "/403";
    return <Navigate to={redirectPath} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
