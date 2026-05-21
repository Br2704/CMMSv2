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
  Building2,
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
  { title: "Inventory", href: "/inventory", moduleId: "inventory" },
  { title: "Reports", href: "/reports", moduleId: "reports" },
  { title: "Security", href: "/security-center", moduleId: "security-center" },
  { title: "Gate Entry", href: "/security-gate", moduleId: "security-gate" },
  { title: "Logs", href: "/logs", moduleId: "logs" },
  { title: "Masters", href: "/masters", moduleId: "masters" },
];

const rootMainNavItems = [
  { title: "Gov", href: "/root/dashboard", icon: LayoutDashboard, moduleId: "root.dashboard" },
  { title: "Org", href: "/root/organizations", icon: Building2, moduleId: "root.organizations" },
  { title: "Plant", href: "/root/plant", icon: Factory, moduleId: "root.plants" },
  { title: "Users", href: "/root/users", icon: Users, moduleId: "root.users" },
];

interface MobileBottomNavProps {
  isSidebarOpen?: boolean;
}

export function MobileBottomNav({ isSidebarOpen = false }: MobileBottomNavProps) {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { user } = useAuthStore();
  const isRootUser = isRootAdmin(user);
  const { hasModuleAccess, loading } = usePermissions();
  const isMobilePwaMode = useIsMobilePwaMode();

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  const filteredMain = useMemo(() => {
    if (isRootUser) return rootMainNavItems;
    if (loading) return [];
    return mainNavItems.filter((item) => hasModuleAccess(item.moduleId, "view"));
  }, [isRootUser, loading, hasModuleAccess]);

  const filteredMore = useMemo(() => {
    if (isRootUser) return [
      { title: "Role Access", href: "/root/role-access", moduleId: "root.role_access" },
      { title: "Report Format", href: "/root/report-format", moduleId: "root.report-format" },
      { title: "Mail Config", href: "/root/mail-config", moduleId: "root.mail-config" },
    ];
    if (loading) return [];
    return moreNavItems.filter((item) => hasModuleAccess(item.moduleId, "view"));
  }, [isRootUser, loading, hasModuleAccess]);

  const isMoreActive = filteredMore.some((item) => isActive(item.href));

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[60] border-t border-border/40 bg-card/80 backdrop-blur-xl  lg:hidden safe-area-inset",
        isSidebarOpen && "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {filteredMain.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "relative flex h-full flex-1 flex-col items-center justify-center gap-1 active:scale-[0.95] transition-transform",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
                {active && (
                  <div className="absolute inset-x-2 inset-y-2 -z-10 rounded-xl bg-primary/10" />
                )}
              <item.icon className={cn("h-5 w-5", active && "")} />
              <span className="text-[10px] font-semibold tracking-tight">{item.title}</span>
            </Link>
          );
        })}

        {filteredMore.length > 0 && (
          <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "relative flex h-full flex-1 flex-col items-center justify-center gap-1 active:scale-[0.95] transition-transform",
                  isMoreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-semibold tracking-tight">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh] overflow-y-auto rounded-t-[2.5rem] border-t-0 bg-card/95 p-6 backdrop-blur-2xl">
              <SheetHeader className="mb-6 text-left">
                <SheetTitle className="text-2xl font-bold">Menu</SheetTitle>
                <SheetDescription>Explore additional modules and settings</SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-4 pb-12">
                {filteredMore.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition-all active:scale-[0.95]",
                      isActive(item.href)
                        ? "border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border/50 bg-muted/30 hover:bg-muted"
                    )}
                  >
                    <span className="text-xs font-bold leading-tight">{item.title}</span>
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
