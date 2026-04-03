import { buildBrandingLogoUrl, getBrandingMe, getBrandingVersion } from "@/api/branding";
import { ApiError, getStoredAccessToken } from "@/api/http";
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
    sidebarTitle: "TamOptiX",
    logoUrl: null,
    logoAssetUrl: buildBrandingLogoUrl(null, null, 192),
    faviconUrl: "/icons/icon-192x192.png",
    fallbackLogoUrl: "/icons/icon-512x512.png",
    fallbackFaviconUrl: "/icons/icon-192x192.png",
    browserTitle: "TamOptiX CMMS",
    brandColor: "#0f172a",
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

const initialSnapshot = getStoredAccessToken() ? readCachedSnapshot() : getDefaultSnapshot();

export const useBrandingStore = create<BrandingState>((set, get) => ({
  ...initialSnapshot,
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
      browserTitle: seed.browserTitle ?? (seed.organizationName ? `${seed.organizationName} CMMS` : current.browserTitle ?? fallback.browserTitle),
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
      const snapshot: BrandingSnapshot = {
        organizationId: payload.organizationId || null,
        organizationName: payload.organizationName || null,
        sidebarTitle: payload.sidebarTitle || payload.organizationName || null,
        logoUrl: payload.organizationLogoUrl || null,
        logoAssetUrl: payload.organizationLogoAssetUrl || buildBrandingLogoUrl(payload.organizationId || null, get().version, 192),
        faviconUrl: payload.organizationFaviconUrl || null,
        fallbackLogoUrl: payload.fallbackLogoUrl || null,
        fallbackFaviconUrl: payload.fallbackFaviconUrl || payload.fallbackLogoUrl || "/icons/icon-192x192.png",
        browserTitle: payload.browserTitle || null,
        brandColor: payload.brandColor || "#0f172a",
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
        applyDefaultFallback(set);
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
        applyDefaultFallback(set);
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
