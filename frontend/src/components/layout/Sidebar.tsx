import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobilePwaMode } from "@/hooks/use-mobile-pwa";
import { isRootAdmin, useAuthStore } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Factory,
  Gauge,
  LayoutDashboard,
  Leaf,
  MapPinned,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

interface NavItem {
  title: string;
  href?: string;
  icon: React.ElementType;
  moduleId: string;
  children?: { title: string; href: string; moduleId: string }[];
}

const navigation: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, moduleId: "dashboard" },
  { title: "Work Orders", href: "/work-orders", icon: ClipboardList, moduleId: "workorders" },
  { title: "Assets", href: "/assets", icon: Factory, moduleId: "assets" },
  { title: "AMC", href: "/amc", icon: ShieldCheck, moduleId: "amc" },
  { title: "PM/PD", href: "/preventive-maintenance", icon: Calendar, moduleId: "pmpd" },
  { title: "Calibration", href: "/calibration", icon: Gauge, moduleId: "calibration" },
  { title: "ESG", href: "/esg", icon: Leaf, moduleId: "esg" },
  { title: "Spare Maintenance", href: "/inventory", icon: Package, moduleId: "inventory" },
  { title: "Reports", href: "/reports", icon: BarChart3, moduleId: "reports" },
  { title: "Security Center", href: "/security-center", icon: ShieldAlert, moduleId: "security-center" },
  { title: "Gate Entry", href: "/security-gate", icon: DoorOpen, moduleId: "security-gate" },
  { title: "Visitor Experience", href: "/visitor-experience", icon: MapPinned, moduleId: "visitor-experience" },
  { title: "Logs", href: "/logs", icon: ScrollText, moduleId: "logs" },
  {
    title: "Masters",
    href: "/masters",
    icon: Settings,
    moduleId: "masters",
    children: [
      { title: "Plant", href: "/masters/plant", moduleId: "PLANTS" },
      { title: "Departments", href: "/masters/departments", moduleId: "masters.departments" },
      { title: "Modules", href: "/masters/modules", moduleId: "masters.modules" },
      { title: "Machines", href: "/masters/machines", moduleId: "masters.machines" },
      { title: "Cost Centers", href: "/masters/cost-centers", moduleId: "masters.cost-centers" },
      { title: "Vendors", href: "/masters/vendors", moduleId: "masters.vendors" },
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
    ],
  },
];

const rootNavigation: NavItem[] = [
  { title: "Governance Dashboard", href: "/root/dashboard", icon: LayoutDashboard, moduleId: "root.dashboard" },
  { title: "Organization Master", href: "/root/organizations", icon: Building2, moduleId: "root.organizations" },
  { title: "Plant Master", href: "/root/plant", icon: Factory, moduleId: "root.plants" },
  { title: "User Management", href: "/root/users", icon: Users, moduleId: "root.users" },
  { title: "Role & Access Master", href: "/root/role-access", icon: Settings, moduleId: "root.role_access" },
];

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleMobile: () => void;
}

export function Sidebar({ isOpen, isCollapsed, onToggleMobile }: SidebarProps) {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const { user } = useAuthStore();
  const isRootUser = isRootAdmin(user);
  const brandingOrganizationName = useBrandingStore((state) => state.organizationName);
  const brandingLogoUrl = useBrandingStore((state) => state.logoUrl);
  const brandingLogoAssetUrl = useBrandingStore((state) => state.logoAssetUrl);
  const { hasModuleAccess, loading } = usePermissions();
  const isMobilePwaMode = useIsMobilePwaMode();
  const organizationName = user?.organizationName || brandingOrganizationName || null;

  const toggleExpand = (title: string) => {
    setExpandedItems((prev) => (prev.includes(title) ? prev.filter((item) => item !== title) : [...prev, title]));
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  const showNavSkeleton = !isRootUser && loading;

  const filteredNavigation = useMemo(
    () =>
      isRootUser
        ? rootNavigation
        : showNavSkeleton
          ? []
          : (navigation
              .map((item) => {
                if (!item.children) {
                  return hasModuleAccess(item.moduleId, "view") ? item : null;
                }

                const filteredChildren = item.children.filter((child) => hasModuleAccess(child.moduleId, "view"));
                const parentAllowed = hasModuleAccess(item.moduleId, "view");

                if (isMobilePwaMode && item.href === "/masters") {
                  if (!parentAllowed) return null;
                  return { ...item, children: undefined };
                }

                if (!parentAllowed && filteredChildren.length === 0) return null;
                return { ...item, children: filteredChildren };
              })
              .filter(Boolean) as NavItem[]),
    [hasModuleAccess, isMobilePwaMode, isRootUser, showNavSkeleton],
  );

  useEffect(() => {
    const activeParents = filteredNavigation
      .filter((item) => item.children?.some((child) => isActive(child.href)))
      .map((item) => item.title);

    if (activeParents.length === 0) return;
    setExpandedItems((prev) => {
      const next = Array.from(new Set([...prev, ...activeParents]));
      return next.length === prev.length && next.every((item, index) => item === prev[index]) ? prev : next;
    });
  }, [filteredNavigation, location.pathname]);

  const resolvedLogo = user?.organizationLogoUrl || brandingLogoUrl || brandingLogoAssetUrl || "/jkfenner/jkfenner-logo.svg";
  const resolvedTitle = organizationName || "Organization";
  const homeHref = isRootUser ? "/root/dashboard" : "/";
  const collapseNavItems = isCollapsed && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const handleNavItemClick = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches && isOpen) {
      onToggleMobile();
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggleMobile}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          "fixed left-0 top-0 z-[60] flex h-screen flex-col border-r border-border bg-card shadow-lg transition-[width,transform] duration-300",
          "w-[min(88vw,320px)] sm:w-[300px] lg:w-[280px]",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          isCollapsed ? "lg:w-24" : "lg:w-[280px]",
        )}
      >
        <div className="relative flex h-16 items-center border-b border-border px-4">
          <Link
            to={homeHref}
            className={cn(
              "flex min-w-0 flex-1 items-center overflow-hidden",
              isCollapsed && "lg:justify-center",
            )}
            onClick={handleNavItemClick}
            title={resolvedTitle}
          >
            <div
              className={cn(
                "flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background/80",
                isCollapsed ? "w-11" : "w-28",
              )}
            >
              <img
                src={resolvedLogo}
                alt={organizationName ? `${organizationName} logo` : "Organization logo"}
                className="max-h-8 w-full object-contain"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/jkfenner/jkfenner-logo.svg";
                }}
              />
            </div>
          </Link>

          <button
            onClick={onToggleMobile}
            className="absolute right-4 rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>

        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-24 pt-3 sm:pb-28 lg:pb-6">
          {showNavSkeleton
            ? Array.from({ length: 8 }).map((_, index) => (
                <div key={`sidebar-skeleton-${index}`} className="animate-pulse rounded-lg border border-border/50 bg-muted/40 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-md bg-muted-foreground/20" />
                    <div className="h-3 w-24 rounded bg-muted-foreground/20" />
                  </div>
                </div>
              ))
            : filteredNavigation.map((item) => {
            const parentAccessible = isRootUser || hasModuleAccess(item.moduleId, "view");
            const parentTarget = parentAccessible ? item.href || "/masters" : item.children?.[0]?.href || item.href || "/masters";
            const itemIsActive = isActive(item.href) || item.children?.some((child) => isActive(child.href));
            const showSectionLabel = !isRootUser && item.href === "/masters";

            if (item.children?.length && !collapseNavItems) {
              return (
                <div key={item.title}>
                  {showSectionLabel ? (
                    <p className="mb-2 mt-3 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Masters
                    </p>
                  ) : null}
                  <div className="flex items-center">
                    <Link
                      to={parentTarget}
                      onClick={handleNavItemClick}
                      title={item.title}
                      className={cn(
                        "flex flex-1 items-center gap-3 rounded-l-lg px-3 py-3 text-sm font-medium transition-all duration-200",
                        itemIsActive
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                    <button
                      onClick={() => toggleExpand(item.title)}
                      className={cn(
                        "rounded-r-lg px-2 py-3 text-sm transition-all duration-200",
                        expandedItems.includes(item.title)
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                      )}
                      aria-label={`${expandedItems.includes(item.title) ? "Collapse" : "Expand"} ${item.title}`}
                      title={`${expandedItems.includes(item.title) ? "Collapse" : "Expand"} ${item.title}`}
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          expandedItems.includes(item.title) && "rotate-180",
                        )}
                      />
                    </button>
                  </div>

                  <AnimatePresence>
                    {expandedItems.includes(item.title) && item.children && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-4 mt-1 space-y-1 border-l border-border pl-4">
                          {item.children.map((child) => (
                            <Link
                              key={child.href}
                              to={child.href}
                              onClick={handleNavItemClick}
                              className={cn(
                                "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                                isActive(child.href)
                                  ? "bg-primary/10 font-medium text-primary"
                                  : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
                              )}
                            >
                              {child.title}
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            return (
              <div key={item.title}>
                {showSectionLabel ? (
                  <p className="mb-2 mt-3 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Masters
                  </p>
                ) : null}
                <Link
                  to={parentTarget}
                  onClick={handleNavItemClick}
                  title={item.title}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200",
                    itemIsActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                    isCollapsed && "lg:justify-center lg:px-2",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className={cn(isCollapsed && "lg:hidden")}>{item.title}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export function SidebarToggle({
  onClick,
  className,
  label = "Toggle sidebar",
  collapsed = false,
}: {
  onClick: () => void;
  className?: string;
  label?: string;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      title={label}
    >
      <Menu className="h-5 w-5 lg:hidden" />
      {collapsed ? <PanelLeftOpen className="hidden h-5 w-5 lg:block" /> : <PanelLeftClose className="hidden h-5 w-5 lg:block" />}
    </button>
  );
}
