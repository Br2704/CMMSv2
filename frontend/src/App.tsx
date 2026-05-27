import { lazy, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { initializeAuthState, useAuthStore } from "@/store/auth.store";
import { isRootAdmin, isSuperAdmin, hasRole } from "@/lib/permission-engine";
import { ModuleGuard } from "@/components/guards/ModuleGuard";
import { AppErrorBoundary } from "@/components/guards/AppErrorBoundary";
import { RouteErrorBoundary } from "@/components/guards/RouteErrorBoundary";
import { SafeRoute } from "@/components/guards/SafeRoute";
import { SuspenseLoader } from "@/components/guards/SuspenseLoader";
import { getStoredAccessToken } from "@/api/token";
import { queueWebappLog } from "@/api/logs";
import { useAccessibleRoutes } from "@/hooks/useAccessibleRoutes";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IdleTimeoutDialog } from "@/components/shared/IdleTimeoutDialog";

// Lazy-loaded page components for code splitting
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AMC = lazy(() => import("@/pages/AMC"));
const WorkOrders = lazy(() => import("@/pages/WorkOrders"));
const Assets = lazy(() => import("@/pages/Assets"));
const PreventiveMaintenance = lazy(() => import("@/pages/PreventiveMaintenance"));
const Calibration = lazy(() => import("@/pages/Calibration"));
const ESG = lazy(() => import("@/pages/ESG"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Reports = lazy(() => import("@/pages/Reports"));
const SecurityCenter = lazy(() => import("@/pages/SecurityCenter"));
const SecurityGate = lazy(() => import("@/pages/SecurityGate"));
const VisitorExperience = lazy(() => import("@/pages/VisitorExperience"));
const Masters = lazy(() => import("@/pages/Masters"));
const Logs = lazy(() => import("@/pages/Logs"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Forbidden = lazy(() => import("@/pages/Forbidden"));

// Lazy-loaded Master Pages
const PlantMaster = lazy(() => import("@/pages/masters/PlantMaster"));
const DepartmentMaster = lazy(() => import("@/pages/masters/DepartmentMaster"));
const ModulesMaster = lazy(() => import("@/pages/masters/ModulesMaster"));
const MachinesMaster = lazy(() => import("@/pages/masters/MachinesMaster"));
const CostCentersMaster = lazy(() => import("@/pages/masters/CostCentersMaster"));
const VendorsMaster = lazy(() => import("@/pages/masters/VendorsMaster"));
const UsersMaster = lazy(() => import("@/pages/masters/UsersMaster"));
const PMConfigMaster = lazy(() => import("@/pages/masters/PMConfigMaster"));
const CalibrationConfigMaster = lazy(() => import("@/pages/masters/CalibrationConfigMaster"));
const AMCConfigMaster = lazy(() => import("@/pages/masters/AMCConfigMaster"));
const ESGConfigMaster = lazy(() => import("@/pages/masters/ESGConfigMaster"));
const MachineInstrumentsMaster = lazy(() => import("@/pages/masters/MachineInstrumentsMaster"));
const ShiftMaster = lazy(() => import("@/pages/masters/ShiftMaster"));
const MaintenanceTeamsMaster = lazy(() => import("@/pages/masters/MaintenanceTeamsMaster"));
const WorkOrderConfigMaster = lazy(() => import("@/pages/masters/WorkOrderConfigMaster"));
const GateMaster = lazy(() => import("@/pages/masters/GateMaster"));
const SafetyConfigMaster = lazy(() => import("@/pages/masters/SafetyConfigMaster"));
const EmailReportsMaster = lazy(() => import("@/pages/masters/EmailReportsMaster"));
const LogTemplateMaster = lazy(() => import("@/pages/masters/LogTemplateMaster"));

// Lazy-loaded Root Pages
const MailConfigMaster = lazy(() => import("@/pages/root/MailConfigMaster"));
const SLAConfigMaster = lazy(() => import("@/pages/root/SLAConfigMaster"));
const RootDashboard = lazy(() => import("@/pages/root/RootDashboard"));
const RootOrganizationMaster = lazy(() => import("@/pages/root/RootOrganizationMaster"));
const RootPlantMaster = lazy(() => import("@/pages/root/RootPlantMaster"));
const RootRoleAccessMaster = lazy(() => import("@/pages/root/RootRoleAccessMaster"));
const RootUsersMaster = lazy(() => import("@/pages/root/RootUsersMaster"));
const RootBackupPage = lazy(() => import("@/pages/root/RootBackupPage"));
const SecretRotationStatus = lazy(() => import("@/pages/root/SecretRotationStatus"));

// Lazy-loaded Mobile Pages
const QrScanResolver = lazy(() => import("@/pages/mobile/QrScanResolver"));
const MachineQuickCard = lazy(() => import("@/pages/mobile/MachineQuickCard"));
const TechnicianDashboard = lazy(() => import("@/pages/mobile/TechnicianDashboard"));
const LiveQrScan = lazy(() => import("@/pages/mobile/LiveQrScan"));
const PublicQrAssetPage = lazy(() => import("@/pages/public/PublicQrAssetPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Exponential stale time to reduce unnecessary refetches
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        const status = typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: number }).status
          : undefined;
        // Never retry auth errors or server-down errors
        if (status === 401 || status === 403) return false;
        // Don't retry server errors — prevents flooding when backend is down
        if (status === 502 || status === 503 || status === 504) return false;
        if (status === 500) return false;
        // Network error (status 0) — retry once
        if (status === 0) return failureCount < 1;
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
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
  const lastLoggedRef = useRef<string>("");

  useEffect(() => {
    debugLog("[MOUNT] RouteLogger");
    return () => debugLog("[UNMOUNT] RouteLogger");
  }, []);

  useEffect(() => {
    const routeKey = `${location.pathname}${location.search}`;
    if (lastLoggedRef.current === routeKey) {
      return;
    }

    lastLoggedRef.current = routeKey;
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

function RouteFlowManager() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo(0, 0);

    const mainContent = document.querySelector<HTMLElement>("main[data-app-main]");
    mainContent?.focus();
  }, [location.pathname, location.search, location.hash]);

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
  const { isAuthenticated, isLoading, user, isFallbackMode } = useAuthStore();
  const accessToken = getStoredAccessToken();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{"Loading..."}</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated || (!accessToken && !isFallbackMode)) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (isRootAdmin(user?.roles ?? []) && !location.pathname.startsWith("/root/")) {
    return <Navigate to="/root/dashboard" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{"Loading..."}</p>
        </div>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to={isRootAdmin(user?.roles ?? []) ? "/root/dashboard" : "/"} replace />;
  return <>{children}</>;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    debugLog("[AUTH] initializeAuthState:start");
    const timeout = setTimeout(() => {
      // Safety: if initialization hasn't completed in 10s, force set loading to false
      useAuthStore.getState().setLoading(false);
      debugLog("[AUTH] initializeAuthState:timeout-safety");
    }, 10000);
    void initializeAuthState().finally(() => {
      clearTimeout(timeout);
      debugLog("[AUTH] initializeAuthState:done");
    });
  }, []);

  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuthStore();
  const { canAccessPath, resolveLandingPath } = useAccessibleRoutes();
  if (isRootAdmin(user?.roles ?? [])) {
    return <Navigate to="/root/dashboard" replace />;
  }
  if (canAccessPath("/")) {
    return (
      <ModuleGuard moduleId="dashboard">
        <SuspenseLoader><Dashboard /></SuspenseLoader>
      </ModuleGuard>
    );
  }

  return <Navigate to={resolveLandingPath()} replace />;
}

function RootOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { resolveLandingPath } = useAccessibleRoutes();
  if (!isRootAdmin(user?.roles ?? [])) {
    return <Navigate to={resolveLandingPath()} replace />;
  }
  return <>{children}</>;
}

function SLAConfigRoute() {
  const { user } = useAuthStore();
  const { resolveLandingPath } = useAccessibleRoutes();
  if (isRootAdmin(user?.roles ?? []) || isSuperAdmin(user?.roles ?? []) || hasRole(user?.roles ?? [], "PLANT_ADMIN")) {
    return <SuspenseLoader><SLAConfigMaster /></SuspenseLoader>;
  }
  return <Navigate to={resolveLandingPath()} replace />;
}

function PlantMasterRoute() {
  const { user } = useAuthStore();
  if (isRootAdmin(user?.roles ?? []))
 {
    return <Navigate to="/root/plant" replace />;
  }
  return (
    <ModuleGuard moduleId="PLANTS">
      <SuspenseLoader><PlantMaster /></SuspenseLoader>
    </ModuleGuard>
  );
}

function UsersMasterRoute() {
  const { user } = useAuthStore();
  if (isRootAdmin(user?.roles ?? []))
 {
    return <Navigate to="/root/users" replace />;
  }
  return (
    <ModuleGuard moduleId="masters.users">
      <SuspenseLoader><UsersMaster /></SuspenseLoader>
    </ModuleGuard>
  );
}

function RoleAccessRoute() {
  const { user } = useAuthStore();
  const { resolveLandingPath } = useAccessibleRoutes();
  if (isRootAdmin(user?.roles ?? []))
 {
    return <Navigate to="/root/role-access" replace />;
  }
  return <Navigate to={resolveLandingPath()} replace />;
}

function SecurityGateRoute() {
  const { canAccessPath, resolveLandingPath } = useAccessibleRoutes();
  const canAccess = canAccessPath("/security-gate");

  if (!canAccess) {
    return <Navigate to={resolveLandingPath()} replace />;
  }

  return (
    <ModuleGuard moduleId="security-gate">
      <SuspenseLoader><SecurityGate /></SuspenseLoader>
    </ModuleGuard>
  );
}

function SecurityCenterRoute() {
  const { canAccessPath, resolveLandingPath } = useAccessibleRoutes();
  const canAccess = canAccessPath("/security-center");

  if (!canAccess) {
    return <Navigate to={resolveLandingPath()} replace />;
  }

  return (
    <ModuleGuard moduleId="security-center">
      <SuspenseLoader><SecurityCenter /></SuspenseLoader>
    </ModuleGuard>
  );
}

function CatchAllRoute() {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated && isRootAdmin(user?.roles ?? []))
 {
    return <Navigate to="/root/dashboard" replace />;
  }
  return <SuspenseLoader><NotFound /></SuspenseLoader>;
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
            <RouteFlowManager />
            <DevRouteLogger />
            <WebappErrorLogger />
            <IdleTimeoutDialog />
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<SafeRoute><PublicRoute><SuspenseLoader><Login /></SuspenseLoader></PublicRoute></SafeRoute>} />
                <Route path="/qr/:token" element={<SafeRoute><SuspenseLoader><PublicQrAssetPage /></SuspenseLoader></SafeRoute>} />
                <Route path="/assets/:machineCode" element={<SafeRoute><SuspenseLoader><PublicQrAssetPage /></SuspenseLoader></SafeRoute>} />
                <Route element={<SafeRoute><ProtectedRoute><MainLayout /></ProtectedRoute></SafeRoute>}>
                  <Route path="/" element={<SafeRoute><HomeRoute /></SafeRoute>} />
                  <Route path="/root/dashboard" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootDashboard /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/plant" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootPlantMaster /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/users" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootUsersMaster /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/role-access" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootRoleAccessMaster /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/role-accesss" element={<SafeRoute><Navigate to="/root/role-access" replace /></SafeRoute>} />
                  <Route path="/amc" element={<SafeRoute><ModuleGuard moduleId="amc"><SuspenseLoader><AMC /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/work-orders" element={<SafeRoute><ModuleGuard moduleId="workorders"><SuspenseLoader><WorkOrders /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/technician" element={<SafeRoute><ModuleGuard moduleId="workorders"><SuspenseLoader><TechnicianDashboard /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/scan/live" element={<SafeRoute><ModuleGuard moduleId="workorders"><SuspenseLoader><LiveQrScan /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/scan/:token" element={<SafeRoute><ModuleGuard moduleId="workorders"><SuspenseLoader><QrScanResolver /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/machine/:machineId" element={<SafeRoute><ModuleGuard moduleId="workorders"><SuspenseLoader><MachineQuickCard /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/assets" element={<SafeRoute><ModuleGuard moduleId="assets"><SuspenseLoader><Assets /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/preventive-maintenance" element={<SafeRoute><ModuleGuard moduleId="pmpd"><SuspenseLoader><PreventiveMaintenance /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/calibration" element={<SafeRoute><ModuleGuard moduleId="calibration"><SuspenseLoader><Calibration /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/esg" element={<SafeRoute><ModuleGuard moduleId="esg"><SuspenseLoader><ESG /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/inventory" element={<SafeRoute><ModuleGuard moduleId="inventory"><SuspenseLoader><Inventory /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/reports" element={<SafeRoute><ModuleGuard moduleId="reports"><SuspenseLoader><Reports /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/security-center" element={<SafeRoute><SecurityCenterRoute /></SafeRoute>} />
                  <Route path="/security-gate" element={<SafeRoute><SecurityGateRoute /></SafeRoute>} />
                  <Route path="/visitor-experience" element={<SafeRoute><ModuleGuard moduleId="visitor-experience"><SuspenseLoader><VisitorExperience /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/logs" element={<SafeRoute><ModuleGuard moduleId="logs"><SuspenseLoader><Logs /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/403" element={<SafeRoute><SuspenseLoader><Forbidden /></SuspenseLoader></SafeRoute>} />

                  <Route path="/masters" element={<SafeRoute><ModuleGuard moduleId="masters"><SuspenseLoader><Masters /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/root/organizations" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootOrganizationMaster /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/mail-config" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><MailConfigMaster /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/secret-rotation" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><SecretRotationStatus /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/backup" element={<SafeRoute><RootOnlyRoute><SuspenseLoader><RootBackupPage /></SuspenseLoader></RootOnlyRoute></SafeRoute>} />
                  <Route path="/root/sla-config" element={<SafeRoute><Navigate to="/masters/sla-config" replace /></SafeRoute>} />
                  <Route path="/masters/organizations" element={<SafeRoute><Navigate to="/root/organizations" replace /></SafeRoute>} />
                  <Route path="/masters/mail-config" element={<SafeRoute><Navigate to="/root/mail-config" replace /></SafeRoute>} />
                  <Route path="/masters/sla-config" element={<SafeRoute><SLAConfigRoute /></SafeRoute>} />
                  <Route path="/masters/plant" element={<SafeRoute><PlantMasterRoute /></SafeRoute>} />
                  <Route path="/masters/departments" element={<SafeRoute><ModuleGuard moduleId="masters.departments"><SuspenseLoader><DepartmentMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/modules" element={<SafeRoute><ModuleGuard moduleId="masters.modules"><SuspenseLoader><ModulesMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/machines" element={<SafeRoute><ModuleGuard moduleId="masters.machines"><SuspenseLoader><MachinesMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/cost-centers" element={<SafeRoute><ModuleGuard moduleId="masters.cost-centers"><SuspenseLoader><CostCentersMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/vendors" element={<SafeRoute><ModuleGuard moduleId="masters.vendors"><SuspenseLoader><VendorsMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/users" element={<SafeRoute><UsersMasterRoute /></SafeRoute>} />
                  <Route path="/masters/role-access" element={<SafeRoute><RoleAccessRoute /></SafeRoute>} />
                  <Route path="/masters/role-accesss" element={<SafeRoute><RoleAccessRoute /></SafeRoute>} />
                  <Route path="/masters/pm-config" element={<SafeRoute><ModuleGuard moduleId="masters.pm-config"><SuspenseLoader><PMConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/calibration-config" element={<SafeRoute><ModuleGuard moduleId="masters.calibration-config"><SuspenseLoader><CalibrationConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/amc-config" element={<SafeRoute><ModuleGuard moduleId="masters.amc-config"><SuspenseLoader><AMCConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/esg-config" element={<SafeRoute><ModuleGuard moduleId="masters.esg-config"><SuspenseLoader><ESGConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/gates" element={<SafeRoute><ModuleGuard moduleId="masters.gates"><SuspenseLoader><GateMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/gate-templates" element={<SafeRoute><Navigate to="/masters/gates" replace /></SafeRoute>} />
                  <Route path="/masters/safety-config" element={<SafeRoute><ModuleGuard moduleId="masters.safety-config"><SuspenseLoader><SafetyConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/email-reports" element={<SafeRoute><ModuleGuard moduleId="masters.email-reports"><SuspenseLoader><EmailReportsMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/log-templates" element={<SafeRoute><ModuleGuard moduleId="masters.log-templates"><SuspenseLoader><LogTemplateMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/mail-config" element={<SafeRoute><Navigate to="/root/mail-config" replace /></SafeRoute>} />
                  <Route path="/masters/sla-config" element={<SafeRoute><SLAConfigRoute /></SafeRoute>} />
                  <Route path="/masters/machine-instruments" element={<SafeRoute><ModuleGuard moduleId="masters.machine-instruments"><SuspenseLoader><MachineInstrumentsMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/shifts" element={<SafeRoute><ModuleGuard moduleId="masters.shifts"><SuspenseLoader><ShiftMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/maintenance-teams" element={<SafeRoute><ModuleGuard moduleId="masters.maintenance-teams"><SuspenseLoader><MaintenanceTeamsMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/work-order-config" element={<SafeRoute><ModuleGuard moduleId="masters.workorder-team-mapping"><SuspenseLoader><WorkOrderConfigMaster /></SuspenseLoader></ModuleGuard></SafeRoute>} />
                  <Route path="/masters/work-order-team-mapping" element={<SafeRoute><Navigate to="/masters/work-order-config" replace /></SafeRoute>} />
                </Route>
                <Route path="*" element={<SafeRoute><CatchAllRoute /></SafeRoute>} />
              </Routes>
            </AuthProvider>
          </AppErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
