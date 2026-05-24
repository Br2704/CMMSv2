import { getApiBaseUrl } from "@/api/http";

type ApiHealthState = {
  healthy: boolean;
  lastCheckedAt: number;
  lastError: string | null;
  consecutiveFailures: number;
};

type ApiHealthListener = (state: ApiHealthState) => void;

const listeners = new Set<ApiHealthListener>();
let healthState: ApiHealthState = {
  healthy: true,
  lastCheckedAt: 0,
  lastError: null,
  consecutiveFailures: 0,
};
let monitorId: number | null = null;
let inflightCheck: Promise<void> | null = null;
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;
let backoffDelay = 15000; // Start at 15s

const MIN_INTERVAL_MS = 15000;
const MAX_INTERVAL_MS = 120000; // Cap at 2 minutes to avoid flooding

function notify() {
  listeners.forEach((listener) => listener(healthState));
}

function updateState(next: Omit<ApiHealthState, "consecutiveFailures"> & { consecutiveFailures?: number }) {
  const resolved: ApiHealthState = {
    ...healthState,
    ...next,
    consecutiveFailures: next.consecutiveFailures ?? (
      next.healthy ? 0 : healthState.consecutiveFailures + 1
    ),
  };

  const changed =
    healthState.healthy !== resolved.healthy ||
    healthState.lastError !== resolved.lastError ||
    healthState.lastCheckedAt !== resolved.lastCheckedAt;
  healthState = resolved;
  if (changed) {
    notify();

    // Adjust polling interval based on health state
    if (!resolved.healthy && monitorId !== null) {
      // Exponential backoff when unhealthy — clamp to MAX_INTERVAL_MS
      backoffDelay = Math.min(backoffDelay * 1.5, MAX_INTERVAL_MS);
      rescheduleMonitor(backoffDelay);
    } else if (resolved.healthy && backoffDelay > MIN_INTERVAL_MS) {
      // Restore normal polling once healthy again
      backoffDelay = MIN_INTERVAL_MS;
      rescheduleMonitor(backoffDelay);
    }
  }
}

function rescheduleMonitor(intervalMs: number) {
  if (monitorId !== null) {
    window.clearInterval(monitorId);
  }
  monitorId = window.setInterval(() => {
    void checkApiHealth();
  }, intervalMs);
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
  // Skip if already checking
  if (inflightCheck) return inflightCheck;

  inflightCheck = (async () => {
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (isOffline) {
      updateState({ healthy: false, lastCheckedAt: Date.now(), lastError: "offline" });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${getApiBaseUrl()}/health`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      const wasHealthy = healthState.healthy;
      const isHealthy = response.ok;

      updateState({
        healthy: isHealthy,
        lastCheckedAt: Date.now(),
        lastError: isHealthy ? null : `status:${response.status}`,
      });

      // If transitioning from unhealthy to healthy, reset backoff
      if (!wasHealthy && isHealthy) {
        backoffDelay = MIN_INTERVAL_MS;
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        updateState({
          healthy: false,
          lastCheckedAt: Date.now(),
          lastError: "timeout",
        });
      } else {
        updateState({
          healthy: false,
          lastCheckedAt: Date.now(),
          lastError: error instanceof Error ? error.message : "network_error",
        });
      }
    } finally {
      window.clearTimeout(timeoutId);
      inflightCheck = null;
    }
  })();

  return inflightCheck;
}

export function startApiHealthMonitor(intervalMs = MIN_INTERVAL_MS): void {
  if (typeof window === "undefined") return;
  if (monitorId !== null) return;

  backoffDelay = intervalMs;

  // Initial check after a short delay to avoid competing with page load
  window.setTimeout(() => {
    void checkApiHealth();
  }, 2000);

  monitorId = window.setInterval(() => {
    void checkApiHealth();
  }, intervalMs);

  onlineHandler = () => {
    backoffDelay = MIN_INTERVAL_MS;
    rescheduleMonitor(backoffDelay);
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

// Manually trigger an immediate health check (e.g., after user clicks "retry")
export function triggerHealthCheck(): void {
  void checkApiHealth();
}
