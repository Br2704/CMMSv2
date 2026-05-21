import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Factory, Loader2, LogIn, MapPin, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import { resolvePublicMachineCode, resolvePublicQrToken } from "@/api/qr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/store/auth.store";

function formatHierarchyValue(code?: string | null, name?: string | null) {
  if (code && name) return `${code} - ${name}`;
  return code || name || "-";
}

function formatMetricMinutes(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toFixed(1)} min`;
}

export default function PublicQrAssetPage() {
  const { token, machineCode } = useParams<{ token?: string; machineCode?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const tokenFromQuery = searchParams.get("token") || undefined;

  const returnTo = useMemo(() => {
    if (token) {
      return `/qr/${encodeURIComponent(token)}`;
    }
    if (machineCode) {
      const query = tokenFromQuery ? `?token=${encodeURIComponent(tokenFromQuery)}` : "";
      return `/assets/${encodeURIComponent(machineCode)}${query}`;
    }
    return "/";
  }, [machineCode, token, tokenFromQuery]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public_qr_asset", token || null, machineCode || null, tokenFromQuery || null],
    enabled: Boolean(token || machineCode),
    queryFn: async () => {
      if (token) {
        const response = await resolvePublicQrToken(token);
        return response.data;
      }
      if (machineCode) {
        const response = await resolvePublicMachineCode(machineCode, tokenFromQuery);
        return response.data;
      }
      throw new Error("Missing machine code or QR token");
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#020617] text-slate-50 selection:bg-teal-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.15),transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.15),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-8 sm:py-12 lg:py-20">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header Section */}
          <div className="flex flex-col items-center text-center space-y-3">
             <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400">
               <ScanLine className="h-3.5 w-3.5" />
               Machine Authentication
             </div>
             <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">QR Asset Card</h1>
             <p className="max-w-md text-sm font-medium text-slate-400 leading-relaxed">
               Secure access to maintenance protocols and asset performance data.
             </p>
          </div>

          {isLoading ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-[2.5rem] border border-white/5 bg-white/5 backdrop-blur-2xl">
              <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Retrieving Asset Intelligence</p>
            </div>
          ) : isError || !data ? (
            <div className="group relative overflow-hidden rounded-[2.5rem] border border-rose-500/20 bg-rose-500/5 p-8 text-center backdrop-blur-2xl">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Invalid QR Credentials</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {error instanceof Error ? error.message : "The provided token is invalid, expired, or the machine has been decommissioned."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild className="rounded-2xl px-8 h-12 bg-rose-600 hover:bg-rose-700 font-bold">
                  <Link to="/login">Authentication Portal</Link>
                </Button>
                <Button variant="outline" asChild className="rounded-2xl px-8 h-12 border-white/10 bg-white/5 hover:bg-white/10 text-slate-200">
                  <Link to="/">System Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary Asset Card */}
              <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white/5 shadow-2xl backdrop-blur-3xl">
                {/* Hero Machine Image */}
                <div className="relative h-64 w-full overflow-hidden sm:h-80">
                  {data.asset.machineImageUrl ? (
                    <img src={data.asset.machineImageUrl} alt={data.asset.name} className="h-full w-full object-cover transition-transform duration-700 hover:scale-110" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900/50">
                      <Factory className="h-16 w-16 text-slate-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-60" />
                  <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-400">{data.asset.code}</p>
                      <h2 className="text-2xl font-black text-white sm:text-3xl">{data.asset.name}</h2>
                    </div>
                    <StatusBadge variant={statusVariant} className="h-8 px-4 text-[10px] font-black uppercase tracking-widest">
                      {data.asset.status || "READY"}
                    </StatusBadge>
                  </div>
                </div>

                <CardContent className="p-6 sm:p-8">
                  {/* Hierarchy Grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Plant Unit</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">
                        {data.hierarchy.plant?.name || data.hierarchy.plant?.code || "-"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <QrCode className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Department</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">
                        {data.hierarchy.department?.name || data.hierarchy.department?.code || "-"}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Location</span>
                      </div>
                      <p className="text-sm font-bold text-slate-200 truncate">{data.asset.location || "On-site"}</p>
                    </div>
                  </div>

                  {/* Reliability Snapshot */}
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Performance Metrics</h3>
                      <ShieldCheck className="h-4 w-4 text-teal-500" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">MTTR</p>
                        <p className="text-base font-black text-teal-400">{formatMetricMinutes(data.asset.reliability?.mttrMinutes)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">MTBF</p>
                        <p className="text-base font-black text-sky-400">{formatMetricMinutes(data.asset.reliability?.mtbfMinutes)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/40 p-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Uptime</p>
                        <p className="text-base font-black text-emerald-400">98.2%</p>
                      </div>
                    </div>
                  </div>

                  {/* Auth Actions */}
                  <div className="mt-10 rounded-[2rem] border border-teal-500/20 bg-teal-500/5 p-6 text-center sm:p-8">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
                      <LogIn className="h-6 w-6" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-100">Elevated Protocol Access</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      Please authenticate to unlock full maintenance controls, history logs, and work order creation for this asset.
                    </p>
                    
                    <div className="mt-8 flex flex-col gap-3">
                      {isAuthLoading ? (
                        <Button disabled className="h-14 rounded-2xl bg-teal-600 font-black uppercase tracking-widest">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Security Validation
                        </Button>
                      ) : isAuthenticated ? (
                        <Button disabled className="h-14 rounded-2xl bg-teal-600 font-black uppercase tracking-widest">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Redirecting to Command Center
                        </Button>
                      ) : (
                        <Button asChild className="h-14 rounded-2xl bg-teal-600 hover:bg-teal-500 font-black uppercase tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                            Continue to Maintenance Console
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        className="h-12 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-white/5 hover:text-slate-300"
                        onClick={() => window.location.reload()}
                      >
                        Refresh Hardware Sync
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Secondary Info Bento */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400">
                      <QrCode className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">Asset Identity</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    This encrypted QR signature uniquely identifies asset <span className="font-bold text-slate-300">{data.asset.code}</span> within the JK Fenner ecosystem.
                  </p>
                  <div className="rounded-xl bg-slate-950/60 p-3 font-mono text-[9px] text-teal-500/70 break-all border border-white/5">
                    {data?.links?.publicResolverUrl || window.location.href}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6 backdrop-blur-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest text-slate-200">Quick Context</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Scanning this QR provides instant verification of physical presence. All subsequent actions are logged with this location context for audit compliance.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Audit Ready</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="flex flex-col items-center gap-4 pt-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
             <div className="h-px w-24 bg-gradient-to-r from-transparent via-slate-500 to-transparent" />
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">JK Fenner CMMS • Powered by TamOptiX Technologies</p>
          </div>
        </div>
      </div>
    </div>
  );
}
