let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;
let refreshTokenMemory: string | null = null;

const REFRESH_TOKEN_STORAGE_KEY = "cmms_refresh_token";
const CSRF_TOKEN_STORAGE_KEY = "cmms_csrf_token";
export const SESSION_HINT_KEY = "cmms_has_session";
export const SESSION_COOKIE_NAME = "cmms_session";

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function getStoredAccessToken(): string | null {
  return accessTokenMemory;
}

export function setStoredAccessToken(token: string): void {
  accessTokenMemory = token;
}

export function clearStoredAccessToken(): void {
  accessTokenMemory = null;
}

export function getStoredCsrfToken(): string | null {
  return csrfTokenMemory || getSessionStorage()?.getItem(CSRF_TOKEN_STORAGE_KEY) || null;
}

export function setStoredCsrfToken(token: string): void {
  csrfTokenMemory = token;
  try { getSessionStorage()?.setItem(CSRF_TOKEN_STORAGE_KEY, token); } catch { /* ignore */ }
}

export function clearStoredCsrfToken(): void {
  csrfTokenMemory = null;
  try { getSessionStorage()?.removeItem(CSRF_TOKEN_STORAGE_KEY); } catch { /* ignore */ }
}

export function getStoredRefreshToken(): string | null {
  return refreshTokenMemory || getSessionStorage()?.getItem(REFRESH_TOKEN_STORAGE_KEY) || null;
}

export function setStoredRefreshToken(token: string): void {
  refreshTokenMemory = token;
  try { getSessionStorage()?.setItem(REFRESH_TOKEN_STORAGE_KEY, token); } catch { /* ignore */ }
}

export function clearStoredRefreshToken(): void {
  refreshTokenMemory = null;
  try { getSessionStorage()?.removeItem(REFRESH_TOKEN_STORAGE_KEY); } catch { /* ignore */ }
}

export function setSessionBootstrapHint(): void {
  getSessionStorage()?.setItem(SESSION_HINT_KEY, "true");
}

export function clearSessionBootstrapHint(): void {
  getSessionStorage()?.removeItem(SESSION_HINT_KEY);
}

export function hasSessionBootstrapHint(): boolean {
  return getSessionStorage()?.getItem(SESSION_HINT_KEY) === "true";
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

export function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

let unauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(cb: () => void): void {
  unauthorizedCallback = cb;
}

export function getUnauthorizedCallback(): (() => void) | null {
  return unauthorizedCallback;
}
