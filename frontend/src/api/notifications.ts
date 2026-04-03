import { httpRequest } from "@/api/http";

export interface NotificationApi {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
  woId: string | null;
  createdAt: string;
}

export async function listNotifications(query = ""): Promise<NotificationApi[]> {
  const response = await httpRequest<{ success: true; data: { notifications: NotificationApi[] } | NotificationApi[] }>(
    `/notifications${query}`,
    { method: "GET" },
  );
  if (Array.isArray(response.data)) return response.data;
  return response.data.notifications ?? [];
}

export const markNotificationRead = (id: string) =>
  httpRequest<{ success: true; data: NotificationApi }>(`/notifications/${id}/read`, { method: "PATCH", body: JSON.stringify({}) });

export const markAllNotificationsRead = () =>
  httpRequest<{ success: true; data: { updated: boolean } }>(`/notifications/read-all`, { method: "PATCH", body: JSON.stringify({}) });

export const deleteNotificationApi = (id: string) =>
  httpRequest<{ success: true; data: { id: string; deleted: boolean } }>(`/notifications/${id}`, { method: "DELETE" });

export const createNotificationApi = (payload: Record<string, unknown>) =>
  httpRequest<{ success: true; data: NotificationApi }>("/notifications", { method: "POST", body: JSON.stringify(payload) });

export const createNotificationsByRole = (payload: {
  role: string;
  plantId?: string | null;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "critical";
  link?: string;
  woId?: string;
}) =>
  httpRequest<{ success: true; data: { inserted: number } }>("/notifications/by-role", {
    method: "POST",
    body: JSON.stringify(payload),
  });
