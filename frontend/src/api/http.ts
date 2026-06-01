import {
  getStoredAccessToken,
  setStoredAccessToken,
  clearStoredAccessToken,
  getStoredCsrfToken,
  setStoredCsrfToken,
  clearStoredCsrfToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
  setSessionBootstrapHint,
  clearSessionBootstrapHint,
  hasSessionBootstrapHint,
  readCookie,
  clearCookie,
  getUnauthorizedCallback,
  SESSION_HINT_KEY,
  SESSION_COOKIE_NAME,
} from "./token";
import { cacheGet, cachePut, queueMutation } from "@/mobile/indexedDb";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEFAULT_DEV_API_BASE_URL = "http://localhost:3001/api";
const DEFAULT_PROD_API_BASE_URL = "/api";

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  try {
    const parsed = new URL(trimmed);
    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname;
      if (
        LOOPBACK_HOSTS.has(currentHost) &&
        LOOPBACK_HOSTS.has(parsed.hostname) &&
        parsed.hostname !== currentHost
      ) {
        parsed.hostname = currentHost;
      }
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

const configuredApiBase = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "");
const shouldUseDevProxy = import.meta.env.DEV && import.meta.env.VITE_USE_DEV_PROXY !== "false";
const API_BASE_URL = shouldUseDevProxy
  ? "/api"
  : (configuredApiBase || (import.meta.env.PROD ? DEFAULT_PROD_API_BASE_URL : DEFAULT_DEV_API_BASE_URL));
let unauthorizedHandled = false;
let bootstrapRefreshAttempted = false;
let isUnauthorizedMode = false;
let isFallbackMode = false;
const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === "test";

// Proactive refresh: refresh token every 14 minutes (before typical 15-min expiry)
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const PROACTIVE_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

// Rate limit retry tracking per-endpoint
const rateLimitRetryMap = new Map<string, number>();
const RATE_LIMIT_MAX_RETRIES = 1;
const RATE_LIMIT_BACKOFF_MS = 3000;

// In-flight request coalescing — deduplicate identical GET requests in flight
const inflightRequests = new Map<string, Promise<unknown>>();

// Global rate-limit cooldown: when any path gets 429, all paths back off
let globalRateLimitUntil = 0;

function isUnauthorizedActive(): boolean {
  return isUnauthorizedMode;
}

function getRateLimitRetryCount(key: string): number {
  return rateLimitRetryMap.get(key) || 0;
}

function incrementRateLimitRetry(key: string): void {
  rateLimitRetryMap.set(key, getRateLimitRetryCount(key) + 1);
}

function clearRateLimitRetry(key: string): void {
  rateLimitRetryMap.delete(key);
}

function resetAllRateLimits(): void {
  rateLimitRetryMap.clear();
  globalRateLimitUntil = 0;
}

function debugLog(...args: unknown[]) {
  if (isDev) {
    console.log("[HTTP]", ...args);
  }
}

if (isDev) {
  console.log("[HTTP] API_BASE_URL", API_BASE_URL);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export {
  getStoredAccessToken,
  setStoredAccessToken,
  clearStoredAccessToken,
  getStoredCsrfToken,
  setStoredCsrfToken,
  clearStoredCsrfToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
  setSessionBootstrapHint,
  clearSessionBootstrapHint,
} from "./token";

// Re-export unauthorized mode utilities for use by store initialization
export { resetUnauthorizedMode, isUnauthorizedActive };

// Export fallback mode controls — blocks mutation requests that can't be authorized
export function setFallbackMode(mode: boolean): void {
  isFallbackMode = mode;
}
export function isFallbackActive(): boolean {
  return isFallbackMode;
}

// Export proactive refresh so auth module can schedule it after login
export function scheduleProactiveRefresh(): void {
  if (proactiveRefreshTimer !== null) {
    clearTimeout(proactiveRefreshTimer);
  }
  proactiveRefreshTimer = setTimeout(async () => {
    debugLog("proactive-refresh:triggered");
    if (!getStoredAccessToken()) {
      debugLog("proactive-refresh:no-token-skip");
      return;
    }
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      debugLog("proactive-refresh:success-rescheduled");
    } else {
      debugLog("proactive-refresh:failed");
    }
  }, PROACTIVE_REFRESH_INTERVAL_MS);
}

// Export rate-limit status for use by other modules (e.g. client-side logging)
export function isCurrentlyRateLimited(): boolean {
  return isRateLimitedGlobally();
}

function hasSessionBootstrapEvidence(): boolean {
  // HttpOnly session cookie can't be read by JS — instead we use explicit hints
  // set during login (sessionStorage) or remember_me (localStorage).
  // A stale CSRF cookie is NOT evidence — the server may set it on every page load.
  if (hasSessionBootstrapHint()) {
    return true;
  }
  // localStorage "remember_me" persists across sessions
  try { if (localStorage.getItem("cmms:remember_me") === "true") return true; } catch { /* ignore */ }
  return isTest;
}

function getCsrfForRequest(): string | null {
  return getStoredCsrfToken() ?? readCookie("cmms_csrf_token");
}

async function handleUnauthorized(): Promise<void> {
  if (unauthorizedHandled) return;
  unauthorizedHandled = true;
  isUnauthorizedMode = true;
  isFallbackMode = false;
  cancelProactiveRefresh();
  debugLog("handleUnauthorized:start");
  responseBodyCache.clear();
  resetAllRateLimits();
  clearStoredAccessToken();
  clearStoredCsrfToken();
  clearStoredRefreshToken();
  clearSessionBootstrapHint();
  try { localStorage.removeItem("cmms:remember_me"); } catch { /* ignore */ }
  clearCookie(SESSION_COOKIE_NAME);
  clearCookie("cmms_csrf_token");

  try {
    getUnauthorizedCallback()?.();
  } catch {
    // Ignore store reset errors and proceed to login redirect.
  }
}

function resetUnauthorizedMode(): void {
  isUnauthorizedMode = false;
  unauthorizedHandled = false;
  bootstrapRefreshAttempted = false;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: "Invalid JSON response", raw: text.slice(0, 200) } as unknown as T;
  }
}

let refreshInFlight: Promise<boolean> | null = null;
const responseBodyCache = new Map<string, unknown>();



function cancelProactiveRefresh(): void {
  if (proactiveRefreshTimer !== null) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

function buildRequestCacheKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

function withCacheBuster(path: string): string {
  const queryIndex = path.indexOf("?");
  const basePath = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const searchParams = new URLSearchParams(queryIndex === -1 ? "" : path.slice(queryIndex + 1));
  searchParams.set("_cb", Date.now().toString());
  return `${basePath}?${searchParams.toString()}`;
}

// Coalesce identical in-flight GET requests — only one actual fetch per URL at a time
function coalescedFetch<T>(url: string, init: RequestInit, requestCacheKey: string): Promise<T> {
  const existing = inflightRequests.get(requestCacheKey);
  if (existing) {
    return (existing as Promise<{ url: string; status: number; statusText: string; headers: Headers; buffer: ArrayBuffer }>)
      .then((data) => new Response(data.buffer, {
        status: data.status,
        statusText: data.statusText,
        headers: data.headers,
      })) as unknown as Promise<T>;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, init);
      const buffer = await res.arrayBuffer();
      return {
        url: res.url,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        buffer,
      };
    } finally {
      inflightRequests.delete(requestCacheKey);
    }
  })();

  inflightRequests.set(requestCacheKey, promise);
  return promise.then((data) => new Response(data.buffer, {
    status: data.status,
    statusText: data.statusText,
    headers: data.headers,
  })) as unknown as Promise<T>;
}

// Add jitter to a delay to prevent thundering herd
function withJitter(delayMs: number): number {
  return delayMs + Math.random() * delayMs * 0.5;
}

function isRateLimitedGlobally(): boolean {
  return globalRateLimitUntil > Date.now();
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) {
    debugLog("refreshAccessToken:await-inflight");
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const refreshUrl = `${API_BASE_URL}/auth/refresh`;
      const storedRefreshToken = getStoredRefreshToken();
      const body = storedRefreshToken ? { refreshToken: storedRefreshToken } : {};
      debugLog("request", { url: refreshUrl, method: "POST", hasAuthHeader: false, credentials: "include", hasBodyToken: !!storedRefreshToken });

      for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const backoff = withJitter(Math.pow(2, attempt) * 1000);
          await new Promise((r) => setTimeout(r, backoff));
        }

        const response = await fetch(refreshUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(getCsrfForRequest() ? { "X-CSRF-Token": getCsrfForRequest() as string } : {}),
          },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(body),
        });
        debugLog("response", { url: refreshUrl, status: response.status });

        if (response.status === 429) {
          globalRateLimitUntil = Date.now() + 5000;
          debugLog("refreshAccessToken:rate-limited", { attempt });
          continue;
        }

        if (!response.ok) {
          debugLog("refreshAccessToken:failed", response.status);
          return false;
        }

        const payload = await parseResponse<{ accessToken?: string; data?: { accessToken?: string; csrfToken?: string; refreshToken?: string }; csrfToken?: string; refreshToken?: string }>(response);
        const refreshedToken = payload.accessToken ?? payload.data?.accessToken;
        const csrfToken = payload.csrfToken ?? payload.data?.csrfToken;
        const newRefreshToken = payload.refreshToken ?? (payload.data as any)?.refreshToken;
        if (!refreshedToken) {
          debugLog("refreshAccessToken:missing-token");
          return false;
        }

        setStoredAccessToken(refreshedToken);
        if (csrfToken) {
          setStoredCsrfToken(csrfToken);
        }
        if (newRefreshToken) {
          setStoredRefreshToken(newRefreshToken);
        }
        scheduleProactiveRefresh();
        debugLog("refreshAccessToken:success");
        return true;
      }

      // All retry attempts exhausted — set global cooldown and fail
      debugLog("refreshAccessToken:rate-limit-exhausted");
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function ensureAccessToken(): Promise<boolean> {
  if (getStoredAccessToken()) {
    scheduleProactiveRefresh();
    return true;
  }
  if (bootstrapRefreshAttempted) {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    debugLog("ensureAccessToken:skip-bootstrap-refresh");
    return false;
  }

  bootstrapRefreshAttempted = true;

  // Only attempt a refresh if there's evidence of a prior session.
  // Without evidence (no cookie, no hint), skip the refresh to avoid
  // a spurious 401 console error and unnecessary handleUnauthorized().
  if (!hasSessionBootstrapEvidence()) {
    debugLog("ensureAccessToken:no-evidence-skip-refresh");
    return false;
  }

  debugLog("ensureAccessToken:has-evidence-attempting-refresh");
  const refreshed = await refreshAccessToken();
  if (refreshed) {
    bootstrapRefreshAttempted = false;
    try {
      const rememberMe = localStorage.getItem("cmms:remember_me") === "true";
      setSessionBootstrapHint(rememberMe);
    } catch { /* ignore */ }
  } else if (isRateLimitedGlobally()) {
    // Rate-limited — keep session evidence, retry will happen on next action
    debugLog("ensureAccessToken:rate-limited-preserving-session");
    bootstrapRefreshAttempted = false;
    setSessionBootstrapHint(true);
  } else {
    // Session evidence existed but refresh failed — clean up stale session
    await handleUnauthorized();
  }
  return refreshed;
}

function shouldAttemptRefresh(path: string, status: number, retry: boolean): boolean {
  if (status !== 401 || !retry) return false;
  if (path === "/auth/login" || path === "/auth/logout" || path === "/auth/refresh") return false;
  // Don't attempt refresh if there's no stored token and no session evidence.
  // Prevents unnecessary /auth/refresh calls and retry loops for unauthenticated users.
  if (!getStoredAccessToken() && !hasSessionBootstrapEvidence()) return false;
  return true;
}

function getPayloadMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return "";
  }

  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : "";
}

function shouldRetryWithSafeLimit(path: string, status: number, payload: unknown, limitRetry: boolean): boolean {
  if (!limitRetry || status !== 400) return false;
  if (!path.includes("limit=")) return false;
  const message = getPayloadMessage(payload);
  if (message !== "Validation failed") return false;
  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) return false;
  const searchParams = new URLSearchParams(path.slice(queryIndex + 1));
  const limitValue = Number(searchParams.get("limit"));
  return Number.isFinite(limitValue) && limitValue > 100;
}

function withSafeLimit(path: string): string {
  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) return path;
  const basePath = path.slice(0, queryIndex);
  const searchParams = new URLSearchParams(path.slice(queryIndex + 1));
  searchParams.set("limit", "100");
  return `${basePath}?${searchParams.toString()}`;
}

function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem("cmms:device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("cmms:device_id", deviceId);
    }
    return deviceId;
  } catch {
    return "unknown";
  }
}

export async function httpRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  limitRetry = true,
  cacheRetry = true,
  offlineCapable = true,
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();

  // Early rejection if already in unauthorized mode — prevents cascade of failed requests
  // Auth endpoints are exempt to allow login/refresh even during unauthorized mode
  if (isUnauthorizedActive() && !path.startsWith("/auth/")) {
    throw new ApiError(401, "Session expired. Please sign in again.", null);
  }

  // In fallback mode, reject mutation requests immediately — no access token exists
  // to authorize them. Prevents 403 console errors and TanStack Query retry loops.
  if (isFallbackMode && method !== "GET" && method !== "HEAD" && !path.startsWith("/auth/")) {
    throw new ApiError(403, "Mutations are disabled in fallback mode. READ-ONLY.", null);
  }

  // If globally rate-limited, reject early with a short backoff hint
  if (isRateLimitedGlobally() && method === "GET") {
    throw new ApiError(429, "Server is busy. Please try again.", null);
  }

  const url = `${API_BASE_URL}${path}`;
  const requestCacheKey = buildRequestCacheKey(method, url);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  headers.set("X-Device-Id", getDeviceId());
  if ((path === "/auth/refresh" || path === "/auth/logout" || path === "/auth/login") && getCsrfForRequest()) {
    headers.set("X-CSRF-Token", getCsrfForRequest() as string);
  }

  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  if (isOffline && method === "GET" && offlineCapable) {
    debugLog("offline-mode:get-from-cache", { path });
    const cached = await cacheGet<T>(requestCacheKey);
    if (cached) return cached.value;
  }

  debugLog("request", {
    url,
    method,
    hasAuthHeader: Boolean(accessToken),
    credentials: "include",
    isOffline,
  });

  if (isOffline && method !== "GET" && offlineCapable) {
    // Queue mutation for later
    debugLog("offline-mode:queue-mutation", { path });
    await queueMutation({
      url: path,
      method: method as any,
      body: init.body ? JSON.parse(init.body as string) : null,
    });
    return { success: true, message: "Queued for offline sync", data: {} } as T;
  }

  // Coalesce identical GET requests; always use coalescing for GET
  let response: Response;
  try {
    response = method === "GET"
      ? await coalescedFetch<Response>(url, { ...init, headers, credentials: "include", cache: "no-store" }, requestCacheKey)
      : await fetch(url, {
          ...init,
          headers,
          credentials: "include",
          cache: "no-store",
        });
  } catch (fetchError) {
    // Network error: backend unreachable, connection dropped, DNS failure, etc.
    const message = fetchError instanceof TypeError
      ? "Unable to reach the server. Please check your connection or try again later."
      : `Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;

    if (path !== "/webapp-logs") {
      void import("@/api/logs").then(({ queueWebappLog }) => {
        queueWebappLog({
          level: "ERROR",
          action: "api.network_error",
          message: `${method} ${path} failed: ${message}`,
          path,
        });
      }).catch(() => {});
    }

    // Try offline cache fallback for GET requests
    if (method === "GET" && offlineCapable) {
      const cached = await cacheGet<T>(requestCacheKey);
      if (cached) return cached.value;
    }

    throw new ApiError(0, message, null);
  }
  debugLog("response", { url, status: response.status });

  if (shouldAttemptRefresh(path, response.status, retry)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return httpRequest<T>(path, init, false, limitRetry, cacheRetry);
    }
    await handleUnauthorized();
  }

  if (response.status === 304 && method === "GET") {
    const cached = responseBodyCache.get(requestCacheKey);
    if (cached !== undefined) {
      debugLog("response-304-cache-hit", { url, method });
      return cached as T;
    }
    debugLog("response-304-cache-miss", { url, method });
    if (cacheRetry) {
      return httpRequest<T>(withCacheBuster(path), init, retry, limitRetry, false);
    }
  }

  if (!response.ok) {
    const payload = await parseResponse<unknown>(response).catch(() => null);
    debugLog("error", { url, status: response.status, payload });

    // Don't log to webapp-logs during rate-limit cooldown to avoid compounding the flood
    if (path !== "/webapp-logs" && response.status >= 500 && !isRateLimitedGlobally()) {
      void import("@/api/logs").then(({ queueWebappLog }) => {
        queueWebappLog({
          level: "ERROR",
          action: "api.error",
          message: `${init.method || "GET"} ${path} failed with status ${response.status}`,
          path,
          statusCode: response.status,
          metadata: {
            payload,
          },
        });
      }).catch(() => {
        // Ignore dynamic import failures while reporting API errors.
      });
    }

    if (shouldRetryWithSafeLimit(path, response.status, payload, limitRetry)) {
      return httpRequest<T>(withSafeLimit(path), init, retry, false, cacheRetry);
    }

    // Handle 429 Too Many Requests with exponential backoff + jitter + global cooldown
    if (response.status === 429) {
      // Set global cooldown so other requests reject early instead of compounding the flood
      globalRateLimitUntil = Date.now() + 5000;
      const retryCount = getRateLimitRetryCount(requestCacheKey);
      if (retryCount < RATE_LIMIT_MAX_RETRIES) {
        incrementRateLimitRetry(requestCacheKey);
        const baseBackoff = Math.pow(2, retryCount) * RATE_LIMIT_BACKOFF_MS;
        const backoff = withJitter(baseBackoff);
        debugLog("rate-limit-retry", { path, retryCount, backoff });
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return httpRequest<T>(withCacheBuster(path), init, retry, limitRetry, false);
      }
      clearRateLimitRetry(requestCacheKey);
    }

    // Handle 401 Unauthorized: clear session and redirect
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/logout") {
      await handleUnauthorized();
      // Throw error so caller can show a safe error UI
      throw new ApiError(response.status, "Session expired. Please sign in again.", payload);
    }

    // Handle 403 Forbidden: throw a descriptive error
    if (response.status === 403) {
      try {
        const { usePermissionsStore } = await import("@/store/permissions.store");
        void usePermissionsStore.getState().fetchPermissionsMe(true);
      } catch { /* ignore */ }
      throw new ApiError(response.status, "Access denied. You do not have permission to view this resource.", payload);
    }

    const message = getPayloadMessage(payload) || (response.status === 403
      ? "No permission"
      : `Request failed with status ${response.status}`);
    
    // If request failed but we are offlineCapable, try cache for GET
    if (method === "GET" && offlineCapable && (response.status >= 500 || response.status === 0)) {
      const cached = await cacheGet<T>(requestCacheKey);
      if (cached) return cached.value;
    }

    throw new ApiError(response.status, message, payload);
  }

  // Clear rate limit retry on success
  clearRateLimitRetry(requestCacheKey);

  const parsed = await parseResponse<T>(response);

  if (method === "GET") {
    responseBodyCache.set(requestCacheKey, parsed);
    if (offlineCapable) {
      try { await cachePut(requestCacheKey, parsed); } catch { /* indexedDB unavailable */ }
    }
  } else {
    responseBodyCache.clear();
  }

  return parsed;
}

export async function httpDownload(
  path: string,
  init: RequestInit = {}
): Promise<Blob> {
  if (isUnauthorizedActive()) {
    throw new ApiError(401, "Session expired. Please sign in again.", null);
  }

  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  headers.set("X-Device-Id", getDeviceId());

  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });

    if (response.status === 401) {
      await handleUnauthorized();
      throw new ApiError(401, "Session expired. Please sign in again.", null);
    }

    if (!response.ok) {
      const payload = await parseResponse<unknown>(response).catch(() => null);
      const message = getPayloadMessage(payload) || `Request failed with status ${response.status}`;
      throw new ApiError(response.status, message, payload);
    }

    return await response.blob();
  } catch (fetchError) {
    if (fetchError instanceof ApiError) {
      throw fetchError;
    }
    const message = fetchError instanceof TypeError
      ? "Unable to reach the server. Please check your connection or try again later."
      : `Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
    throw new ApiError(0, message, null);
  }
}

