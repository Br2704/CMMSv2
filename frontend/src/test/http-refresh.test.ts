import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredAccessToken,
  clearStoredCsrfToken,
  ensureAccessToken,
  httpRequest,
  setStoredAccessToken,
  setStoredCsrfToken,
} from "@/api/http";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HTTP refresh logic", () => {
  beforeEach(() => {
    clearStoredAccessToken();
    clearStoredCsrfToken();
    vi.restoreAllMocks();
  });

  it("shares a single refresh request for concurrent calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { accessToken: "new-access", csrfToken: "new-csrf" } }, 200),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([ensureAccessToken(), ensureAccessToken()]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries the request after one successful refresh", async () => {
    setStoredAccessToken("expired-token");
    setStoredCsrfToken("csrf-before-refresh");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: "new-access", csrfToken: "new-csrf" } }, 200))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await httpRequest<{ success: true; data: { ok: boolean } }>("/assets", { method: "GET" });
    expect(response.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not trigger repeated refresh calls for concurrent 401s when refresh fails", async () => {
    setStoredAccessToken("expired-token");
    setStoredCsrfToken("csrf-before-refresh");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "Invalid refresh token" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const outcomes = await Promise.allSettled([
      httpRequest("/assets", { method: "GET" }),
      httpRequest("/assets", { method: "GET" }),
    ]);

    expect(outcomes.every((item) => item.status === "rejected")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });

  it("sends CSRF header on logout requests", async () => {
    setStoredCsrfToken("csrf-logout");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { loggedOut: true } }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await httpRequest("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get("X-CSRF-Token")).toBe("csrf-logout");
  });
});
