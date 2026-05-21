import { useEffect, useState } from "react";
import { WifiOff, AlertCircle, ServerCrash } from "lucide-react";
import { useApiHealth } from "@/hooks/useApiHealth";

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
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-amber-600/90 px-4 py-2 text-white backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-2 text-sm font-bold">
        <ServerCrash className="h-4 w-4 animate-pulse" />
        <span>Server Unreachable — Retrying Connection</span>
        <div className="ml-1 flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { healthy: apiHealthy } = useApiHealth();

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
  if (!apiHealthy) return <ServerDownBanner />;

  return null;
}
