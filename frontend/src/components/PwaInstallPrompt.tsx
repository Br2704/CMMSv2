import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isMobile(): boolean {
  return isAndroid() || isIOS();
}

function isPwaInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("cmms:pwa-dismissed") === "true");
  const [showGuide, setShowGuide] = useState(false);
  const [installed, setInstalled] = useState(isPwaInstalled);

  useEffect(() => {
    setInstalled(isPwaInstalled());
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPromptEvent(null);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const install = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") setInstallPromptEvent(null);
  };

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("cmms:pwa-dismissed", "true");
  };

  if (installed || dismissed) return null;

  if (showGuide) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Install CMMS App</h3>
            <button onClick={() => setShowGuide(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          {isIOS() ? (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">1</span>Tap the <strong>Share</strong> button in Safari</li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">2</span>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">3</span>Tap <strong>Add</strong> in the top right</li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">1</span>Tap the Chrome menu <strong>(⋮)</strong></li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">2</span>Tap <strong>Add to Home Screen</strong></li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">3</span>Tap <strong>Add</strong> on the dialog</li>
            </ol>
          )}
          <Button className="mt-4 w-full" onClick={dismiss}>Got it</Button>
        </div>
      </div>
    );
  }

  if (installPromptEvent) {
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
          <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isMobile()) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in">
        <div className="flex items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">Install App</p>
            <p className="text-xs text-muted-foreground">Add to home screen for quick access</p>
          </div>
          <Button size="sm" onClick={() => setShowGuide(true)}>How?</Button>
          <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
