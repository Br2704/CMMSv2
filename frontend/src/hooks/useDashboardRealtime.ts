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

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    };

    const connect = () => {
      if (disposed) return;

      const token = getStoredAccessToken();
      const url = new URL(getDashboardSocketUrl(), window.location.origin);
      if (token) {
        url.searchParams.set("token", token);
      }

      socket = new WebSocket(url.toString());

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as DashboardSocketPayload;
          if (payload.type === "dashboard.refresh") {
            onRefreshRef.current();
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

    connect();

    return () => {
      disposed = true;
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
