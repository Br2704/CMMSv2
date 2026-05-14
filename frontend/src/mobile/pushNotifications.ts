import { getApiBaseUrl, getStoredAccessToken } from "@/api/http";

export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    if (!("PushManager" in window)) return null;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const publicKey = await fetchPushPublicKey();
      if (!publicKey) return null;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await sendSubscriptionToServer(subscription);
    return subscription;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    const ok = await subscription.unsubscribe();
    if (ok) {
      await fetch(`${getApiBaseUrl()}/push/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getStoredAccessToken() ?? ""}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
    return ok;
  } catch {
    return false;
  }
}

async function fetchPushPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${getStoredAccessToken() ?? ""}` },
    });
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey;
  } catch {
    return null;
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const token = getStoredAccessToken();
  if (!token) {
    // User is not authenticated yet — skip silently to avoid 401 errors.
    return;
  }
  await fetch(`${getApiBaseUrl()}/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export async function requestNotificationPermissionAndSubscribe(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
  }
  const sub = await subscribeToPush(registration);
  return sub !== null;
}
