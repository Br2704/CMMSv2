import { useEffect, useState, Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { OfflineIndicator } from "./OfflineIndicator";
import CommandPalette from "@/components/CommandPalette";
import Skeleton from "@/components/Skeleton";
import { buildBrandingManifestUrl } from "@/api/branding";
import { useAuthStore, trackActivity } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";
import { useFeaturesStore } from "@/store/features.store";
import { UnifiedOnboardingBanner } from "@/components/UnifiedOnboardingBanner";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { APP_LOGO_SVG, APP_NAME, APP_TAGLINE, APP_DEFAULT_THEME_COLOR, APP_BROWSER_TITLE, APP_COMPANY } from "@/config/branding";

const TAMOPTIX_FAVICON = "/tamoptix/tamoptix-favicon.svg";
const TAMOPTIX_LOGO = APP_LOGO_SVG;

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("cmms:sidebar-collapsed") === "true";
  });
  const { user, isAuthenticated, isLoading: authLoading, isFallbackMode } = useAuthStore();
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
    trackActivity();
    const interval = setInterval(trackActivity, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") trackActivity(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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

    const baseTitle = organizationName 
      ? `OptiX Maintenance Pro - ${organizationName}` 
      : "OptiX Maintenance Pro";
    document.title = baseTitle;

    const updateMetaContent = (selector: string, value: string) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      if (element) {
        element.setAttribute("content", value);
      }
    };

    updateMetaContent('meta[name="application-name"]', baseTitle);
    updateMetaContent('meta[name="apple-mobile-web-app-title"]', baseTitle);
    updateMetaContent('meta[name="title"]', baseTitle);
    updateMetaContent('meta[name="theme-color"]', brandColor || APP_DEFAULT_THEME_COLOR);
    updateMetaContent('meta[name="msapplication-TileColor"]', brandColor || APP_DEFAULT_THEME_COLOR);

    const resolvedFavicon = TAMOPTIX_FAVICON;
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
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = buildBrandingManifestUrl(organizationId, brandingVersion);
    }
  }, [brandColor, brandingVersion, browserTitle, organizationId, organizationName, sidebarTitle]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <OfflineIndicator />
      {isFallbackMode && (
        <div className="fixed left-0 right-0 top-14 z-[100] flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-lg sm:top-16">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Fallback Mode — Logged in as root admin. Data changes are disabled.</span>
        </div>
      )}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggleMobile={() => setSidebarOpen((prev) => !prev)}
      />
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col layout-transition",
          sidebarCollapsed ? "lg:pl-24" : "lg:pl-[280px]",
        )}
      >
          <Topbar onMenuClick={handleSidebarToggle} sidebarCollapsed={sidebarCollapsed} />
          
          <main id="main-content" role="main" className={cn(
            "min-w-0 flex-1 overflow-x-clip px-3 py-4 pb-6 sm:px-6 sm:py-5 sm:pb-8 lg:px-8 lg:py-6 lg:pb-8",
            isFallbackMode && "pt-14 sm:pt-16",
          )}>
            <div className="mx-auto w-full min-w-0 max-w-[1680px]">
              <Suspense fallback={<Skeleton />}> 
                <Outlet />
              </Suspense>
            </div>
          </main>

          {/* Footer on all pages */}
          <footer className="mt-auto border-t border-border/50 bg-background/50 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-xs font-medium text-muted-foreground">
              &copy; 2026 TamOptiX Technologies. OptiX Maintenance Pro.
            </p>
          </footer>
        </div>

      <CommandPalette />
      {/* Unified Setup Experience */}
      <UnifiedOnboardingBanner />
    </div>
  );
}
