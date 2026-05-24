import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Download,
  X,
  Check,
  Smartphone,
  ShieldCheck,
  Camera,
  MapPin,
  Zap,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDevicePermissions } from "@/hooks/useDevicePermissions";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

type OnboardingStep =
  | "notifications"
  | "camera"
  | "location"
  | "vibration"
  | "install"
  | "success";

interface StepConfig {
  id: OnboardingStep;
  icon: typeof Bell;
  title: string;
  description: string;
  buttonLabel: string;
  skipLabel?: string;
  secondaryAction?: { label: string; action: () => void };
}

export function UnifiedOnboardingBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("cmms:onboarding-dismissed") === "true",
  );
  const [step, setStep] = useState<OnboardingStep>("notifications");
  const [isInstalled, setIsInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [requesting, setRequesting] = useState(false);
  // Track which steps have been visited/skipped so the progress bar doesn't show them as pending
  const [visitedSteps, setVisitedSteps] = useState<Set<OnboardingStep>>(new Set());

  const {
    permissions,
    requestNotification,
    requestCamera,
    requestLocation,
    confirmVibration,
    skipCamera,
    skipLocation,
    skipVibration,
  } = useDevicePermissions();

  // Determine which steps are relevant based on device capabilities
  const isCameraAvailable = permissions.camera !== "unavailable";
  const isLocationAvailable = permissions.location !== "unavailable";
  const isVibrationAvailable = permissions.vibration !== "unavailable";
  const hasInstallPrompt = installPrompt !== null || isMobile();

  // Build ordered list of pending steps (excluding visited/skipped ones)
  const getPendingSteps = useCallback((): OnboardingStep[] => {
    const steps: OnboardingStep[] = [];

    if (
      (permissions.notifications === "prompt" ||
        permissions.notifications === "unknown") &&
      !visitedSteps.has("notifications")
    ) {
      steps.push("notifications");
    }
    if (isCameraAvailable && permissions.camera === "prompt" && !visitedSteps.has("camera")) {
      steps.push("camera");
    }
    if (isLocationAvailable && permissions.location === "prompt" && !visitedSteps.has("location")) {
      steps.push("location");
    }
    if (isVibrationAvailable && permissions.vibration === "prompt" && !visitedSteps.has("vibration")) {
      steps.push("vibration");
    }
    if (hasInstallPrompt && !isInstalled && !visitedSteps.has("install")) {
      steps.push("install");
    }
    if (steps.length === 0) {
      steps.push("success");
    }

    return steps;
  }, [permissions, isCameraAvailable, isLocationAvailable, isVibrationAvailable, hasInstallPrompt, isInstalled, visitedSteps]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dismissed) return;

    const pending = getPendingSteps();
    // Only show if there are actually permissions to request
    if (pending.length === 0 || (pending.length === 1 && pending[0] === "success")) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setStep(pending[0]);

    const onBeforeInstall = (e: Event) => {
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [dismissed, getPendingSteps]);

  const advanceToNextStep = useCallback(() => {
    // Mark current step as visited so it won't appear as pending
    setVisitedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
    const pending = getPendingSteps();
    const currentIndex = pending.indexOf(step);
    if (currentIndex < pending.length - 1) {
      setStep(pending[currentIndex + 1]);
    } else {
      // All done
      setStep("success");
    }
  }, [getPendingSteps, step]);

  const handleEnableNotifications = async () => {
    setRequesting(true);
    try {
      const result = await requestNotification();
      if (result === "granted") {
        advanceToNextStep();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleEnableCamera = async () => {
    setRequesting(true);
    try {
      const result = await requestCamera();
      if (result === "granted") {
        advanceToNextStep();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleEnableLocation = async () => {
    setRequesting(true);
    try {
      const result = await requestLocation();
      if (result === "granted") {
        advanceToNextStep();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleEnableVibration = () => {
    confirmVibration();
    advanceToNextStep();
  };

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        advanceToNextStep();
      }
    } else {
      // Manual guide for iOS or unsupported
      window.alert(
        "To install: Tap Share / Menu and select 'Add to Home Screen'",
      );
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("cmms:onboarding-dismissed", "true");
    setVisible(false);
  };

  const handleSkip = () => {
    // Mark current permission as skipped and advance
    switch (step) {
      case "notifications":
        // Can't skip notifications — it's optional, just advance
        advanceToNextStep();
        break;
      case "camera":
        skipCamera();
        advanceToNextStep();
        break;
      case "location":
        skipLocation();
        advanceToNextStep();
        break;
      case "vibration":
        skipVibration();
        advanceToNextStep();
        break;
      case "install":
        advanceToNextStep();
        break;
      default:
        break;
    }
  };

  const getStepIcon = () => {
    const icons: Record<OnboardingStep, typeof Bell> = {
      notifications: Bell,
      camera: Camera,
      location: MapPin,
      vibration: Zap,
      install: Download,
      success: ShieldCheck,
    };
    return icons[step];
  };

  const getStepConfig = (): StepConfig => {
    const configs: Record<OnboardingStep, StepConfig> = {
      notifications: {
        id: "notifications",
        icon: Bell,
        title: "Stay Informed",
        description:
          "Enable notifications to get real-time updates on work orders and critical plant alerts.",
        buttonLabel: "Enable Notifications",
      },
      camera: {
        id: "camera",
        icon: Camera,
        title: "Scan with Camera",
        description:
          "Allow camera access to scan QR codes on assets, capture images for work orders, and speed up inspections.",
        buttonLabel: "Allow Camera Access",
        skipLabel: "Skip",
      },
      location: {
        id: "location",
        icon: MapPin,
        title: "Enable Location",
        description:
          "Share your location to enable GPS-based asset tracking, geotagging for field reports, and nearby work order suggestions.",
        buttonLabel: "Share Location",
        skipLabel: "Skip",
      },
      vibration: {
        id: "vibration",
        icon: Zap,
        title: "Haptic Feedback",
        description:
          "Enable subtle vibration feedback for QR scan confirmations, task completions, and critical alerts — feels more responsive.",
        buttonLabel: "Enable Vibration",
        skipLabel: "No thanks",
      },
      install: {
        id: "install",
        icon: Download,
        title: "Take it with you",
        description:
          "Install the CMMS app on your home screen for a faster, full-screen industrial experience with offline support.",
        buttonLabel: "Install App",
      },
      success: {
        id: "success",
        icon: ShieldCheck,
        title: "You're all set!",
        description:
          "Your device is optimized. You'll receive updates, can scan QR codes, and access the app anytime.",
        buttonLabel: "Finish Setup",
      },
    };
    return configs[step];
  };

  if (!visible || dismissed) return null;

  const Icon = getStepIcon();
  const config = getStepConfig();

  // Calculate progress
  const pendingSteps = getPendingSteps();
  const currentStepIndex = pendingSteps.indexOf(step);

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[100] mx-auto max-w-lg">
      <Card className="overflow-hidden border-none bg-card/40 shadow-2xl backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <CardContent className="relative p-6">
          <button
            onClick={handleDismiss}
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-5">
            <div
              className={`
                flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1
                ${step === "success"
                  ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                  : "bg-primary/10 text-primary ring-primary/20"
                }
              `}
            >
              <Icon className="h-6 w-6" />
            </div>

            <div className="flex-1 space-y-1">
              <h3 className="text-lg font-bold tracking-tight">{config.title}</h3>
              <p className="text-sm text-muted-foreground">{config.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {step === "notifications" && (
                  <Button
                    onClick={handleEnableNotifications}
                    disabled={requesting}
                    className="gap-2 shadow-lg shadow-primary/20"
                  >
                    {requesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {config.buttonLabel}
                  </Button>
                )}

                {step === "camera" && (
                  <Button
                    onClick={handleEnableCamera}
                    disabled={requesting}
                    className="gap-2 shadow-lg shadow-primary/20"
                  >
                    {requesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {config.buttonLabel}
                  </Button>
                )}

                {step === "location" && (
                  <Button
                    onClick={handleEnableLocation}
                    disabled={requesting}
                    className="gap-2 shadow-lg shadow-primary/20"
                  >
                    {requesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    {config.buttonLabel}
                  </Button>
                )}

                {step === "vibration" && (
                  <Button
                    onClick={handleEnableVibration}
                    className="gap-2 shadow-lg shadow-primary/20"
                  >
                    <Zap className="h-4 w-4" />
                    {config.buttonLabel}
                  </Button>
                )}

                {step === "install" && (
                  <Button
                    onClick={handleInstall}
                    className="gap-2 shadow-lg shadow-primary/20"
                  >
                    <Smartphone className="h-4 w-4" />
                    {config.buttonLabel}
                  </Button>
                )}

                {step === "success" && (
                  <Button
                    onClick={handleDismiss}
                    variant="outline"
                    className="gap-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10"
                  >
                    <Check className="h-4 w-4" />
                    {config.buttonLabel}
                  </Button>
                )}

                {step !== "success" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                    className="gap-1 text-muted-foreground"
                  >
                    {config.skipLabel || "Maybe later"}
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {pendingSteps.length > 1 && (
            <div className="mt-6 flex items-center gap-2">
              {pendingSteps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    i <= currentStepIndex
                      ? s === "success"
                        ? "bg-emerald-500"
                        : "bg-primary"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
