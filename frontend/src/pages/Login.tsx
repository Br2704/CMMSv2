import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buildBrandingLogoUrlByCode, buildBrandingManifestUrl } from "@/api/branding";
import { ApiError, clearSessionBootstrapHint, clearStoredAccessToken } from "@/api/http";
import { login } from "@/api/auth";
import { useAuthStore, fetchUserProfile, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";
import { Eye, EyeOff, LogIn, Factory, ShieldCheck, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import tamoptixLogo from "@/assets/tamoptix-logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plantCode, setPlantCode] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState<{ question: string; token: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setSession, setUser, setActivePlant } = useAuthStore();
  const resetBranding = useBrandingStore((state) => state.reset);
  const primeBranding = useBrandingStore((state) => state.primeFromSeed);
  const browserTitle = useBrandingStore((state) => state.browserTitle);
  const brandColor = useBrandingStore((state) => state.brandColor);
  const { toast } = useToast();
  const localFavicon = "/icons/icon-192x192.png";
  const jkFennerLogo = buildBrandingLogoUrlByCode("JKF", null, 512);
  const returnTo = useMemo(() => {
    const candidate = searchParams.get("returnTo") || "";
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return null;
    }
    return candidate;
  }, [searchParams]);

  useEffect(() => {
    resetBranding();
  }, [resetBranding]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;

    const resolvedTitle = browserTitle || "JK Fenner CMMS";
    document.title = resolvedTitle;

    const updateMetaContent = (selector: string, value: string) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      if (element) {
        element.setAttribute("content", value);
      }
    };

    updateMetaContent('meta[name="application-name"]', resolvedTitle);
    updateMetaContent('meta[name="apple-mobile-web-app-title"]', resolvedTitle);
    updateMetaContent('meta[name="title"]', resolvedTitle);
    updateMetaContent('meta[name="theme-color"]', brandColor || "#0f172a");
    updateMetaContent('meta[name="msapplication-TileColor"]', brandColor || "#0f172a");

    const ensureLink = (rel: string, id?: string) => {
      let element = id
        ? document.querySelector<HTMLLinkElement>(`#${id}`)
        : document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.rel = rel;
        if (id) element.id = id;
        document.head.appendChild(element);
      }
      element.href = localFavicon;
      return element;
    };

    ensureLink("icon");
    ensureLink("shortcut icon");
    ensureLink("apple-touch-icon", "dynamic-apple-touch-icon").href = localFavicon;
    ensureLink("manifest", "dynamic-manifest-link").href = buildBrandingManifestUrl(null, null);
  }, [brandColor, browserTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const me = await login({
        email: email.trim(),
        password,
        captchaToken: captchaChallenge?.token,
        captchaAnswer: captchaAnswer.trim() || undefined,
        mfaCode: mfaCode.trim() || undefined,
      });
      const profile = await fetchUserProfile();

      if (!profile || !me.user) {
        clearStoredAccessToken();
        clearSessionBootstrapHint();
        setError("User profile not found. Contact admin.");
        setIsLoading(false);
        return;
      }

      if (!profile.isActive) {
        clearStoredAccessToken();
        clearSessionBootstrapHint();
        setError("Your account has been deactivated. Contact admin.");
        setIsLoading(false);
        return;
      }

      setCaptchaChallenge(null);
      setCaptchaAnswer("");
      setMfaRequired(false);
      setMfaCode("");
      setSession({
        accessToken: null,
        user: { id: me.user.id },
      });

      const brandingSeed = {
        organizationId: profile.organizationId ?? null,
        organizationName: profile.organizationName ?? null,
        organizationLogoUrl: profile.organizationLogoUrl ?? null,
        sidebarTitle: profile.organizationName ?? null,
        browserTitle: profile.organizationName ? `${profile.organizationName} CMMS` : null,
      };
      const hasGlobalPlantAccess = isSuperAdmin(profile) || isRootAdmin(profile);

      if (hasGlobalPlantAccess) {
        primeBranding(brandingSeed);
        setUser(profile);
        setActivePlant(null, null, null);
        toast({ title: "Welcome!", description: "You have global access to all plants." });
        navigate(returnTo || "/");
        setIsLoading(false);
        return;
      }

      if (!plantCode.trim()) {
        clearStoredAccessToken();
        clearSessionBootstrapHint();
        setError("Plant Code is required for your account.");
        setIsLoading(false);
        return;
      }

      const normalizedPlantCode = plantCode.trim().toUpperCase();
      const assignedPlantCode = profile.plantCode?.toUpperCase();
      if (!assignedPlantCode || assignedPlantCode !== normalizedPlantCode) {
        clearStoredAccessToken();
        clearSessionBootstrapHint();
        setError("Invalid Plant Code for your account.");
        setIsLoading(false);
        return;
      }

      primeBranding(brandingSeed);
      setUser(profile);
      setActivePlant(profile.plantId, profile.plantCode, profile.plantName);
      toast({ title: "Welcome back!", description: `Logged in to ${profile.plantName || "assigned plant"}` });
      navigate(returnTo || "/");
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = (err.payload ?? {}) as {
          code?: string;
          details?: {
            code?: string;
            captcha?: { question?: string; token?: string };
          };
        };
        const code = payload.code ?? payload.details?.code;
        const captcha = payload.details?.captcha;
        if (captcha?.question && captcha?.token) {
          setCaptchaChallenge({ question: captcha.question, token: captcha.token });
        }
        if (code === "MFA_REQUIRED") {
          setMfaRequired(true);
        }
        if (code === "MFA_RESET_REQUIRED" || code === "AUTH_DEPENDENCY_ERROR") {
          setMfaRequired(false);
        }
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8fb] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(13,148,136,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),transparent_32%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_48%,_#eef4f8_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
      <div className="pointer-events-none absolute -left-16 top-16 h-56 w-56 rounded-full bg-teal-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-cyan-100/70 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg"
      >
        <Card className="overflow-hidden border border-slate-200/90 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
          <div className="border-b border-slate-200/90 bg-gradient-to-r from-white via-teal-50/70 to-cyan-50/80 px-6 py-4">
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <span className="inline-flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Secure CMMS Access
              </span>
              <span className="inline-flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4 text-slate-500" />
                JK Fenner
              </span>
            </div>
          </div>

          <CardHeader className="space-y-5 pb-3 pt-6">
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
            >
              <div className="w-full max-w-sm space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-6 py-5 shadow-sm">
                  <img
                    src={jkFennerLogo}
                    alt="JK Fenner Logo"
                    className="mx-auto h-16 w-auto object-contain"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = tamoptixLogo;
                    }}
                  />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="space-y-1 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-2xl font-bold text-foreground">Maintenance Operations Portal</h1>
            </motion.div>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Label htmlFor="plantCode" className="flex items-center gap-2 font-medium text-foreground">
                  <Factory className="h-4 w-4 text-primary" />
                  Plant Code
                </Label>
                <Input
                  id="plantCode"
                  type="text"
                  placeholder="Enter your plant code"
                  value={plantCode}
                  onChange={(e) => setPlantCode(e.target.value.toUpperCase())}
                  className="h-12 border-input bg-background font-mono uppercase tracking-wider focus:border-primary"
                  autoComplete="off"
                />
              </motion.div>

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Label htmlFor="email" className="font-medium text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 border-input bg-background focus:border-primary"
                  required
                  autoComplete="email"
                />
              </motion.div>

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
              >
                <Label htmlFor="password" className="font-medium text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-input bg-background pr-12 focus:border-primary"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 min-h-0 min-w-0 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </motion.div>

              {captchaChallenge ? (
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.37 }}
                >
                  <Label htmlFor="captcha" className="font-medium text-foreground">
                    Verification Challenge
                  </Label>
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm font-medium text-foreground">
                    {captchaChallenge.question}
                  </div>
                  <Input
                    id="captcha"
                    type="text"
                    placeholder="Enter the answer"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    className="h-12 border-input bg-background focus:border-primary"
                    autoComplete="off"
                  />
                </motion.div>
              ) : null}

              {mfaRequired ? (
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.39 }}
                >
                  <Label htmlFor="mfaCode" className="font-medium text-foreground">
                    MFA Code
                  </Label>
                  <Input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit authenticator code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-12 border-input bg-background text-center font-mono tracking-[0.4em] focus:border-primary"
                    autoComplete="one-time-code"
                  />
                </motion.div>
              ) : null}

              {error ? (
                <motion.div
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <p className="text-center text-sm font-medium text-destructive">{error}</p>
                </motion.div>
              ) : null}

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <Button
                  type="submit"
                  className="gradient-primary h-12 w-full text-base font-semibold transition-opacity hover:opacity-90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <LogIn className="h-5 w-5" />
                      Sign In
                    </span>
                  )}
                </Button>
              </motion.div>
            </form>

            <motion.div
              className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex items-center gap-3">
                  <img src={tamoptixLogo} alt="TamOptiX Logo" className="h-8 w-auto object-contain" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Powered by TamOptiX</p>
                    <p className="text-sm text-slate-600">Smart maintenance technology for connected plants.</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Computerized Maintenance Management System</p>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
