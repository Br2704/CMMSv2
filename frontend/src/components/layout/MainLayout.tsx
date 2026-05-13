import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { buildBrandingManifestUrl } from "@/api/branding";
import { useAuthStore } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";
import { useFeaturesStore } from "@/store/features.store";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { NotificationPermission } from "@/components/NotificationPermission";
import { cn } from "@/lib/utils";

const JK_FENNER_FAVICON = "/jkfenner/jkfenner-favicon.svg";
const TAMOPTIX_LOGO = "/tamoptix/tamoptix-logo.svg";

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("cmms:sidebar-collapsed") === "true";
  });
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const fetchBranding = useBrandingStore((state) => state.fetchBranding);
  const primeBranding = useBrandingStore((state) => state.primeFromSeed);
  const organizationName = useBrandingStore((state) => state.organizationName);
  const sidebarTitle = useBrandingStore((state) => state.sidebarTitle);
  const organizationId = useBrandingStore((state) => state.organizationId);
  const browserTitle = useBrandingStore((state) => state.browserTitle);
  const brandColor = useBrandingStore((state) => state.brandColor);
  const brandingVersion = useBrandingStore((state) => state.version);
  const startBrandingWatcher = useBrandingStore((state) => state.startWatcher);
  const stopBrandingWatcher = useBrandingStore((state) => state.stopWatcher);
  const resetBranding = useBrandingStore((state) => state.reset);
  const loadFeatures = useFeaturesStore((state) => state.loadFeatures);
  const resetFeatures = useFeaturesStore((state) => state.reset);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[MOUNT] MainLayout");
    }
    return () => {
      if (import.meta.env.DEV) {
        console.log("[UNMOUNT] MainLayout");
      }
    };
  }, []);

  const handleSidebarToggle = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed((prev) => !prev);
      return;
    }
    setSidebarOpen((prev) => !prev);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cmms:sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated || !user?.id) {
      stopBrandingWatcher();
      resetBranding();
      resetFeatures();
      return;
    }

    primeBranding({
      organizationId: user.organizationId ?? null,
      organizationName: user.organizationName ?? null,
      organizationLogoUrl: user.organizationLogoUrl ?? null,
      sidebarTitle: user.organizationName ?? null,
      browserTitle: user.organizationName ? `${user.organizationName} CMMS` : null,
    });
    void fetchBranding();
    void loadFeatures();
    startBrandingWatcher();

    return () => {
      stopBrandingWatcher();
    };
  }, [
    authLoading,
    isAuthenticated,
    user?.id,
    user?.organizationId,
    user?.organizationName,
    user?.organizationLogoUrl,
    fetchBranding,
    primeBranding,
    resetBranding,
    loadFeatures,
    resetFeatures,
    startBrandingWatcher,
    stopBrandingWatcher,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const resolvedTitle =
      browserTitle ||
      (organizationName
        ? `${organizationName} CMMS`
        : sidebarTitle
          ? `${sidebarTitle} CMMS`
          : "JK Fenner CMMS");
    document.title = resolvedTitle;

    const updateMetaContent = (selector: string, value: string) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      if (element) {
        element.setAttribute("content", value);
      }
    };

    updateMetaContent('meta[name="application-name"]', resolvedTitle);
    updateMetaContent('meta[name="apple-mobile-web-app-title"]', resolvedTitle);
    updateMetaContent('meta[name="title"]', resolvedTitle);
    updateMetaContent('meta[name="theme-color"]', brandColor || "#0f172a");
    updateMetaContent('meta[name="msapplication-TileColor"]', brandColor || "#0f172a");

    const resolvedFavicon = JK_FENNER_FAVICON;
    const ensureLink = (rel: string, id?: string) => {
      let element = id
        ? document.querySelector<HTMLLinkElement>(`#${id}`)
        : document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.rel = rel;
        if (id) element.id = id;
        document.head.appendChild(element);
      }
      element.href = resolvedFavicon;
      return element;
    };

    ensureLink("icon");
    ensureLink("shortcut icon");
    ensureLink("apple-touch-icon", "dynamic-apple-touch-icon").href = resolvedFavicon;
    ensureLink("manifest", "dynamic-manifest-link").href = buildBrandingManifestUrl(organizationId, brandingVersion);
  }, [brandColor, brandingVersion, browserTitle, organizationId, organizationName, sidebarTitle]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggleMobile={() => setSidebarOpen((prev) => !prev)}
      />
      
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col transition-[padding-left] duration-300",
          sidebarCollapsed ? "lg:pl-24" : "lg:pl-[280px]",
        )}
      >
        <Topbar onMenuClick={handleSidebarToggle} sidebarCollapsed={sidebarCollapsed} />
        
        <main tabIndex={-1} data-app-main className="min-w-0 flex-1 px-3 py-4 pb-24 sm:px-6 sm:py-5 sm:pb-24 lg:px-8 lg:py-6 lg:pb-8">
          <div className="mx-auto w-full min-w-0 max-w-[1720px]">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-border/70 bg-card/80 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1720px] items-center justify-center gap-2 text-center">
            <img src={TAMOPTIX_LOGO} alt="TamOptiX" className="h-5 w-auto object-contain" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground">TamOptiX Technologies</span>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav isSidebarOpen={sidebarOpen} />
      <PwaInstallPrompt />
      <NotificationPermission />
    </div>
  );
}
