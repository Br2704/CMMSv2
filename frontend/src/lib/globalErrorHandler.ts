export function installGlobalErrorHandler() {
  if (typeof window === "undefined") return;

  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    try {
      const detail = error?.message || message || "Unknown error";
      const stack = error?.stack || `${source}:${lineno}:${colno}`;
      fetch("/api/webapp-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "error",
          message: `[GLOBAL] ${detail}`,
          stack,
          action: "global.error",
        }),
        credentials: "include",
      }).catch(() => {});
    } catch { /* ignore */ }
    if (originalOnError) return originalOnError.apply(window, arguments as any);
    return false;
  };

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event.reason?.message || event.reason || "Unhandled rejection";
      const stack = event.reason?.stack || "";
      fetch("/api/webapp-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "error",
          message: `[UNHANDLED] ${reason}`,
          stack,
          action: "global.unhandledrejection",
        }),
        credentials: "include",
      }).catch(() => {});
    } catch { /* ignore */ }
  });
}
