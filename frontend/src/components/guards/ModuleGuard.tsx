import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { queueWebappLog } from "@/api/logs";
import { useAccessibleRoutes } from "@/hooks/useAccessibleRoutes";

interface ModuleGuardProps {
  moduleId: string;
  action?: string;
  children: React.ReactNode;
}

export function ModuleGuard({ moduleId, action = "view", children }: ModuleGuardProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasModuleAccess, loading } = usePermissions();
  const { resolveLandingPath } = useAccessibleRoutes();
  const wasAllowedRef = useRef<boolean | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resolved, setResolved] = useState(false);
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
    if (loading) return;
    setResolved(true);
    if (import.meta.env.DEV) {
      console.log("[GUARD]", moduleId, { allowed, loading });
    }
    if (wasAllowedRef.current === true && !allowed) {
      toast.info("Access updated, redirecting");
    }
    wasAllowedRef.current = allowed;
  }, [allowed, loading, moduleId]);

  // Handle redirect in a top-level useEffect with cleanup to prevent memory leaks
  useEffect(() => {
    if (loading || !resolved || allowed) return;

    // Log the security event
    queueWebappLog({
      level: "WARN",
      action: "security.unauthorized_access",
      message: `Unauthorized attempt to access module "${moduleId}" on route "${location.pathname}"`,
      path: location.pathname,
      metadata: {
        moduleId,
        action,
      },
    });

    const redirectPath = resolveLandingPath();
    redirectTimerRef.current = setTimeout(() => {
      navigate(redirectPath, { replace: true, state: { from: location.pathname } });
    }, 300);

    return () => {
      if (redirectTimerRef.current !== null) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [loading, resolved, allowed, navigate, location.pathname, moduleId, action, resolveLandingPath]);

  // Show loading state while fetching permissions to prevent flashes
  if (loading || !resolved) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // After resolving, if not allowed, show redirecting state
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Redirecting to your accessible page...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
