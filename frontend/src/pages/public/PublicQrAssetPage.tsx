import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Factory, Loader2, LogIn, MapPin, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import { resolvePublicQrToken } from "@/api/qr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/store/auth.store";

function formatHierarchyValue(code?: string | null, name?: string | null) {
  if (code && name) return `${code} - ${name}`;
  return code || name || "-";
}

export default function PublicQrAssetPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const returnTo = token ? `/qr/${encodeURIComponent(token)}` : "/";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public_qr_asset", token],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing QR token");
      }
      const response = await resolvePublicQrToken(token);
      return response.data;
    },
    retry: false,
  });

  const statusVariant = useMemo(() => {
    if (data?.asset.status === "ACTIVE") return "active" as const;
    if (data?.asset.status === "UNDER_MAINTENANCE") return "in_progress" as const;
    if (data?.asset.status) return "warning" as const;
    return "default" as const;
  }, [data?.asset.status]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !data?.asset.id) return;
    navigate(`/assets?assetId=${encodeURIComponent(data.asset.id)}&view=1&from=qr`, { replace: true });
  }, [data?.asset.id, isAuthenticated, isAuthLoading, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.24),transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.22),transparent_28%),linear-gradient(160deg,_#020617_0%,_#0f172a_52%,_#111827_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:48px_48px] opacity-35" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-white/10 bg-white/8 text-slate-50 shadow-[0_30px_90px_rgba(15,23,42,0.45)] backdrop-blur-xl">
            <CardHeader className="space-y-4 border-b border-white/10 pb-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
                <ScanLine className="h-4 w-4" />
                QR Asset Resolver
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold tracking-tight">Machine Access Link</CardTitle>
                <p className="max-w-xl text-sm leading-6 text-slate-300">
                  This QR link opens the selected machine inside the CMMS webapp. Users on the same network can open this page and continue into maintenance actions after sign-in.
                </p>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-6">
              {isLoading ? (
                <div className="flex min-h-[280px] items-center justify-center gap-3 text-slate-300">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading machine details...
                </div>
              ) : isError || !data ? (
                <div className="space-y-4 rounded-3xl border border-rose-400/25 bg-rose-500/10 p-5">
                  <div className="flex items-center gap-3 text-rose-200">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="text-base font-semibold">QR link is not available</p>
                  </div>
                  <p className="text-sm text-slate-300">
                    {error instanceof Error ? error.message : "The QR token is invalid or no longer active."}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link to="/login">Go to Login</Link>
                    </Button>
                    <Button variant="outline" asChild className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                      <Link to="/">Open Home</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{data.asset.code}</p>
                        <h1 className="mt-2 text-2xl font-semibold">{data.asset.name}</h1>
                        <p className="mt-2 text-sm text-slate-300">{data.asset.assetType || "Machine"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge variant={statusVariant}>{data.asset.status || "READY"}</StatusBadge>
                        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
                          QR ID: {data.asset.qrCodeId || "-"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <Factory className="h-4 w-4 text-cyan-300" />
                        Plant
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {formatHierarchyValue(data.hierarchy.plant?.code, data.hierarchy.plant?.name)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <Building2 className="h-4 w-4 text-teal-300" />
                        Department
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {formatHierarchyValue(data.hierarchy.department?.code, data.hierarchy.department?.name)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <QrCode className="h-4 w-4 text-violet-300" />
                        Module
                      </div>
                      <p className="mt-2 text-sm text-slate-300">
                        {formatHierarchyValue(data.hierarchy.module?.code, data.hierarchy.module?.name)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <MapPin className="h-4 w-4 text-amber-300" />
                        Location
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{data.asset.location || "-"}</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-teal-400/12 via-sky-400/8 to-transparent p-5">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 text-teal-300" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-slate-100">Continue inside CMMS</p>
                        <p className="text-sm leading-6 text-slate-300">
                          {isAuthenticated
                            ? "Opening the asset details view inside CMMS so you can review this machine and continue with maintenance actions."
                            : "Sign in from this device to open the asset details view, raise work orders, or continue maintenance actions."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {isAuthLoading ? (
                        <Button disabled className="gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking session
                        </Button>
                      ) : isAuthenticated ? (
                        <Button disabled className="gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Opening Asset Details
                        </Button>
                      ) : (
                        <Button asChild>
                          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                            <LogIn className="h-4 w-4" />
                            Sign In To Continue
                          </Link>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        className="text-slate-200 hover:bg-white/10 hover:text-white"
                        onClick={() => window.open(data.links?.publicResolverUrl || window.location.href, "_self")}
                      >
                        Refresh QR Page
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/8 text-slate-50 backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Shared Network Link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-300">
                  This QR route is now intended for users on the same network instead of a `localhost`-only browser session.
                </p>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-xs leading-6 text-slate-300">
                  {data?.links?.publicResolverUrl || window.location.href}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/8 text-slate-50 backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <p>Use this link from another phone, tablet, or workstation on the same Wi-Fi/LAN to reach the selected machine directly.</p>
                <p>After sign-in, the user is taken directly into the asset details view and can raise a work order without reselecting the machine hierarchy.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
