import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt if user is authenticated and hasn't dismissed it this session
      const isDismissed = sessionStorage.getItem("pwa-prompt-dismissed") === "true";
      if (!isDismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowPrompt(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem("pwa-prompt-dismissed", "true");
  };

  if (!showPrompt || !isAuthenticated) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-10 sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
      <div className="overflow-hidden rounded-2xl border border-white/20 bg-background/80 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Install App</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Install TamOptiX CMMS for a better mobile experience and offline access.
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="rounded-full p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" className="w-full h-9 rounded-xl" onClick={handleInstall}>
            Install Now
          </Button>
          <Button size="sm" variant="ghost" className="w-full h-9 rounded-xl" onClick={handleDismiss}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
