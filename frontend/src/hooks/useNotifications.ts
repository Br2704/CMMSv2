import { useEffect, useState, useCallback, useRef } from "react";
import {
  createNotificationApi,
  createNotificationsByRole,
  deleteNotificationApi,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/api/notifications";
import { ensureAccessToken, getApiBaseUrl, getStoredAccessToken } from "@/api/http";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  wo_id: string | null;
  created_at: string;
}

function toLegacyNotification(input: Record<string, any>): Notification {
  return {
    id: input.id,
    user_id: input.user_id ?? input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    is_read: input.is_read ?? input.isRead ?? false,
    link: input.link ?? null,
    wo_id: input.wo_id ?? input.woId ?? null,
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
  };
}

function consumeSseBuffer(
  buffer: string,
  onEvent: (eventName: string, data: string) => void,
): string {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\n\n");
  const remainder = chunks.pop() ?? "";

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of chunk.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    onEvent(eventName, dataLines.join("\n"));
  }

  return remainder;
}

export function useNotifications(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamReconnectRef = useRef<number | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!enabled || !user || authLoading || !isAuthenticated || !getStoredAccessToken()) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listNotifications("?limit=50&page=1");
      setNotifications(rows.map((row) => toLegacyNotification(row as Record<string, any>)));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, enabled, isAuthenticated, user]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!enabled || !user || authLoading || !isAuthenticated || !getStoredAccessToken()) return;

    const poll = () => {
      void fetchNotifications();
    };

    const interval = window.setInterval(() => {
      poll();
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        poll();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authLoading, enabled, fetchNotifications, isAuthenticated, user]);

  useEffect(() => {
    if (!enabled || !user || authLoading || !isAuthenticated) return;

    let cancelled = false;

    const clearReconnect = () => {
      if (streamReconnectRef.current !== null) {
        window.clearTimeout(streamReconnectRef.current);
        streamReconnectRef.current = null;
      }
    };

    const scheduleReconnect = (delayMs = 3_000) => {
      if (cancelled || streamReconnectRef.current !== null) return;
      streamReconnectRef.current = window.setTimeout(() => {
        streamReconnectRef.current = null;
        void connectStream();
      }, delayMs);
    };

    const abortCurrentStream = () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
    };

    const connectStream = async () => {
      clearReconnect();

      const hasToken = getStoredAccessToken() || (await ensureAccessToken());
      if (!hasToken || cancelled) {
        scheduleReconnect(5_000);
        return;
      }

      const accessToken = getStoredAccessToken();
      if (!accessToken) {
        scheduleReconnect(5_000);
        return;
      }

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        const response = await fetch(`${getApiBaseUrl()}/notifications/stream`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (cancelled) return;

        if (response.status === 401) {
          const refreshed = await ensureAccessToken();
          scheduleReconnect(refreshed ? 500 : 5_000);
          return;
        }

        if (!response.ok || !response.body) {
          scheduleReconnect();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = consumeSseBuffer(buffer, (eventName) => {
            if (eventName === "notifications.changed") {
              void fetchNotifications();
            }
          });
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          scheduleReconnect();
        }
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
        if (!cancelled && !controller.signal.aborted) {
          scheduleReconnect();
        }
      }
    };

    // Proactively close the stream when the page is hidden so the browser
    // doesn't force-suspend it (which produces ERR_NETWORK_IO_SUSPENDED).
    // Reconnect immediately when the page becomes visible again.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        abortCurrentStream();
      } else if (document.visibilityState === "visible") {
        clearReconnect();
        void connectStream();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    void connectStream();

    return () => {
      cancelled = true;
      clearReconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abortCurrentStream();
    };
  }, [authLoading, enabled, fetchNotifications, isAuthenticated, user]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const firstLoad = seenNotificationIds.current.size === 0;
    const nextSeen = new Set(seenNotificationIds.current);

    for (const notification of notifications) {
      const isNew = !nextSeen.has(notification.id);
      nextSeen.add(notification.id);

      if (!firstLoad && isNew) {
        // Play notification chime with reusable audio element
        try {
          if (!notificationAudioRef.current) {
            notificationAudioRef.current = new Audio("/assets/notification.mp3");
            notificationAudioRef.current.volume = 0.5;
          } else {
            notificationAudioRef.current.currentTime = 0;
          }
          notificationAudioRef.current.play().catch(() => {});
        } catch (e) {
          console.error("Failed to play notification chime", e);
        }

        // Show in-app Sonner Toast popup!
        toast.info(notification.title, {
          description: notification.message,
          action: notification.link
            ? {
                label: "View",
                onClick: () => {
                  if (notification.link) {
                    window.location.assign(notification.link);
                  }
                },
              }
            : undefined,
        });

        // Trigger native browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          const browserNotification = new Notification(notification.title, {
            body: notification.message,
            tag: notification.id,
            icon: "/jkfenner/jkfenner-logo.png",
            badge: "/jkfenner/jkfenner-favicon.svg",
            requireInteraction: true,
            data: { url: notification.link, woId: notification.wo_id },
          });
          browserNotification.onclick = (event) => {
            event.preventDefault();
            if (notification.link) {
              window.focus();
              window.location.assign(notification.link);
            }
            browserNotification.close();
          };
        }
      }
    }

    seenNotificationIds.current = nextSeen;

    if ("setAppBadge" in navigator) {
      const unread = notifications.filter((n) => !n.is_read).length;
      navigator.setAppBadge(unread).catch(() => {});
    }
  }, [notifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      void fetchNotifications();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && "clearAppBadge" in navigator) {
        navigator.clearAppBadge().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const markAsRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((notification) => (notification.id === id ? { ...notification, is_read: true } : notification)));
  };

  const markAllAsRead = async () => {
    if (notifications.every((notification) => notification.is_read)) return;
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true })));
  };

  const removeNotification = async (id: string) => {
    await deleteNotificationApi(id);
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, removeNotification, refetch: fetchNotifications };
}

export async function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "critical";
  link?: string;
  woId?: string;
}) {
  await createNotificationApi({
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    link: params.link || null,
    woId: params.woId || null,
  });
}

export async function notifyByRole(params: {
  role: string;
  plantId: string | null;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "critical";
  link?: string;
  woId?: string;
}) {
  await createNotificationsByRole({
    role: params.role,
    plantId: params.plantId,
    title: params.title,
    message: params.message,
    type: params.type,
    link: params.link,
    woId: params.woId,
  });
}
