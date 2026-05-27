import { buildBrandingLogoUrl, getBrandingMe, getBrandingVersion } from "@/api/branding";
import { ApiError } from "@/api/http";
import { getStoredAccessToken } from "@/api/token";
import { APP_BROWSER_TITLE, APP_DEFAULT_THEME_COLOR, APP_FAVICON_SVG, APP_LOGO_SVG, APP_NAME, APP_SIDEBAR_TITLE } from "@/config/branding";
import { create } from "zustand";

const BRANDING_WATCH_INTERVAL_MS = 30_000;
const BRANDING_CACHE_KEY = "cmms_branding_cache_v4";

let watcherIntervalId: number | null = null;
let watcherSubscribers = 0;

interface BrandingSnapshot {
  organizationId: string | null;
  organizationName: string | null;
  sidebarTitle: string | null;
  logoUrl: string | null;
  logoAssetUrl: string | null;
  faviconUrl: string | null;
  fallbackLogoUrl: string | null;
  fallbackFaviconUrl: string | null;
  browserTitle: string | null;
  brandColor: string | null;
  updatedAt: string | null;
}

interface BrandingState extends BrandingSnapshot {
  version: number | null;
  loading: boolean;
  primeFromSeed: (seed: {
    organizationId?: string | null;
    organizationName?: string | null;
    organizationLogoUrl?: string | null;
    sidebarTitle?: string | null;
    browserTitle?: string | null;
  } | null) => void;
  fetchBranding: (force?: boolean) => Promise<void>;
  checkBrandingVersion: () => Promise<void>;
  startWatcher: () => void;
  stopWatcher: () => void;
  reset: () => void;
}

function getDefaultSnapshot(): BrandingSnapshot {
  return {
    organizationId: null,
    organizationName: null,
    sidebarTitle: APP_SIDEBAR_TITLE,
    logoUrl: null,
    logoAssetUrl: APP_LOGO_SVG,
    faviconUrl: APP_FAVICON_SVG,
    fallbackLogoUrl: APP_LOGO_SVG,
    fallbackFaviconUrl: APP_FAVICON_SVG,
    browserTitle: APP_BROWSER_TITLE,
    brandColor: APP_DEFAULT_THEME_COLOR,
    updatedAt: null,
  };
}

function readCachedSnapshot(): BrandingSnapshot {
  if (typeof window === "undefined") return getDefaultSnapshot();
  try {
    const raw = window.sessionStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return getDefaultSnapshot();
    return {
      ...getDefaultSnapshot(),
      ...(JSON.parse(raw) as Partial<BrandingSnapshot>),
    };
  } catch {
    return getDefaultSnapshot();
  }
}

function persistSnapshot(snapshot: BrandingSnapshot) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(snapshot));
}

function applyDefaultFallback(set: (partial: Partial<BrandingState>) => void) {
  const fallback = getDefaultSnapshot();
  persistSnapshot(fallback);
  set({ ...fallback, loading: false });
}

function applyForbiddenFallback(get: () => BrandingState, set: (partial: Partial<BrandingState>) => void) {
  const fallback = getDefaultSnapshot();
  const current = get();
  const snapshot: BrandingSnapshot = {
    organizationId: current.organizationId ?? fallback.organizationId,
    organizationName: current.organizationName ?? fallback.organizationName,
    sidebarTitle: current.sidebarTitle ?? current.organizationName ?? fallback.sidebarTitle,
    logoUrl: current.logoUrl ?? fallback.logoUrl,
    logoAssetUrl: current.logoAssetUrl ?? buildBrandingLogoUrl(current.organizationId ?? null, current.version, 192),
    faviconUrl: current.faviconUrl ?? fallback.faviconUrl,
    fallbackLogoUrl: current.fallbackLogoUrl ?? fallback.fallbackLogoUrl,
    fallbackFaviconUrl: current.fallbackFaviconUrl ?? fallback.fallbackFaviconUrl,
    browserTitle: current.browserTitle ?? (current.organizationName ? current.organizationName : fallback.browserTitle),
    brandColor: current.brandColor ?? fallback.brandColor,
    updatedAt: current.updatedAt ?? fallback.updatedAt,
  };

  persistSnapshot(snapshot);
  set({ ...snapshot, loading: false });
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  ...(getStoredAccessToken() ? readCachedSnapshot() : getDefaultSnapshot()),
  version: null,
  loading: false,

  primeFromSeed: (seed) => {
    if (!seed?.organizationId) return;

    const fallback = getDefaultSnapshot();
    const current = get();
    const snapshot: BrandingSnapshot = {
      organizationId: seed.organizationId,
      organizationName: seed.organizationName ?? current.organizationName ?? null,
      sidebarTitle: seed.sidebarTitle ?? seed.organizationName ?? current.sidebarTitle ?? fallback.sidebarTitle,
      logoUrl: seed.organizationLogoUrl ?? current.logoUrl ?? null,
      logoAssetUrl: buildBrandingLogoUrl(seed.organizationId, current.version, 192),
      faviconUrl: current.faviconUrl ?? fallback.faviconUrl,
      fallbackLogoUrl: current.fallbackLogoUrl ?? fallback.fallbackLogoUrl,
      fallbackFaviconUrl: current.fallbackFaviconUrl ?? fallback.fallbackFaviconUrl,
      browserTitle: seed.browserTitle ?? (seed.organizationName ? seed.organizationName : current.browserTitle ?? fallback.browserTitle),
      brandColor: current.brandColor ?? fallback.brandColor,
      updatedAt: current.updatedAt ?? fallback.updatedAt,
    };
    persistSnapshot(snapshot);
    set({ ...snapshot, loading: false });
  },

  fetchBranding: async () => {
    if (!getStoredAccessToken()) {
      applyDefaultFallback(set);
      return;
    }

    set({ loading: true });
    try {
      const response = await getBrandingMe();
      const payload = response.data;
      const current = get();
      const preserveSeededOrganization = !payload.organizationId && Boolean(current.organizationId);
      const snapshot: BrandingSnapshot = {
        organizationId: preserveSeededOrganization ? current.organizationId : (payload.organizationId || null),
        organizationName: preserveSeededOrganization ? current.organizationName : (payload.organizationName || null),
        sidebarTitle: preserveSeededOrganization
          ? (current.sidebarTitle || current.organizationName)
          : (payload.sidebarTitle || payload.organizationName || null),
        logoUrl: preserveSeededOrganization ? current.logoUrl : (payload.organizationLogoUrl || null),
        logoAssetUrl: preserveSeededOrganization
          ? (current.logoAssetUrl || buildBrandingLogoUrl(current.organizationId || null, current.version, 192))
          : (payload.organizationLogoAssetUrl || buildBrandingLogoUrl(payload.organizationId || null, current.version, 192)),
        faviconUrl: preserveSeededOrganization ? current.faviconUrl : (payload.organizationFaviconUrl || null),
        fallbackLogoUrl: payload.fallbackLogoUrl || null,
        fallbackFaviconUrl: payload.fallbackFaviconUrl || payload.fallbackLogoUrl || "/tamoptix/tamoptix-favicon.svg",
        browserTitle: preserveSeededOrganization
          ? (current.browserTitle || (current.organizationName ? current.organizationName : null))
          : (payload.browserTitle || null),
        brandColor: payload.brandColor || APP_DEFAULT_THEME_COLOR,
        updatedAt: payload.updatedAt || null,
      };
      persistSnapshot(snapshot);
      set({ ...snapshot, loading: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        get().stopWatcher();
        applyDefaultFallback(set);
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        get().stopWatcher();
        applyForbiddenFallback(get, set);
        return;
      }
      set({ loading: false });
    }
  },

  checkBrandingVersion: async () => {
    if (!getStoredAccessToken()) {
      get().stopWatcher();
      applyDefaultFallback(set);
      return;
    }
    try {
      const response = await getBrandingVersion();
      const nextVersion = Number(response.data.version || 0);
      if (!Number.isFinite(nextVersion) || nextVersion <= 0) return;
      if (get().version === nextVersion) return;
      set({ version: nextVersion, updatedAt: response.data.updatedAt || get().updatedAt });
      await get().fetchBranding(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        get().stopWatcher();
        applyDefaultFallback(set);
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        get().stopWatcher();
        applyForbiddenFallback(get, set);
      }
    }
  },

  startWatcher: () => {
    if (typeof window === "undefined" || !getStoredAccessToken()) return;
    watcherSubscribers += 1;
    if (watcherSubscribers > 1) return;
    void get().checkBrandingVersion();
    watcherIntervalId = window.setInterval(() => {
      void get().checkBrandingVersion();
    }, BRANDING_WATCH_INTERVAL_MS);
  },

  stopWatcher: () => {
    if (typeof window === "undefined") return;
    watcherSubscribers = Math.max(0, watcherSubscribers - 1);
    if (watcherSubscribers > 0) return;
    if (watcherIntervalId !== null) {
      window.clearInterval(watcherIntervalId);
      watcherIntervalId = null;
    }
  },

  reset: () => {
    if (typeof window !== "undefined" && watcherIntervalId !== null) {
      window.clearInterval(watcherIntervalId);
      watcherIntervalId = null;
    }
    watcherSubscribers = 0;
    const fallback = getDefaultSnapshot();
    persistSnapshot(fallback);
    set({ ...fallback, version: null, loading: false });
  },
}));
