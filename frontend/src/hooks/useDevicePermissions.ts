import { useState, useCallback, useEffect } from "react";

export type PermissionStatus = "unknown" | "granted" | "denied" | "unavailable" | "prompt";

export interface DevicePermissionsState {
  notifications: PermissionStatus;
  camera: PermissionStatus;
  location: PermissionStatus;
  vibration: PermissionStatus;
  popupNotifications: PermissionStatus;
}

const STORAGE_KEY = "cmms:device-permissions";

function loadCachedState(): Partial<DevicePermissionsState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<DevicePermissionsState>;
  } catch {
    return null;
  }
}

function saveCachedState(state: Partial<DevicePermissionsState>) {
  try {
    const existing = loadCachedState() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...state }));
  } catch {
    // Storage unavailable
  }
}

function checkSystemPermissions(): DevicePermissionsState {
  // Notifications — map "default" (not asked yet) to "prompt"
  let notifications: PermissionStatus = "unavailable";
  if (typeof window !== "undefined" && "Notification" in window) {
    const raw = Notification.permission;
    notifications = raw === "default" ? "prompt" : (raw as PermissionStatus);
  }

  // Popup notifications are same as notifications API
  const popupNotifications = notifications;

  // Camera
  let camera: PermissionStatus = "unavailable";
  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    camera = "prompt"; // We can only check by actually requesting
  }

  // Location / GPS
  let location: PermissionStatus = "unavailable";
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    location = "prompt";
  }

  // Vibration — no system permission, just capability
  let vibration: PermissionStatus = "unavailable";
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    vibration = "prompt";
  }

  return { notifications, camera, location, vibration, popupNotifications };
}

const DEFAULT_PERMISSIONS: DevicePermissionsState = {
  notifications: "unknown",
  camera: "unknown",
  location: "unknown",
  vibration: "unknown",
  popupNotifications: "unknown",
};

export function useDevicePermissions() {
  const [permissions, setPermissions] = useState<DevicePermissionsState>(() => {
    const cached = loadCachedState();
    const system = checkSystemPermissions();
    // Merge: system values override cache for Notification (real permission)
    return {
      ...DEFAULT_PERMISSIONS,
      ...cached,
      notifications: system.notifications,
      popupNotifications: system.popupNotifications,
    };
  });    // Sync Notification permission changes (user can change it in browser settings)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const check = () => {
      setPermissions((prev) => {
        const raw = Notification.permission;
        const actual: PermissionStatus = raw === "default" ? "prompt" : raw as PermissionStatus;
        if (actual !== prev.notifications) {
          const updated = { ...prev, notifications: actual, popupNotifications: actual };
          saveCachedState(updated);
          return updated;
        }
        return prev;
      });
    };

    // Poll periodically since there's no native event for permission changes
    const interval = setInterval(check, 5000);
    // Also check on visibility change
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const requestNotification = useCallback(async (): Promise<PermissionStatus> => {
    if (!("Notification" in window)) return "unavailable";
    const result = await Notification.requestPermission();
    const status = result as PermissionStatus;
    setPermissions((prev) => {
      const updated = { ...prev, notifications: status, popupNotifications: status };
      saveCachedState(updated);
      return updated;
    });
    return status;
  }, []);

  const requestCamera = useCallback(async (): Promise<PermissionStatus> => {
    if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      // Immediately stop tracks — we just wanted the permission
      stream.getTracks().forEach((track) => track.stop());
      const status: PermissionStatus = "granted";
      setPermissions((prev) => {
        const updated = { ...prev, camera: status };
        saveCachedState(updated);
        return updated;
      });
      return status;
    } catch (err) {
      const status: PermissionStatus =
        (err as DOMException).name === "NotAllowedError" ? "denied" : "denied";
      setPermissions((prev) => {
        const updated = { ...prev, camera: status };
        saveCachedState(updated);
        return updated;
      });
      return status;
    }
  }, []);

  const requestLocation = useCallback(async (): Promise<PermissionStatus> => {
    if (!navigator.geolocation) return "unavailable";
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          const status: PermissionStatus = "granted";
          setPermissions((prev) => {
            const updated = { ...prev, location: status };
            saveCachedState(updated);
            return updated;
          });
          resolve(status);
        },
        (err) => {
          const status: PermissionStatus =
            err.code === err.PERMISSION_DENIED ? "denied" : "denied";
          setPermissions((prev) => {
            const updated = { ...prev, location: status };
            saveCachedState(updated);
            return updated;
          });
          resolve(status);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }, []);

  const confirmVibration = useCallback((): PermissionStatus => {
    // Vibration has no system permission — just check capability and "opt-in"
    const status: PermissionStatus = "granted";
    setPermissions((prev) => {
      const updated = { ...prev, vibration: status };
      saveCachedState(updated);
      return updated;
    });
    // Give a subtle test vibration
    if ("vibrate" in navigator) {
      navigator.vibrate(15);
    }
    return status;
  }, []);

  const skipCamera = useCallback(() => {
    setPermissions((prev) => {
      const updated = { ...prev, camera: "denied" as PermissionStatus };
      saveCachedState(updated);
      return updated;
    });
  }, []);

  const skipLocation = useCallback(() => {
    setPermissions((prev) => {
      const updated = { ...prev, location: "denied" as PermissionStatus };
      saveCachedState(updated);
      return updated;
    });
  }, []);

  const skipVibration = useCallback(() => {
    setPermissions((prev) => {
      const updated = { ...prev, vibration: "denied" as PermissionStatus };
      saveCachedState(updated);
      return updated;
    });
  }, []);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    setPermissions({
      ...DEFAULT_PERMISSIONS,
      ...checkSystemPermissions(),
    });
  }, []);

  const hasPendingPermissions = [
    permissions.notifications === "prompt" || permissions.notifications === "unknown",
    permissions.camera === "prompt" || permissions.camera === "unknown",
    permissions.location === "prompt" || permissions.location === "unknown",
    permissions.vibration === "prompt" || permissions.vibration === "unknown",
  ].some(Boolean);

  return {
    permissions,
    requestNotification,
    requestCamera,
    requestLocation,
    confirmVibration,
    skipCamera,
    skipLocation,
    skipVibration,
    resetAll,
    hasPendingPermissions,
  };
}
