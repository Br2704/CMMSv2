let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;
let refreshTokenMemory: string | null = null;

const CSRF_TOKEN_STORAGE_KEY = "cmms_csrf_token";
export const SESSION_HINT_KEY = "cmms_has_session";
export const SESSION_COOKIE_NAME = "cmms_session";

function getSessionStorage(): Storage | null {
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
  return refreshTokenMemory;
}

export function setStoredRefreshToken(token: string): void {
  refreshTokenMemory = token;
}

export function clearStoredRefreshToken(): void {
  refreshTokenMemory = null;
}

export function setSessionBootstrapHint(_rememberMe = false): void {
  getSessionStorage()?.setItem(SESSION_HINT_KEY, "true");
  try { localStorage.setItem(SESSION_HINT_KEY, "true"); } catch { /* ignore */ }
}

export function clearSessionBootstrapHint(): void {
  getSessionStorage()?.removeItem(SESSION_HINT_KEY);
  try { localStorage.removeItem(SESSION_HINT_KEY); } catch { /* ignore */ }
}

export function hasSessionBootstrapHint(): boolean {
  const ls = (() => { try { return localStorage.getItem(SESSION_HINT_KEY) === "true"; } catch { return false; } })();
  const ss = getSessionStorage()?.getItem(SESSION_HINT_KEY) === "true";
  return ls || ss;
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
  document.cookie = `${name}=; Max-Age=0; path=/; Secure; SameSite=Strict`;
}

let unauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(cb: () => void): void {
  unauthorizedCallback = cb;
}

export function getUnauthorizedCallback(): (() => void) | null {
  return unauthorizedCallback;
}
