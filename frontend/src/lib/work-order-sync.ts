const CHANNEL_NAME = "cmms-work-order-sync";
const EVENT_NAME = "cmms:work-order-sync";

type WorkOrderSyncListener = () => void;

export function broadcastWorkOrderSync() {
  if (typeof window === "undefined") {
    return;
  }

  const payload = String(Date.now());
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }
  window.localStorage.setItem(EVENT_NAME, payload);
}

export function subscribeWorkOrderSync(listener: WorkOrderSyncListener) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let channel: BroadcastChannel | null = null;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === EVENT_NAME && event.newValue) {
      listener();
    }
  };

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => listener();
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", handleStorage);
  };
}