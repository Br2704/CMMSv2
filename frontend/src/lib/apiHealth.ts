import { getApiBaseUrl } from "@/api/http";

type ApiHealthState = {
  healthy: boolean;
  lastCheckedAt: number;
  lastError: string | null;
};

type ApiHealthListener = (state: ApiHealthState) => void;

const listeners = new Set<ApiHealthListener>();
let healthState: ApiHealthState = {
  healthy: true,
  lastCheckedAt: 0,
  lastError: null,
};
let monitorId: number | null = null;
let inflightCheck: Promise<void> | null = null;
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

function notify() {
  listeners.forEach((listener) => listener(healthState));
}

function updateState(next: ApiHealthState) {
  const changed =
    healthState.healthy !== next.healthy ||
    healthState.lastError !== next.lastError ||
    healthState.lastCheckedAt !== next.lastCheckedAt;
  healthState = next;
  if (changed) {
    notify();
  }
}

export function getApiHealthState(): ApiHealthState {
  return healthState;
}

export function isApiHealthy(): boolean {
  return healthState.healthy;
}

export function subscribeApiHealth(listener: ApiHealthListener): () => void {
  listeners.add(listener);
  listener(healthState);
  return () => {
    listeners.delete(listener);
  };
}

async function checkApiHealth(): Promise<void> {
  if (inflightCheck) return inflightCheck;

  inflightCheck = (async () => {
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (isOffline) {
      updateState({ healthy: false, lastCheckedAt: Date.now(), lastError: "offline" });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${getApiBaseUrl()}/health`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      updateState({
        healthy: response.ok,
        lastCheckedAt: Date.now(),
        lastError: response.ok ? null : `status:${response.status}`,
      });
    } catch (error) {
      updateState({
        healthy: false,
        lastCheckedAt: Date.now(),
        lastError: error instanceof Error ? error.message : "network_error",
      });
    } finally {
      window.clearTimeout(timeoutId);
      inflightCheck = null;
    }
  })();

  return inflightCheck;
}

export function startApiHealthMonitor(intervalMs = 15000): void {
  if (typeof window === "undefined") return;
  if (monitorId !== null) return;

  void checkApiHealth();
  monitorId = window.setInterval(() => {
    void checkApiHealth();
  }, intervalMs);

  onlineHandler = () => {
    void checkApiHealth();
  };

  offlineHandler = () => {
    updateState({ healthy: false, lastCheckedAt: Date.now(), lastError: "offline" });
  };

  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);
}

export function stopApiHealthMonitor(): void {
  if (monitorId !== null) {
    window.clearInterval(monitorId);
    monitorId = null;
  }

  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }

  if (offlineHandler) {
    window.removeEventListener("offline", offlineHandler);
    offlineHandler = null;
  }
}
