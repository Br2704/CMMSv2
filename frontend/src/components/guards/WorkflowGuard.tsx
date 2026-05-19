import { usePermissions } from "@/hooks/usePermissions";

interface WorkflowGuardProps {
  module: "workorder" | "visitor" | "vendor" | "pm" | "calibration" | "amc";
  status: string;
  record?: any;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function WorkflowGuard({ module, status, record, children, fallback = null }: WorkflowGuardProps) {
  const { hasWorkflowAccess } = usePermissions();
  const allowed = hasWorkflowAccess(module, status, record);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

interface PermissionGateProps {
  moduleId: string;
  action?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ moduleId, action = "view", children, fallback = null }: PermissionGateProps) {
  const { can } = usePermissions();
  const allowed = can(moduleId, action);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

interface MicroAccessGateProps {
  type: "page" | "tab" | "section" | "button" | "record";
  id: string;
  record?: any;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function MicroAccessGate({ type, id, record, children, fallback = null }: MicroAccessGateProps) {
  const { hasMicroAccess } = usePermissions();
  const allowed = hasMicroAccess({ type, id, record });
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
