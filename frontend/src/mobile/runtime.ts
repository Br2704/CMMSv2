import { registerSW } from "virtual:pwa-register";
import { flushOfflineMutations, registerOfflineSyncListeners } from "@/mobile/offlineSync";
import { requestNotificationPermissionAndSubscribe } from "@/mobile/pushNotifications";

async function cleanupDevServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));

  if (!("caches" in window)) {
    return;
  }

  const cacheKeys = await window.caches.keys().catch(() => []);
  await Promise.all(cacheKeys.map((key) => window.caches.delete(key).catch(() => false)));
}

export function bootstrapMobileRuntime(): () => void {
  if (import.meta.env.DEV) {
    void cleanupDevServiceWorkers();
    return () => undefined;
  }

  let registrationRef: ServiceWorkerRegistration | null = null;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef = registration;
      const maybeSync = registration as ServiceWorkerRegistration & {
        sync?: { register: (name: string) => Promise<void> };
        periodicSync?: { register: (name: string, options: { minInterval: number }) => Promise<void> };
      };
      if (maybeSync.sync?.register) {
        void maybeSync.sync.register("cmms-mobile-sync").catch(() => {});
      }
      if (maybeSync.periodicSync?.register) {
        void maybeSync.periodicSync.register("cmms-mobile-periodic-sync", { minInterval: 15 * 60 * 1000 }).catch(() => {});
      }
      void requestNotificationPermissionAndSubscribe(registration).catch(() => {});
    },
  });

  const stopOfflineSync = registerOfflineSyncListeners();
  void flushOfflineMutations();

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void flushOfflineMutations();
      const maybeSync = registrationRef as (ServiceWorkerRegistration & { sync?: { register: (name: string) => Promise<void> } }) | null;
      if (maybeSync?.sync?.register) {
        void maybeSync.sync.register("cmms-mobile-sync").catch(() => undefined);
      }
      if (registrationRef) {
        void requestNotificationPermissionAndSubscribe(registrationRef).catch(() => {});
      }
    }
  };
  window.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("visibilitychange", onVisibility);
    updateSW();
    stopOfflineSync();
  };
}
