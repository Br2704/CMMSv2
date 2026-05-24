import { useEffect, useRef } from "react";
import { getApiBaseUrl, getStoredAccessToken } from "@/api/http";

type DashboardSocketPayload = {
  type?: string;
  timestamp?: string;
  reason?: string;
};

function getDashboardSocketUrl() {
  const apiBase = getApiBaseUrl().replace(/\/+$/, "");
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";

  if (/^https?:\/\//i.test(apiBase)) {
    return `${apiBase.replace(/^http/i, "ws").replace(/\/api$/, "")}/ws/dashboard`;
  }

  const basePath = apiBase.replace(/\/api$/, "");
  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return `${protocol}//${window.location.host}${normalizedBase === "/" ? "" : normalizedBase}/ws/dashboard`;
}

export function useDashboardRealtime(options: { enabled: boolean; onRefresh: () => void }) {
  const onRefreshRef = useRef(options.onRefresh);

  useEffect(() => {
    onRefreshRef.current = options.onRefresh;
  }, [options.onRefresh]);

  useEffect(() => {
    if (!options.enabled || typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let retryAttempt = 0;

    const getReconnectDelay = () => {
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const baseDelay = isOffline ? 10_000 : 3_000;
      const delay = Math.min(60_000, baseDelay * Math.pow(2, retryAttempt));
      retryAttempt = Math.min(retryAttempt + 1, 6);
      return delay;
    };

    const resetReconnect = () => {
      retryAttempt = 0;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, getReconnectDelay());
    };

    const connect = () => {
      if (disposed) return;

      const token = getStoredAccessToken();
      if (!token) {
        scheduleReconnect();
        return;
      }

      const url = new URL(getDashboardSocketUrl(), window.location.origin);
      // Pass token as subprotocol for security
      socket = new WebSocket(url.toString(), [token]);

      socket.onopen = () => {
        resetReconnect();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as DashboardSocketPayload;
          if (payload.type === "dashboard.refresh") {
            onRefreshRef.current();
            
            // Instantly invalidate and refetch permissions in real-time
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("cmms:permissions-invalidated"));
            }
          }
        } catch {
          // Ignore malformed websocket payloads and keep the socket alive.
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    const handleOnline = () => {
      if (disposed) return;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connect();
    };

    window.addEventListener("online", handleOnline);

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
      socket = null;
    };
  }, [options.enabled]);
}
