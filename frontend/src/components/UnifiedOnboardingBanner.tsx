import { useEffect, useState, useCallback } from "react";
import { Bell, Download, X, Check, Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

export function UnifiedOnboardingBanner() {
  const [visible, setVisible] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [isInstalled, setIsInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("cmms:onboarding-dismissed") === "true");
  
  const [step, setStep] = useState<"notif" | "install" | "success" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkState = () => {
      const pwa = isPwaInstalled();
      const notif = "Notification" in window ? Notification.permission : "granted"; // Assume granted if not supported
      
      setIsInstalled(pwa);
      setNotifPermission(notif);

      // If both are already done, don't show
      if (pwa && notif === "granted") {
        setVisible(false);
      } else if (!dismissed) {
        setVisible(true);
        // Decide which step to show first
        if (notif === "default") {
          setStep("notif");
        } else if (!pwa) {
          setStep("install");
        }
      }
    };

    checkState();

    const onBeforeInstall = (e: Event) => {
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [dismissed]);

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === "granted" && !isInstalled) {
      setStep("install");
    } else if (result === "granted" && isInstalled) {
      setStep("success");
    }
  };

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setStep("success");
      }
    } else {
      // Show manual guide if no prompt (e.g. iOS)
      window.alert("To install: Tap Share button and select 'Add to Home Screen'");
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("cmms:onboarding-dismissed", "true");
    setVisible(false);
  };

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[100] mx-auto max-w-lg ">
      <Card className="overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <CardContent className="relative p-6">
          <button 
            onClick={handleDismiss}
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground  hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              {step === "notif" && <Bell className="h-6 w-6 " />}
              {step === "install" && <Download className="h-6 w-6 " />}
              {step === "success" && <ShieldCheck className="h-6 w-6 text-emerald-500" />}
            </div>

            <div className="flex-1 space-y-1">
              <h3 className="text-lg font-bold tracking-tight">
                {step === "notif" && "Stay Informed"}
                {step === "install" && "Take it with you"}
                {step === "success" && "You're all set!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {step === "notif" && "Enable notifications to get real-time updates on work orders and critical plant alerts."}
                {step === "install" && "Install the CMMS app on your home screen for a faster, full-screen industrial experience."}
                {step === "success" && "Your environment is optimized. You'll receive updates and can access the app anytime."}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                {step === "notif" && (
                  <Button onClick={handleEnableNotifications} className="gap-2 shadow-lg shadow-primary/20">
                    <Check className="h-4 w-4" />
                    Enable Notifications
                  </Button>
                )}
                {step === "install" && (
                  <Button onClick={handleInstall} className="gap-2 shadow-lg shadow-primary/20">
                    <Smartphone className="h-4 w-4" />
                    Install App
                  </Button>
                )}
                {step === "success" && (
                  <Button onClick={handleDismiss} variant="outline" className="gap-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10">
                    <Check className="h-4 w-4" />
                    Finish Setup
                  </Button>
                )}
                {step !== "success" && (
                  <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-muted-foreground">
                    Maybe later
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <div className={cn("h-1 flex-1 rounded-full bg-muted", notifPermission === "granted" && "bg-emerald-500")} />
            <div className={cn("h-1 flex-1 rounded-full bg-muted", isInstalled && "bg-emerald-500")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
