import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Smartphone, 
  Download, 
  Check, 
  Wifi, 
  Bell, 
  Zap,
  Share,
  Plus,
  ChevronDown,
  Apple,
  Monitor,
} from "lucide-react";
import tamoptixLogo from "@/assets/tamoptix-logo.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const features = [
    { icon: Wifi, title: "Works Offline", description: "Access your data even without internet" },
    { icon: Bell, title: "Push Notifications", description: "Get notified about critical events" },
    { icon: Zap, title: "Fast & Responsive", description: "Native-like performance on any device" },
    { icon: Smartphone, title: "Home Screen Access", description: "Launch the app with a single tap" },
  ];

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="flex justify-center"
          >
            <img src={tamoptixLogo} alt="TamOptiX CMMS Platform" className="h-16 sm:h-20" />
          </motion.div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Install TamOptiX CMMS Platform
            </h1>
            <p className="text-muted-foreground mt-2">
              Get the best experience with our mobile app
            </p>
          </div>
        </div>

        {/* Install Status Card */}
        <Card className="shadow-card">
          <CardContent className="p-6 text-center">
            {isInstalled ? (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="space-y-4"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <Check className="h-8 w-8 text-success" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-success">App Installed!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You can now access TamOptiX CMMS Platform from your home screen
                  </p>
                </div>
              </motion.div>
            ) : isIOS ? (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Apple className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Install on iOS</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Follow these steps to install the app
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowIOSInstructions(!showIOSInstructions)}
                  className="w-full gap-2"
                >
                  {showIOSInstructions ? "Hide" : "Show"} Instructions
                  <ChevronDown className={`h-4 w-4 transition-transform ${showIOSInstructions ? "rotate-180" : ""}`} />
                </Button>
                {showIOSInstructions && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-3 text-left text-sm"
                  >
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</div>
                      <div>
                        <p className="font-medium">Tap the Share button</p>
                        <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Share className="h-4 w-4" /> at the bottom of Safari
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</div>
                      <div>
                        <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
                        <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Plus className="h-4 w-4" /> Add to Home Screen
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</div>
                      <div>
                        <p className="font-medium">Tap "Add" to confirm</p>
                        <p className="text-muted-foreground mt-0.5">The app icon will appear on your home screen</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : deferredPrompt ? (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Download className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Ready to Install</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add TamOptiX CMMS Platform to your home screen
                  </p>
                </div>
                <Button onClick={handleInstall} className="w-full gap-2 gradient-primary text-primary-foreground shadow-glow">
                  <Download className="h-4 w-4" />
                  Install App
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Monitor className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Desktop Browser</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Visit this page on your mobile device to install the app, or use the browser's install option
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">App Features</CardTitle>
            <CardDescription>Why install the mobile app?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col items-center text-center p-3 rounded-lg bg-muted/50"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="font-medium text-sm">{feature.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
