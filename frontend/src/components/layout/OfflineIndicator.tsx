import { useEffect, useState, useCallback } from "react";
import { WifiOff, AlertCircle, ServerCrash, RefreshCw } from "lucide-react";
import { useApiHealth } from "@/hooks/useApiHealth";
import { triggerHealthCheck } from "@/lib/apiHealth";

function OfflineBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-destructive/90 px-4 py-2 text-white backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-2 text-sm font-bold">
        <WifiOff className="h-4 w-4 animate-pulse" />
        <span>Offline Mode: Working from Local Cache</span>
        <AlertCircle className="h-3 w-3 opacity-70" />
      </div>
    </div>
  );
}

function ServerDownBanner() {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    triggerHealthCheck();
    setTimeout(() => setIsRetrying(false), 3000);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-4 bg-amber-600/95 px-4 py-2.5 text-white backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-2 text-sm font-bold">
        <ServerCrash className="h-4 w-4 shrink-0" />
        <span>Server Temporarily Unavailable — Reconnecting</span>
        <div className="ml-1 flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
      <button
        onClick={handleRetry}
        disabled={isRetrying}
        className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 disabled:opacity-60 transition-all"
        title="Retry connection"
      >
        <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
        {isRetrying ? "Checking..." : "Retry"}
      </button>
    </div>
  );
}

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { healthy: apiHealthy, consecutiveFailures } = useApiHealth();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Browser offline takes priority — definitive state
  if (isOffline) return <OfflineBanner />;

  // API unhealthy but browser still connected — backend or network issue
  // Only show banner after 1+ consecutive failure to avoid transient flickers
  if (!apiHealthy && (consecutiveFailures ?? 1) >= 1) return <ServerDownBanner />;

  return null;
}
