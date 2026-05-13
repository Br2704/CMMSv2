import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const checkInstalled = useCallback(() => {
    if (typeof window === "undefined") return;
    const isPwa = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isPwa);
  }, []);

  useEffect(() => {
    checkInstalled();
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    });
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [checkInstalled]);

  const install = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPromptEvent(null);
    }
  };

  if (isInstalled || !installPromptEvent || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in">
      <div className="flex items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">Install App</p>
          <p className="text-xs text-muted-foreground">Add to home screen for quick access</p>
        </div>
        <Button size="sm" onClick={install}>Install</Button>
        <button onClick={() => setDismissed(true)} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
