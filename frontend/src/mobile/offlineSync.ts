import { getApiBaseUrl, getStoredAccessToken } from "@/api/http";
import {
  bumpQueuedMutationRetry,
  deleteQueuedMutation,
  getQueuedMutationCount,
  listQueuedMutations,
  queueMutation,
  type QueuedMutation,
} from "@/mobile/indexedDb";

function emitSyncEvent(detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cmms:offline-sync", { detail }));
}

function toAbsoluteApiUrl(relativePath: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${path}`;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /network|fetch|offline|failed/i.test(error.message);
}

export async function executeOrQueueMutation(input: {
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  headers?: Record<string, string>;
}): Promise<{ queued: boolean; response?: Response }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(input.headers || {}),
  };
  const token = getStoredAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!navigator.onLine) {
    await queueMutation({ url: input.url, method: input.method, body: input.body });
    emitSyncEvent({ type: "queued", count: await getQueuedMutationCount() });
    return { queued: true };
  }

  try {
    const response = await fetch(toAbsoluteApiUrl(input.url), {
      method: input.method,
      headers,
      credentials: "include",
      body: JSON.stringify(input.body),
    });

    if (!response.ok && response.status >= 500) {
      await queueMutation({ url: input.url, method: input.method, body: input.body });
      emitSyncEvent({ type: "queued", count: await getQueuedMutationCount() });
      return { queued: true, response };
    }

    return { queued: false, response };
  } catch (error) {
    if (isNetworkError(error)) {
      await queueMutation({ url: input.url, method: input.method, body: input.body });
      emitSyncEvent({ type: "queued", count: await getQueuedMutationCount() });
      return { queued: true };
    }
    throw error;
  }
}

async function replayMutation(row: QueuedMutation): Promise<boolean> {
  if (!row.id) return false;

  const token = getStoredAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(toAbsoluteApiUrl(row.url), {
      method: row.method,
      headers,
      credentials: "include",
      body: JSON.stringify(row.body),
    });

    if (response.ok) {
      await deleteQueuedMutation(row.id);
      return true;
    }

    if (response.status >= 400 && response.status < 500) {
      await deleteQueuedMutation(row.id);
      return false;
    }

    await bumpQueuedMutationRetry(row.id, row.retryCount + 1);
    return false;
  } catch {
    await bumpQueuedMutationRetry(row.id, row.retryCount + 1);
    return false;
  }
}

let syncInProgress = false;

export async function flushOfflineMutations(): Promise<number> {
  if (syncInProgress || !navigator.onLine) return 0;
  syncInProgress = true;
  emitSyncEvent({ type: "sync-start" });
  try {
    const queued = await listQueuedMutations();
    let synced = 0;
    for (const row of queued) {
      const ok = await replayMutation(row);
      if (ok) synced += 1;
    }
    emitSyncEvent({ type: "sync-done", synced, count: await getQueuedMutationCount() });
    return synced;
  } finally {
    syncInProgress = false;
  }
}

export function registerOfflineSyncListeners(): () => void {
  const onOnline = () => {
    void flushOfflineMutations();
  };

  window.addEventListener("online", onOnline);

  const interval = window.setInterval(() => {
    void flushOfflineMutations();
  }, 20_000);

  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(interval);
  };
}
