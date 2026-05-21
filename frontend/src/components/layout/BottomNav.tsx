import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobilePwaMode } from "@/hooks/use-mobile-pwa";
import { isRootAdmin, useAuthStore } from "@/store/auth.store";
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Calendar,
  MoreHorizontal,
  Leaf,
  Building2,
  Settings,
  Users,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMemo, useState } from "react";

const mainNavItems = [
  { title: "Home", href: "/", icon: LayoutDashboard, moduleId: "dashboard" },
  { title: "Work Orders", href: "/work-orders", icon: ClipboardList, moduleId: "workorders" },
  { title: "Assets", href: "/assets", icon: Factory, moduleId: "assets" },
  { title: "PM/PD", href: "/preventive-maintenance", icon: Calendar, moduleId: "pmpd" },
];

const moreNavItems = [
  { title: "AMC", href: "/amc", moduleId: "amc" },
  { title: "Calibration", href: "/calibration", moduleId: "calibration" },
  { title: "ESG", href: "/esg", moduleId: "esg" },
  { title: "Spare Maintenance", href: "/inventory", moduleId: "inventory" },
  { title: "Reports", href: "/reports", moduleId: "reports" },
  { title: "Security Center", href: "/security-center", moduleId: "security-center" },
  { title: "Gate Entry", href: "/security-gate", moduleId: "security-gate" },
  { title: "Visitor Experience", href: "/visitor-experience", moduleId: "visitor-experience" },
  { title: "Logs", href: "/logs", moduleId: "logs" },
  { title: "Masters", href: "/masters", moduleId: "masters" },
  { title: "Plant Master", href: "/masters/plant", moduleId: "PLANTS" },
  { title: "Users", href: "/masters/users", moduleId: "masters.users" },
  { title: "PM/PD Config", href: "/masters/pm-config", moduleId: "masters.pm-config" },
  { title: "Calibration Config", href: "/masters/calibration-config", moduleId: "masters.calibration-config" },
  { title: "AMC Master", href: "/masters/amc-config", moduleId: "masters.amc-config" },
  { title: "ESG Master", href: "/masters/esg-config", moduleId: "masters.esg-config" },
  { title: "Gate Master", href: "/masters/gates", moduleId: "masters.gates" },
  { title: "Safety Config", href: "/masters/safety-config", moduleId: "masters.safety-config" },
  { title: "Email Reports", href: "/masters/email-reports", moduleId: "masters.email-reports" },
  { title: "Log Templates", href: "/masters/log-templates", moduleId: "masters.log-templates" },
  { title: "Machine Instruments", href: "/masters/machine-instruments", moduleId: "masters.machine-instruments" },
  { title: "Shifts", href: "/masters/shifts", moduleId: "masters.shifts" },
  { title: "Maintenance Teams", href: "/masters/maintenance-teams", moduleId: "masters.maintenance-teams" },
  { title: "Work Order Config", href: "/masters/work-order-config", moduleId: "masters.workorder-team-mapping" },
];

const rootMainNavItems = [
  { title: "Gov", href: "/root/dashboard", icon: LayoutDashboard, moduleId: "root.dashboard" },
  { title: "Org", href: "/root/organizations", icon: Building2, moduleId: "root.organizations" },
  { title: "Plant", href: "/root/plant", icon: Factory, moduleId: "root.plants" },
  { title: "Users", href: "/root/users", icon: Users, moduleId: "root.users" },
];

const rootMoreNavItems: Array<{ title: string; href: string; moduleId: string }> = [
  { title: "Role Access", href: "/root/role-access", moduleId: "root.role_access" },
  { title: "Report Format", href: "/root/report-format", moduleId: "root.report-format" },
  { title: "Mail Config", href: "/root/mail-config", moduleId: "root.mail-config" },
];

interface BottomNavProps {
  isSidebarOpen?: boolean;
}

export function BottomNav({ isSidebarOpen = false }: BottomNavProps) {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { user } = useAuthStore();
  const isRootUser = isRootAdmin(user);
  const { hasModuleAccess, loading } = usePermissions();
  const isMobilePwaMode = useIsMobilePwaMode();
  const showNavSkeleton = !isRootUser && loading;

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  const filteredMain = isRootUser
    ? rootMainNavItems
    : showNavSkeleton
      ? []
      : mainNavItems.filter((item) => hasModuleAccess(item.moduleId, "view"));
  const filteredMoreBase = isRootUser
    ? rootMoreNavItems
    : showNavSkeleton
      ? []
      : moreNavItems.filter((item) => hasModuleAccess(item.moduleId, "view"));

  const filteredMore = useMemo(
    () =>
      isMobilePwaMode
        ? filteredMoreBase.filter((item) => item.href === "/masters" || !item.href.startsWith("/masters/"))
        : filteredMoreBase,
    [filteredMoreBase, isMobilePwaMode],
  );

  const operationsMoreItems = useMemo(
    () => filteredMore.filter((item) => !item.href.startsWith("/masters")),
    [filteredMore],
  );

  const masterMoreItems = useMemo(
    () => filteredMore.filter((item) => item.href.startsWith("/masters")),
    [filteredMore],
  );

  const isMoreActive = filteredMore.some((item) => isActive(item.href));

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card  lg:hidden safe-area-inset",
        isSidebarOpen && "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="flex items-center justify-around h-16">
        {showNavSkeleton ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={`bottom-nav-skeleton-${index}`} className="flex h-full flex-1 animate-pulse flex-col items-center justify-center gap-1 px-2">
              <div className="h-5 w-5 rounded-full bg-muted-foreground/20" />
              <div className="h-2.5 w-10 rounded bg-muted-foreground/20" />
            </div>
          ))
        ) : (
          <>
        {filteredMain.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs font-medium transition-colors",
              isActive(item.href)
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5", isActive(item.href) && "fill-primary/20")} />
            <span>{item.title}</span>
          </Link>
        ))}

        {filteredMore.length > 0 && (
          <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs font-medium transition-colors",
                  isMoreActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[72vh] overflow-y-auto rounded-t-xl px-4 pb-6 pt-2">
              <SheetHeader className="pb-4">
                <SheetTitle>More Options</SheetTitle>
                <SheetDescription>Quick navigation to additional modules.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 pb-4">
                {operationsMoreItems.length > 0 ? (
                  <section className="space-y-2">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Operations</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {operationsMoreItems.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => setIsMoreOpen(false)}
                          className={cn(
                            "flex min-h-[68px] items-center justify-center rounded-lg border px-3 py-3 text-center ",
                            isActive(item.href)
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-transparent bg-muted/50 hover:bg-muted",
                          )}
                        >
                          <span className="text-sm font-medium leading-tight">{item.title}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {masterMoreItems.length > 0 ? (
                  <section className="space-y-2">
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Masters</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {masterMoreItems.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => setIsMoreOpen(false)}
                          className={cn(
                            "flex min-h-[68px] items-center justify-center rounded-lg border px-3 py-3 text-center ",
                            isActive(item.href)
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-transparent bg-muted/50 hover:bg-muted",
                          )}
                        >
                          <span className="text-sm font-medium leading-tight">{item.title}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        )}
          </>
        )}
      </div>
    </nav>
  );
}
