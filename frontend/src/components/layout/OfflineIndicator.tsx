import { useEffect, useState } from "react";
import { WifiOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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

  if (!isOffline) return null;

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
