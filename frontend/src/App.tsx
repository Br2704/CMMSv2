import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { initializeAuthState, isRootAdmin, useAuthStore } from "@/store/auth.store";
import { ModuleGuard } from "@/components/guards/ModuleGuard";
import { AppErrorBoundary } from "@/components/guards/AppErrorBoundary";
import { queueWebappLog } from "@/api/logs";

// Main Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AMC from "@/pages/AMC";
import WorkOrders from "@/pages/WorkOrders";
import Assets from "@/pages/Assets";
import PreventiveMaintenance from "@/pages/PreventiveMaintenance";
import Calibration from "@/pages/Calibration";
import ESG from "@/pages/ESG";
import Inventory from "@/pages/Inventory";
import Reports from "@/pages/Reports";
import SecurityCenter from "@/pages/SecurityCenter";
import SecurityGate from "@/pages/SecurityGate";
import VisitorExperience from "@/pages/VisitorExperience";
import Masters from "@/pages/Masters";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/NotFound";
import Forbidden from "@/pages/Forbidden";

// Master Pages
import PlantMaster from "@/pages/masters/PlantMaster";
import DepartmentMaster from "@/pages/masters/DepartmentMaster";
import ModulesMaster from "@/pages/masters/ModulesMaster";
import MachinesMaster from "@/pages/masters/MachinesMaster";
import CostCentersMaster from "@/pages/masters/CostCentersMaster";
import VendorsMaster from "@/pages/masters/VendorsMaster";
import UsersMaster from "@/pages/masters/UsersMaster";
import PMConfigMaster from "@/pages/masters/PMConfigMaster";
import CalibrationConfigMaster from "@/pages/masters/CalibrationConfigMaster";
import AMCConfigMaster from "@/pages/masters/AMCConfigMaster";
import ESGConfigMaster from "@/pages/masters/ESGConfigMaster";
import MachineInstrumentsMaster from "@/pages/masters/MachineInstrumentsMaster";
import ShiftMaster from "@/pages/masters/ShiftMaster";
import MaintenanceTeamsMaster from "@/pages/masters/MaintenanceTeamsMaster";
import WorkOrderConfigMaster from "@/pages/masters/WorkOrderConfigMaster";
import GateMaster from "@/pages/masters/GateMaster";
import SafetyConfigMaster from "@/pages/masters/SafetyConfigMaster";
import EmailReportsMaster from "@/pages/masters/EmailReportsMaster";
import LogTemplateMaster from "@/pages/masters/LogTemplateMaster";
import RootDashboard from "@/pages/root/RootDashboard";
import RootOrganizationMaster from "@/pages/root/RootOrganizationMaster";
import RootPlantMaster from "@/pages/root/RootPlantMaster";
import RootRoleAccessMaster from "@/pages/root/RootRoleAccessMaster";
import RootUsersMaster from "@/pages/root/RootUsersMaster";
import QrScanResolver from "@/pages/mobile/QrScanResolver";
import MachineQuickCard from "@/pages/mobile/MachineQuickCard";
import TechnicianDashboard from "@/pages/mobile/TechnicianDashboard";
import LiveQrScan from "@/pages/mobile/LiveQrScan";
import PublicQrAssetPage from "@/pages/public/PublicQrAssetPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        const status = typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: number }).status
          : undefined;
        if (status === 401 || status === 403) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

function DevRouteLogger() {
  const location = useLocation();

  useEffect(() => {
    debugLog("[MOUNT] RouteLogger");
    return () => debugLog("[UNMOUNT] RouteLogger");
  }, []);

  useEffect(() => {
    debugLog("[ROUTE]", location.pathname);
    queueWebappLog({
      level: "INFO",
      action: "route.view",
      message: `Viewed ${location.pathname}`,
      path: `${location.pathname}${location.search}`,
      metadata: {
        search: location.search || null,
      },
    });
  }, [location.pathname, location.search]);

  return null;
}

function WebappErrorLogger() {
  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      queueWebappLog({
        level: "ERROR",
        action: "window.error",
        message: event.message || "Unhandled window error",
        path: window.location.pathname,
        metadata: {
          source: event.filename || null,
          lineno: event.lineno || null,
          colno: event.colno || null,
          stack: event.error instanceof Error ? event.error.stack || null : null,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason instanceof Error
            ? event.reason.message
            : "Unhandled promise rejection";
      queueWebappLog({
        level: "ERROR",
        action: "promise.rejection",
        message: reason,
        path: window.location.pathname,
        metadata: {
          reason: event.reason instanceof Error ? event.reason.stack || event.reason.message : event.reason,
        },
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const location = useLocation();
  const rootAllowedPaths = ["/root/dashboard", "/root/organizations", "/root/plant", "/root/users", "/root/role-access", "/root/role-accesss"];
  const isAllowedForRoot = rootAllowedPaths.some((path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (isRootAdmin(user) && location.pathname.startsWith("/masters/users")) {
    return <Navigate to="/root/users" replace />;
  }
  if (isRootAdmin(user) && location.pathname.startsWith("/masters/role-access")) {
    return <Navigate to="/root/role-access" replace />;
  }
  if (isRootAdmin(user) && location.pathname.startsWith("/masters/organizations")) {
    return <Navigate to="/root/organizations" replace />;
  }
  if (isRootAdmin(user) && location.pathname.startsWith("/masters/plant")) {
    return <Navigate to="/root/plant" replace />;
  }
  if (isRootAdmin(user) && !isAllowedForRoot) {
    return <Navigate to="/root/dashboard" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to={isRootAdmin(user) ? "/root/dashboard" : "/"} replace />;
  return <>{children}</>;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    debugLog("[AUTH] initializeAuthState:start");
    void initializeAuthState().finally(() => {
      debugLog("[AUTH] initializeAuthState:done");
    });
  }, []);

  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuthStore();
  const normalizedRoles = (user?.roles ?? []).map((role) => role.toUpperCase());
  const isVisitorOnly = normalizedRoles.length > 0 && normalizedRoles.every((role) => role === "VISITOR" || role === "TEMPORARY_VISITOR");

  if (isRootAdmin(user)) {
    return <Navigate to="/root/dashboard" replace />;
  }

  if (isVisitorOnly) {
    return <Navigate to="/visitor-experience" replace />;
  }

  return (
    <ModuleGuard moduleId="dashboard">
      <Dashboard />
    </ModuleGuard>
  );
}

function RootOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!isRootAdmin(user)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}

function PlantMasterRoute() {
  const { user } = useAuthStore();
  if (isRootAdmin(user)) {
    return <Navigate to="/root/plant" replace />;
  }
  return (
    <ModuleGuard moduleId="PLANTS">
      <PlantMaster />
    </ModuleGuard>
  );
}

function UsersMasterRoute() {
  const { user } = useAuthStore();
  if (isRootAdmin(user)) {
    return <Navigate to="/root/users" replace />;
  }
  return (
    <ModuleGuard moduleId="masters.users">
      <UsersMaster />
    </ModuleGuard>
  );
}

function RoleAccessRoute() {
  const { user } = useAuthStore();
  if (isRootAdmin(user)) {
    return <Navigate to="/root/role-access" replace />;
  }
  return <Navigate to="/403" replace />;
}

function normalizeSecurityCenterRole(role: string): string {
  const normalized = role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "SUPER_ADMIN") return "SUPERADMIN";
  if (normalized === "PLANT_ADMIN") return "ADMIN";
  return normalized;
}

function normalizeSecurityGateRole(role: string): string {
  return role
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function SecurityGateRoute() {
  const { user } = useAuthStore();
  const roleCandidates = [user?.roleKey ?? "", ...(user?.roles ?? [])].map(normalizeSecurityGateRole);
  const canAccess = roleCandidates.some((role) => role === "SECURITY" || role === "SECURITY_USER");

  if (!canAccess) {
    return <Navigate to="/403" replace />;
  }

  return (
    <ModuleGuard moduleId="security-gate">
      <SecurityGate />
    </ModuleGuard>
  );
}

function SecurityCenterRoute() {
  const { user } = useAuthStore();
  const roleCandidates = [user?.roleKey ?? "", ...(user?.roles ?? [])].map(normalizeSecurityCenterRole);
  const canAccess = roleCandidates.some((role) => role === "ROOT_ADMIN" || role === "SUPERADMIN" || role === "ADMIN");

  if (!canAccess) {
    return <Navigate to="/403" replace />;
  }

  return (
    <ModuleGuard moduleId="security-center">
      <SecurityCenter />
    </ModuleGuard>
  );
}

function CatchAllRoute() {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated && isRootAdmin(user)) {
    return <Navigate to="/root/dashboard" replace />;
  }
  return <NotFound />;
}

function App() {
  useEffect(() => {
    debugLog("[MOUNT] AppShell");
    return () => {
      debugLog("[UNMOUNT] AppShell");
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppErrorBoundary>
            <DevRouteLogger />
            <WebappErrorLogger />
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/qr/:token" element={<PublicQrAssetPage />} />
                <Route path="/assets/:machineCode" element={<PublicQrAssetPage />} />
                <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                  <Route path="/" element={<HomeRoute />} />
                  <Route path="/root/dashboard" element={<RootOnlyRoute><RootDashboard /></RootOnlyRoute>} />
                  <Route path="/root/plant" element={<RootOnlyRoute><RootPlantMaster /></RootOnlyRoute>} />
                  <Route path="/root/users" element={<RootOnlyRoute><RootUsersMaster /></RootOnlyRoute>} />
                  <Route path="/root/role-access" element={<RootOnlyRoute><RootRoleAccessMaster /></RootOnlyRoute>} />
                  <Route path="/root/role-accesss" element={<Navigate to="/root/role-access" replace />} />
                  <Route path="/amc" element={<ModuleGuard moduleId="amc"><AMC /></ModuleGuard>} />
                  <Route path="/work-orders" element={<ModuleGuard moduleId="workorders"><WorkOrders /></ModuleGuard>} />
                  <Route path="/technician" element={<ModuleGuard moduleId="workorders"><TechnicianDashboard /></ModuleGuard>} />
                  <Route path="/scan/live" element={<ModuleGuard moduleId="workorders"><LiveQrScan /></ModuleGuard>} />
                  <Route path="/scan/:token" element={<ModuleGuard moduleId="workorders"><QrScanResolver /></ModuleGuard>} />
                  <Route path="/machine/:machineId" element={<ModuleGuard moduleId="workorders"><MachineQuickCard /></ModuleGuard>} />
                  <Route path="/assets" element={<ModuleGuard moduleId="assets"><Assets /></ModuleGuard>} />
                  <Route path="/preventive-maintenance" element={<ModuleGuard moduleId="pmpd"><PreventiveMaintenance /></ModuleGuard>} />
                  <Route path="/calibration" element={<ModuleGuard moduleId="calibration"><Calibration /></ModuleGuard>} />
                  <Route path="/esg" element={<ModuleGuard moduleId="esg"><ESG /></ModuleGuard>} />
                  <Route path="/inventory" element={<ModuleGuard moduleId="inventory"><Inventory /></ModuleGuard>} />
                  <Route path="/reports" element={<ModuleGuard moduleId="reports"><Reports /></ModuleGuard>} />
                  <Route path="/security-center" element={<SecurityCenterRoute />} />
                  <Route path="/security-gate" element={<SecurityGateRoute />} />
                  <Route path="/visitor-experience" element={<ModuleGuard moduleId="visitor-experience"><VisitorExperience /></ModuleGuard>} />
                  <Route path="/logs" element={<ModuleGuard moduleId="logs"><Logs /></ModuleGuard>} />
                  <Route path="/403" element={<Forbidden />} />

                  <Route path="/masters" element={<ModuleGuard moduleId="masters"><Masters /></ModuleGuard>} />
                  <Route path="/root/organizations" element={<RootOnlyRoute><RootOrganizationMaster /></RootOnlyRoute>} />
                  <Route path="/masters/organizations" element={<Navigate to="/root/organizations" replace />} />
                  <Route path="/masters/plant" element={<PlantMasterRoute />} />
                  <Route path="/masters/departments" element={<ModuleGuard moduleId="masters.departments"><DepartmentMaster /></ModuleGuard>} />
                  <Route path="/masters/modules" element={<ModuleGuard moduleId="masters.modules"><ModulesMaster /></ModuleGuard>} />
                  <Route path="/masters/machines" element={<ModuleGuard moduleId="masters.machines"><MachinesMaster /></ModuleGuard>} />
                  <Route path="/masters/cost-centers" element={<ModuleGuard moduleId="masters.cost-centers"><CostCentersMaster /></ModuleGuard>} />
                  <Route path="/masters/vendors" element={<ModuleGuard moduleId="masters.vendors"><VendorsMaster /></ModuleGuard>} />
                  <Route path="/masters/users" element={<UsersMasterRoute />} />
                  <Route path="/masters/role-access" element={<RoleAccessRoute />} />
                  <Route path="/masters/role-accesss" element={<RoleAccessRoute />} />
                  <Route path="/masters/pm-config" element={<ModuleGuard moduleId="masters.pm-config"><PMConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/calibration-config" element={<ModuleGuard moduleId="masters.calibration-config"><CalibrationConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/amc-config" element={<ModuleGuard moduleId="masters.amc-config"><AMCConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/esg-config" element={<ModuleGuard moduleId="masters.esg-config"><ESGConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/gates" element={<ModuleGuard moduleId="masters.gates"><GateMaster /></ModuleGuard>} />
                  <Route path="/masters/gate-templates" element={<Navigate to="/masters/gates" replace />} />
                  <Route path="/masters/safety-config" element={<ModuleGuard moduleId="masters.safety-config"><SafetyConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/email-reports" element={<ModuleGuard moduleId="masters.email-reports"><EmailReportsMaster /></ModuleGuard>} />
                  <Route path="/masters/log-templates" element={<ModuleGuard moduleId="masters.log-templates"><LogTemplateMaster /></ModuleGuard>} />
                  <Route path="/masters/machine-instruments" element={<ModuleGuard moduleId="masters.machine-instruments"><MachineInstrumentsMaster /></ModuleGuard>} />
                  <Route path="/masters/shifts" element={<ModuleGuard moduleId="masters.shifts"><ShiftMaster /></ModuleGuard>} />
                  <Route path="/masters/maintenance-teams" element={<ModuleGuard moduleId="masters.maintenance-teams"><MaintenanceTeamsMaster /></ModuleGuard>} />
                  <Route path="/masters/work-order-config" element={<ModuleGuard moduleId="masters.workorder-team-mapping"><WorkOrderConfigMaster /></ModuleGuard>} />
                  <Route path="/masters/work-order-team-mapping" element={<Navigate to="/masters/work-order-config" replace />} />
                </Route>
                <Route path="*" element={<CatchAllRoute />} />
              </Routes>
            </AuthProvider>
          </AppErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
