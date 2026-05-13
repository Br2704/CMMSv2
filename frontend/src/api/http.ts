const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEFAULT_DEV_API_BASE_URL = "http://localhost:3001/api";
const DEFAULT_PROD_API_BASE_URL = "/api";
const SESSION_HINT_KEY = "cmms_has_session";
const SESSION_COOKIE_NAME = "cmms_session";

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
let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;
let refreshTokenMemory: string | null = null;
let bootstrapRefreshAttempted = false;
const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === "test";

function debugLog(...args: unknown[]) {
  if (isDev) {
    console.log("[HTTP]", ...args);
  }
}

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
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

export function getStoredAccessToken(): string | null {
  return accessTokenMemory;
}

export function setStoredAccessToken(token: string): void {
  accessTokenMemory = token;
  if (token) {
    bootstrapRefreshAttempted = false;
  }
}

export function clearStoredAccessToken(): void {
  accessTokenMemory = null;
  bootstrapRefreshAttempted = false;
}

export function getStoredCsrfToken(): string | null {
  return csrfTokenMemory;
}

export function setStoredCsrfToken(token: string): void {
  csrfTokenMemory = token;
}

export function clearStoredCsrfToken(): void {
  csrfTokenMemory = null;
}

export function getStoredRefreshToken(): string | null {
  return refreshTokenMemory;
}

export function setStoredRefreshToken(token: string): void {
  refreshTokenMemory = token;
}

export function clearStoredRefreshToken(): void {
  refreshTokenMemory = null;
}

export function setSessionBootstrapHint(): void {
  getSessionStorage()?.setItem(SESSION_HINT_KEY, "true");
}

export function clearSessionBootstrapHint(): void {
  getSessionStorage()?.removeItem(SESSION_HINT_KEY);
}

function hasSessionBootstrapHint(): boolean {
  return getSessionStorage()?.getItem(SESSION_HINT_KEY) === "true";
}

function hasSessionBootstrapEvidence(): boolean {
  const hasSessionCookie = readCookie(SESSION_COOKIE_NAME) === "1";
  const hasCsrfCookie = Boolean(readCookie("cmms_csrf_token"));
  if (hasSessionCookie) {
    return true;
  }
  if (hasSessionBootstrapHint()) {
    return true;
  }
  if (hasCsrfCookie) {
    return true;
  }
  return isTest;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

function getCsrfForRequest(): string | null {
  return getStoredCsrfToken() ?? readCookie("cmms_csrf_token");
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

async function handleUnauthorized(): Promise<void> {
  if (unauthorizedHandled) return;
  unauthorizedHandled = true;
  debugLog("handleUnauthorized:start");
  responseBodyCache.clear();
  clearStoredAccessToken();
  clearStoredCsrfToken();
  clearSessionBootstrapHint();
  clearCookie(SESSION_COOKIE_NAME);
  clearCookie("cmms_csrf_token");

  try {
    const { useAuthStore } = await import("@/store/auth.store");
    const auth = useAuthStore.getState();
    const alreadyLoggedOut =
      !auth.user &&
      !auth.session &&
      !auth.isAuthenticated &&
      !auth.activePlantId &&
      !auth.activePlantCode &&
      !auth.activePlantName;

    if (!alreadyLoggedOut) {
      auth.setUser(null);
      auth.setSession(null);
      auth.setActivePlant(null, null, null);
    }
  } catch {
    // Ignore store reset errors and proceed to login redirect.
  }

  setTimeout(() => {
    unauthorizedHandled = false;
    debugLog("handleUnauthorized:cooldown-reset");
  }, 1000);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

let refreshInFlight: Promise<boolean> | null = null;
const responseBodyCache = new Map<string, unknown>();

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

      if (!response.ok) {
        debugLog("refreshAccessToken:failed", response.status);
        return false;
      }

      const payload = await parseResponse<{ accessToken?: string; data?: { accessToken?: string; csrfToken?: string }; csrfToken?: string }>(response);
      const refreshedToken = payload.accessToken ?? payload.data?.accessToken;
      const csrfToken = payload.csrfToken ?? payload.data?.csrfToken;
      if (!refreshedToken) {
        debugLog("refreshAccessToken:missing-token");
        return false;
      }

      setStoredAccessToken(refreshedToken);
      if (csrfToken) {
        setStoredCsrfToken(csrfToken);
      }
      debugLog("refreshAccessToken:success");
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function ensureAccessToken(): Promise<boolean> {
  if (getStoredAccessToken()) return true;
  if (!hasSessionBootstrapEvidence() && !hasSessionBootstrapHint()) {
    debugLog("ensureAccessToken:skip-no-session-evidence");
    return false;
  }
  if (bootstrapRefreshAttempted) {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    debugLog("ensureAccessToken:skip-bootstrap-refresh");
    return false;
  }

  bootstrapRefreshAttempted = true;
  const refreshed = await refreshAccessToken();
  if (refreshed) {
    bootstrapRefreshAttempted = false;
  }
  return refreshed;
}

function shouldAttemptRefresh(path: string, status: number, retry: boolean): boolean {
  if (status !== 401 || !retry) return false;
  if (path === "/auth/login" || path === "/auth/logout" || path === "/auth/refresh") return false;
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

export async function httpRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  limitRetry = true,
  cacheRetry = true,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = (init.method || "GET").toUpperCase();
  const requestCacheKey = buildRequestCacheKey(method, url);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  if ((path === "/auth/refresh" || path === "/auth/logout") && getCsrfForRequest()) {
    headers.set("X-CSRF-Token", getCsrfForRequest() as string);
  }

  const accessToken = getStoredAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  debugLog("request", {
    url,
    method,
    hasAuthHeader: Boolean(accessToken),
    credentials: "include",
  });

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
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

    if (path !== "/webapp-logs" && response.status >= 500) {
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

    if (response.status === 401 && path !== "/auth/login") {
      await handleUnauthorized();
    }

    const message = getPayloadMessage(payload) || (response.status === 403
      ? "No permission"
      : `Request failed with status ${response.status}`);
    throw new ApiError(response.status, message, payload);
  }

  const parsed = await parseResponse<T>(response);

  if (method === "GET") {
    responseBodyCache.set(requestCacheKey, parsed);
  } else {
    responseBodyCache.clear();
  }

  return parsed;
}
