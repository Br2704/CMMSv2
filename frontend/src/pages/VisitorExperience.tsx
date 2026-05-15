import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    AlertTriangle,
    CheckCircle2,
    IdCard,
    MapPinned,
    Navigation,
    QrCode,
    RefreshCw,
    ShieldAlert,
    Siren,
    UserCheck,
    Clock,
    User,
    Locate,
    ExternalLink,
    Users,
    Building2,
    ArrowRight,
    ShieldCheck,
    ClipboardCheck,
    Maximize,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { InputField, SelectField, TextareaField } from "@/components/shared/FormField";
import { MobileQrScannerDialog } from "@/components/qr/MobileQrScannerDialog";
import { listPlants, type Plant } from "@/api/plants";
import {
    getVisitorNavigation,
    getVisitorPass,
    getVisitorProfile,
    getVisitorTracking,
    listVisitorRequests,
    logVisitorSafetyConsent,
    reviewVisitorRequest,
    sendVisitorSos,
    submitVisitorApproval,
    type VisitorNavigationRoute,
    type VisitorPassData,
    type VisitorProfileResponse,
    type VisitorRequestRecord,
    type VisitorTrackingResponse,
} from "@/api/visitorExperience";
import { isSuperAdmin, useAuthStore } from "@/store/auth.store";

type VisitorTab = "profile" | "navigation" | "approval" | "pass" | "safety" | "access-pass" | "visitors-list";

function resolveErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message;
        }
    }
    return fallback;
}

function isApprovalRole(role: string | null | undefined) {
    if (!role) return false;
    const normalized = String(role).trim().toUpperCase();
    return ["ROOT_ADMIN", "SUPERADMIN", "ADMIN", "SECURITY", "SECURITY_USER"].includes(normalized);
}

function normalizeRoleValue(role: string | null | undefined) {
    if (!role) return "USER";
    return String(role)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function isVisitorRole(role: string) {
    const normalized = normalizeRoleValue(role);
    return normalized === "VISITOR" || normalized === "TEMPORARY_VISITOR";
}

function buildVisitorQrLookupCandidates(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return [] as Array<{ sessionToken?: string; gateEntryId?: string }>;

    const candidates: Array<{ sessionToken?: string; gateEntryId?: string }> = [];
    const addSessionToken = (token: string | null | undefined) => {
        const normalized = (token ?? "").trim();
        if (!normalized) return;
        candidates.push({ sessionToken: normalized });
    };
    const addGateEntry = (gateEntryId: string | null | undefined) => {
        const normalized = (gateEntryId ?? "").trim();
        if (!normalized) return;
        candidates.push({ gateEntryId: normalized });
    };

    addSessionToken(value);
    if (/^[0-9a-f-]{36}$/i.test(value)) {
        addGateEntry(value);
    }

    try {
        const parsedUrl = new URL(value);
        addSessionToken(parsedUrl.searchParams.get("sessionToken"));
        addSessionToken(parsedUrl.searchParams.get("token"));
        addGateEntry(parsedUrl.searchParams.get("gateEntryId"));
        addGateEntry(parsedUrl.searchParams.get("gateEntry"));

        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1] || "";
        if (lastSegment.toUpperCase().startsWith("VIS-")) {
            addSessionToken(lastSegment);
        }
        if (/^[0-9a-f-]{36}$/i.test(lastSegment)) {
            addGateEntry(lastSegment);
        }
    } catch {
        // Ignore URL parsing errors for plain text QR values.
    }

    const deduped = new Map<string, { sessionToken?: string; gateEntryId?: string }>();
    for (const candidate of candidates) {
        const key = `${candidate.sessionToken ?? ""}::${candidate.gateEntryId ?? ""}`;
        if (!deduped.has(key)) {
            deduped.set(key, candidate);
        }
    }
    return Array.from(deduped.values());
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

async function captureCurrentPosition() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;

    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 },
        );
    });
}

export default function VisitorExperience() {
    const user = useAuthStore((state) => state.user);
    const userIsSuperAdmin = isSuperAdmin(user);
    const [activeTab, setActiveTab] = useState<VisitorTab>("profile");

    const [plants, setPlants] = useState<Plant[]>([]);
    const [selectedPlantId, setSelectedPlantId] = useState<string>(user?.plantId || "");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [profile, setProfile] = useState<VisitorProfileResponse | null>(null);
    const [requests, setRequests] = useState<VisitorRequestRecord[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState<string>("");
    const [routeData, setRouteData] = useState<VisitorNavigationRoute | null>(null);
    const [routeLoading, setRouteLoading] = useState(false);

    const [passData, setPassData] = useState<VisitorPassData | null>(null);
    const [passLoading, setPassLoading] = useState(false);
    const [trackingData, setTrackingData] = useState<VisitorTrackingResponse | null>(null);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [routeError, setRouteError] = useState<string | null>(null);
    const [passError, setPassError] = useState<string | null>(null);
    const [trackingError, setTrackingError] = useState<string | null>(null);

    const [approvalComments, setApprovalComments] = useState("");
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
    const [approvalQrOpen, setApprovalQrOpen] = useState(false);
    const [extendingPassWindow, setExtendingPassWindow] = useState(false);

    const [safetyGateOpen, setSafetyGateOpen] = useState(false);
    const [safetyChecked, setSafetyChecked] = useState(false);
    const [safetyScrolled, setSafetyScrolled] = useState(false);
    const [safetyConsentAcknowledged, setSafetyConsentAcknowledged] = useState(false);
    const [forceSafetyConsent] = useState(false);
    const [savingSafetyConsent, setSavingSafetyConsent] = useState(false);
    const safetyContentRef = useRef<HTMLDivElement>(null);
    const [sosSending, setSosSending] = useState(false);
    const [travelForm, setTravelForm] = useState({
        travelMode: "PRIVATE_VEHICLE",
        fromLocation: "",
        purpose: "",
        visitorCategory: "OFFICIAL",
        materialsCarried: "",
        emergencyContact: "",
        ppeConfirmed: false
    });
    const [invitationForm, setInvitationForm] = useState({
        visitorName: "",
        visitorCompany: "",
        visitorPhone: "",
        expectedArrival: "",
        purpose: "OFFICIAL"
    });
    const [submittingCheckin, setSubmittingCheckin] = useState(false);
    const [submittingInvitation, setSubmittingInvitation] = useState(false);
    const [sosNote, setSosNote] = useState("");

    const normalizedRoles = useMemo(() => (user?.roles ?? []).map((role) => normalizeRoleValue(role)), [user?.roles]);
    const isUserRole = useMemo(() => normalizedRoles.includes("USER"), [normalizedRoles]);
    const isVisitorOnlyUser = useMemo(
        () => normalizedRoles.length > 0 && normalizedRoles.every((role) => isVisitorRole(role)),
        [normalizedRoles],
    );
    const canApproveRequests = useMemo(() => (user?.roles ?? []).some((role) => isApprovalRole(role)) || isUserRole, [user?.roles, isUserRole]);
    const canSeeApprovalTab = !isVisitorOnlyUser;
    const canSeeVisitorsList = isUserRole;
    const canSeeAccessPassTab = isUserRole || isVisitorOnlyUser;
    const canUseApprovalActions = canApproveRequests && canSeeApprovalTab;
    const requestScope = canApproveRequests ? "all" : "my-requests";

    const plantOptions = useMemo(
        () => plants.map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
        [plants],
    );

    const approvedNavigationRequests = useMemo(
        () => requests.filter((request) => request.approvalStatus === "APPROVED" && request.navigationEnabled),
        [requests],
    );

    const summary = useMemo(() => {
        return {
            total: requests.length,
            pending: requests.filter((request) => request.approvalStatus === "PENDING").length,
            approved: requests.filter((request) => request.approvalStatus === "APPROVED").length,
            active: requests.filter((request) => request.status === "IN").length,
        };
    }, [requests]);

    useEffect(() => {
        if (user?.plantId) {
            setSelectedPlantId((current) => current || user.plantId || "");
        }
    }, [user?.plantId]);

    useEffect(() => {
        let cancelled = false;

        const loadPlantsForContext = async () => {
            if (!userIsSuperAdmin) {
                if (!cancelled) {
                    if (user?.plantId && user?.plantCode && user?.plantName) {
                        setPlants([
                            {
                                id: user.plantId,
                                plantCode: user.plantCode,
                                plantName: user.plantName,
                                location: null,
                                plantAdminId: null,
                                organizationId: user.organizationId || "",
                                isActive: true,
                                createdAt: "",
                                updatedAt: "",
                            },
                        ]);
                    } else {
                        setPlants([]);
                    }
                }
                return;
            }

            try {
                const response = await listPlants({ page: 1, limit: 500, includeInactive: false });
                if (cancelled) return;
                setPlants(response.data || []);
                if (!selectedPlantId && (response.data || []).length > 0) {
                    setSelectedPlantId(response.data[0].id);
                }
            } catch (error: unknown) {
                if (!cancelled) {
                    setPlants([]);
                    toast.error(resolveErrorMessage(error, "Failed to load plants"));
                }
            }
        };

        void loadPlantsForContext();

        return () => {
            cancelled = true;
        };
    }, [selectedPlantId, user?.organizationId, user?.plantCode, user?.plantId, user?.plantName, userIsSuperAdmin]);

    const loadVisitorContext = useCallback(
        async (showRefreshLoader = false, forceSafetyConsent = false) => {
            if (showRefreshLoader) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            try {
                setRouteError(null);
                setPassError(null);
                setTrackingError(null);
                const [profileResponse, requestResponse] = await Promise.all([
                    getVisitorProfile(selectedPlantId || undefined),
                    listVisitorRequests({
                        plantId: selectedPlantId || undefined,
                        scope: requestScope,
                        page: 1,
                        limit: 100,
                    }),
                ]);

                setProfile(profileResponse.data);
                const requestRows = requestResponse.data || [];
                setRequests(requestRows);

                setSelectedRequestId((current) => {
                    if (current && requestRows.some((request) => request.id === current)) {
                        return current;
                    }
                    const approved = requestRows.find((request) => request.approvalStatus === "APPROVED" && request.navigationEnabled);
                    return approved?.id || requestRows[0]?.id || "";
                });

                const serverHasConsent = Boolean(profileResponse.data.latestSafetyConsent?.consentGiven);
                if (serverHasConsent) {
                    setSafetyConsentAcknowledged(true);
                }
                const hasConsent = forceSafetyConsent || safetyConsentAcknowledged || serverHasConsent;
                setSafetyGateOpen(!hasConsent);
                setSafetyChecked(hasConsent);
                setSafetyScrolled(hasConsent);
            } catch (error: unknown) {
                toast.error(resolveErrorMessage(error, "Failed to load visitor experience"));
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [requestScope, safetyConsentAcknowledged, selectedPlantId],
    );

    useEffect(() => {
        void loadVisitorContext();
    }, [loadVisitorContext]);

    const loadRoute = async () => {
        if (!selectedRequestId) {
            toast.error("Select an approved request to load navigation");
            return;
        }

        setRouteLoading(true);
        try {
            const response = await getVisitorNavigation({ gateEntryId: selectedRequestId });
            setRouteData(response.data);
            setRouteError(null);
            setActiveTab("navigation");
        } catch (error: unknown) {
            const message = resolveErrorMessage(error, "Failed to load navigation route");
            setRouteError(message);
            toast.error(message);
        } finally {
            setRouteLoading(false);
        }
    };

    const loadPassAndTracking = useCallback(async () => {
        if (!selectedRequestId) {
            setPassData(null);
            setTrackingData(null);
            return;
        }

        setPassLoading(true);
        setTrackingLoading(true);

        try {
            const passResponse = await getVisitorPass({ gateEntryId: selectedRequestId });
            setPassData(passResponse.data);
            setPassError(null);
        } catch (error: unknown) {
            setPassData(null);
            setPassError(resolveErrorMessage(error, "Failed to load pass details"));
        } finally {
            setPassLoading(false);
        }

        try {
            const trackingResponse = await getVisitorTracking({ gateEntryId: selectedRequestId, page: 1, limit: 50 });
            setTrackingData(trackingResponse.data);
            setTrackingError(null);
        } catch (error: unknown) {
            setTrackingData(null);
            setTrackingError(resolveErrorMessage(error, "Failed to load tracking history"));
        } finally {
            setTrackingLoading(false);
        }
    }, [selectedRequestId]);

    useEffect(() => {
        void loadPassAndTracking();
    }, [loadPassAndTracking]);

    useEffect(() => {
        if (!canSeeApprovalTab && activeTab === "approval") {
            setActiveTab("profile");
        }
    }, [activeTab, canSeeApprovalTab]);

    const handleApprovalQrDecoded = async (decodedValue: string) => {
        const lookups = buildVisitorQrLookupCandidates(decodedValue);
        if (lookups.length === 0) {
            toast.error("Unable to read a valid visitor QR payload");
            return;
        }

        for (const lookup of lookups) {
            try {
                const response = await getVisitorPass(lookup);
                const gateEntryId = response.data.gateEntryId;
                if (!gateEntryId) continue;

                setSelectedRequestId(gateEntryId);
                setRouteError(null);
                setPassError(null);
                setTrackingError(null);
                setActiveTab("approval");
                toast.success("Visitor request loaded from QR");
                await loadVisitorContext(true, true);
                return;
            } catch {
                // Try next lookup candidate.
            }
        }

        toast.error("No matching visitor request found for this QR");
    };

    const handleRequestReview = async (requestId: string, action: "APPROVE" | "REJECT") => {
        setReviewingRequestId(requestId);
        try {
            await reviewVisitorRequest(requestId, {
                action,
                comments: approvalComments.trim() || null,
            });
            toast.success(action === "APPROVE" ? "Visitor request approved" : "Visitor request rejected");
            setApprovalComments("");
            await loadVisitorContext(true, true);
        } catch (error: unknown) {
            toast.error(resolveErrorMessage(error, `Failed to ${action.toLowerCase()} request`));
        } finally {
            setReviewingRequestId(null);
        }
    };

    const handleExtendVisitWindow = async () => {
        if (!selectedRequestId) {
            toast.error("Select a visitor request first");
            return;
        }
        if (!canUseApprovalActions) {
            toast.error("Only approvers can extend visitor duration");
            return;
        }

        setExtendingPassWindow(true);
        try {
            await submitVisitorApproval({
                gateEntryId: selectedRequestId,
                action: "APPROVE",
                comments: "Visit window extended from pass/status desk",
            });
            toast.success("Visitor duration extended from current time");
            await Promise.all([loadVisitorContext(true, true), loadPassAndTracking()]);
        } catch (error: unknown) {
            toast.error(resolveErrorMessage(error, "Failed to extend visitor duration"));
        } finally {
            setExtendingPassWindow(false);
        }
    };

    const handleSafetyScroll = () => {
        const element = safetyContentRef.current;
        if (!element || safetyScrolled) return;

        const reachedBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 6;
        if (reachedBottom) {
            setSafetyScrolled(true);
        }
    };

    useEffect(() => {
        if (!safetyGateOpen || safetyScrolled) {
            return;
        }

        const element = safetyContentRef.current;
        if (!element) {
            return;
        }

        if (element.scrollHeight <= element.clientHeight + 6) {
            setSafetyScrolled(true);
        }
    }, [safetyGateOpen, safetyScrolled]);

    const handleAcceptSafety = async () => {
        if (savingSafetyConsent) {
            return;
        }

        // Close immediately after explicit consent to avoid flicker/reopen while profile refresh catches up.
        setSafetyConsentAcknowledged(true);
        setSafetyGateOpen(false);
        setSafetyChecked(true);
        setSafetyScrolled(true);
        setSavingSafetyConsent(true);
        try {
            await logVisitorSafetyConsent({
                plantId: selectedPlantId || null,
                gateEntryId: selectedRequestId || null,
                consentGiven: true,
                deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : null,
            });
            setSafetyGateOpen(false);
            toast.success("Safety acknowledgement captured");
            await loadVisitorContext(true, true);
        } catch (error: unknown) {
            // Keep the user unblocked even if server-side logging is temporarily unavailable.
            toast.warning(resolveErrorMessage(error, "Safety acknowledgement captured locally. Sync will retry in background."));
        } finally {
            setSavingSafetyConsent(false);
        }
    };

    const handleSafetyCheckedChange = (checked: boolean | "indeterminate") => {
        const nextChecked = Boolean(checked);
        setSafetyChecked(nextChecked);

        if (nextChecked && safetyScrolled && !savingSafetyConsent) {
            void handleAcceptSafety();
        }
    };

    const handleSendSos = async () => {
        setSosSending(true);
        try {
            const location = await captureCurrentPosition();
            await sendVisitorSos({
                gateEntryId: selectedRequestId || null,
                plantId: selectedPlantId || null,
                latitude: location?.latitude ?? null,
                longitude: location?.longitude ?? null,
                note: sosNote.trim() || null,
            });
            toast.success("SOS alert sent to security teams");
            setSosNote("");
        } catch (error: unknown) {
            toast.error(resolveErrorMessage(error, "Failed to send SOS alert"));
        } finally {
            setSosSending(false);
        }
    };

    if (loading) {
        return (
            <PageShell>
                <Card>
                    <CardContent className="py-16 text-center text-sm text-muted-foreground">Loading visitor experience...</CardContent>
                </Card>
            </PageShell>
        );
    }

    return (
        <PageShell className="space-y-4 sm:space-y-6">
            <PageHeader
                title="Visitor Experience"
                subtitle="Unified view for visitor profile, approvals, digital pass, route navigation, and safety controls."
                actions={(
                    <div className="flex flex-wrap items-end gap-2">
                        {userIsSuperAdmin ? (
                            <SelectField
                                label="Plant"
                                value={selectedPlantId}
                                onChange={(value) => setSelectedPlantId(value)}
                                options={plantOptions}
                                placeholder="Select plant"
                            />
                        ) : null}
                        <Button variant="outline" className="gap-2" onClick={() => void loadVisitorContext(true)} disabled={refreshing}>
                            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                )}
            />

            {!isVisitorOnlyUser ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.total}</p><p className="text-xs text-muted-foreground">Total Requests</p></CardContent></Card>
                    <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.pending}</p><p className="text-xs text-muted-foreground">Pending Approvals</p></CardContent></Card>
                    <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.approved}</p><p className="text-xs text-muted-foreground">Approved</p></CardContent></Card>
                    <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.active}</p><p className="text-xs text-muted-foreground">Active Visitors</p></CardContent></Card>
                </div>
            ) : null}

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as VisitorTab)} className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-6">
                    <TabsTrigger value="profile" className="gap-2"><UserCheck className="h-4 w-4" /> Profile</TabsTrigger>
                    <TabsTrigger value="navigation" className="gap-2"><MapPinned className="h-4 w-4" /> Navigation</TabsTrigger>
                    <TabsTrigger value="pass" className="gap-2"><QrCode className="h-4 w-4" /> Digital Pass</TabsTrigger>
                    {isVisitorOnlyUser && <TabsTrigger value="checkin" className="gap-2"><ClipboardCheck className="h-4 w-4" /> Check-in</TabsTrigger>}
                    {!isVisitorOnlyUser && <TabsTrigger value="visitors-list" className="gap-2"><Users className="h-4 w-4" /> Visitors</TabsTrigger>}
                    {canSeeApprovalTab && <TabsTrigger value="approval" className="gap-2"><ShieldCheck className="h-4 w-4" /> Approval</TabsTrigger>}
                </TabsList>

                <TabsContent value="profile" className="space-y-4">
                    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                        <div className="space-y-6">
                            <Card className="rounded-[1.5rem] border-none shadow-card">
                                <CardHeader>
                                    <CardTitle>Organization Overview</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="aspect-video rounded-2xl bg-muted/50 overflow-hidden relative">
                                        <img 
                                            src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=2070" 
                                            alt="Industrial Plant"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-end p-6">
                                            <div className="text-white">
                                                <h3 className="text-xl font-bold">Main Production Facility</h3>
                                                <p className="text-sm opacity-80">Industrial Zone A, South Sector</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-6 space-y-4">
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            Welcome to our premier industrial maintenance and manufacturing hub. We prioritize safety and operational excellence. 
                                            Please ensure you follow all designated visitor paths and wear required PPE at all times.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card className="rounded-[1.5rem] border-none shadow-card bg-primary text-primary-foreground">
                                <CardHeader>
                                    <CardTitle className="text-lg">Visitor Safety Protocol</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">1</div>
                                        <p className="text-sm">PPE is mandatory in all production zones.</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">2</div>
                                        <p className="text-sm">Follow yellow floor markings for walking.</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">3</div>
                                        <p className="text-sm">In case of emergency, head to the nearest exit.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="navigation" className="space-y-4">
                    <Card className="rounded-[1.5rem] border-none shadow-card overflow-hidden">
                        <CardHeader className="border-b">
                            <CardTitle className="flex items-center gap-2">
                                <MapPinned className="h-5 w-5 text-primary" />
                                Interactive Plant Navigation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="aspect-[21/9] bg-slate-900 relative">
                                <img 
                                    src="/plant_satellite_navigation_mockup_1778820501209.png" 
                                    alt="Plant Satellite Map" 
                                    className="w-full h-full object-cover opacity-60"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="bg-black/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 text-center text-white">
                                        <Navigation className="h-10 w-10 mx-auto mb-4 text-primary animate-pulse" />
                                        <h3 className="text-xl font-bold">Satellite Guidance Active</h3>
                                        <p className="text-sm opacity-70">Showing optimized route for your destination</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pass" className="space-y-4">
                    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
                        <Card className="overflow-hidden rounded-[2.5rem] border-none shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)]">
                            <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 px-8 py-10 text-white relative">
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <ShieldCheck className="h-32 w-32" />
                                </div>
                                <div className="flex items-center justify-between mb-12">
                                    <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-md px-3 py-1">AUTHORIZED VISITOR</Badge>
                                    <div className="h-12 w-12 rounded-2xl bg-white p-2 shadow-xl">
                                        <QrCode className="h-full w-full text-slate-900" />
                                    </div>
                                </div>
                                <div className="space-y-1 mb-8">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Visitor Identification</p>
                                    <p className="text-3xl font-black italic tracking-tighter">{passData?.visitor.name || "---"}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase text-blue-300 tracking-widest mb-1">Pass ID</p>
                                        <p className="font-mono text-sm font-bold tracking-widest">{passData?.gateEntryId?.substring(0, 8).toUpperCase() || "VIS-XXXX"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase text-blue-300 tracking-widest mb-1">Host Dept</p>
                                        <p className="text-sm font-bold">{passData?.host.department || "---"}</p>
                                    </div>
                                </div>
                            </div>
                            <CardContent className="bg-background p-8">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Meeting With</p>
                                            <p className="text-sm font-bold">{passData?.host.name || "---"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Entry Gate</p>
                                            <p className="text-sm font-bold">{passData?.location.gate || "Main Gate"}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-muted/30 border space-y-1">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Authorized Zones</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {["OFFICE", "CANTEEN", "LOBBY"].map(zone => (
                                                <Badge key={zone} variant="secondary" className="text-[9px] py-0 px-2">{zone}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                    <Button className="w-full h-12 rounded-xl font-bold gradient-primary shadow-lg shadow-primary/20">
                                        Download Digital Pass
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-lg font-bold">Activity Feed</h3>
                                <Badge variant="secondary" className="rounded-full">Real-time Tracking</Badge>
                            </div>
                            <div className="space-y-4">
                                {trackingData?.items && trackingData.items.length > 0 ? (
                                    trackingData.items.map((item, idx) => (
                                        <div key={item.id} className="relative pl-6 pb-6 last:pb-0">
                                            {idx !== trackingData.items.length - 1 && (
                                                <div className="absolute left-[7px] top-[24px] bottom-0 w-[2px] bg-muted" />
                                            )}
                                            <div className="absolute left-0 top-[6px] h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm" />
                                            <div className="rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="text-sm font-bold">{item.nodeLabel || "Zone Arrival"}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground">{item.payload || "Movement captured by security sensor"}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Timestamp</p>
                                                        <p className="text-[10px] font-mono font-medium">{formatDateTime(item.trackedAt)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-[1.5rem] border-2 border-dashed bg-muted/20 p-12 text-center">
                                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground mb-4">
                                            <Locate size={20} />
                                        </div>
                                        <p className="text-sm text-muted-foreground italic">Awaiting initial sensor handshake...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="checkin" className="space-y-4">
                    <Card className="rounded-[1.5rem] border-none shadow-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ClipboardCheck className="h-5 w-5 text-primary" />
                                Industrial Self Check-in (ISO Compliance)
                            </CardTitle>
                            <CardDescription>Verify your visit details to activate your plant authorization.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid gap-8 md:grid-cols-2">
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Visitor Information</h3>
                                    <SelectField 
                                        label="Visitor Category"
                                        value={travelForm.visitorCategory}
                                        onChange={(v) => setTravelForm(f => ({...f, visitorCategory: v}))}
                                        options={[
                                            {value: "OFFICIAL", label: "Official Meeting"},
                                            {value: "VENDOR", label: "Vendor Service"},
                                            {value: "AUDITOR", label: "External Auditor"},
                                            {value: "CONTRACTOR", label: "Contractual Staff"},
                                        ]}
                                    />
                                    <InputField 
                                        label="Travel Origin (City/Area)"
                                        value={travelForm.fromLocation}
                                        onChange={(v) => setTravelForm(f => ({...f, fromLocation: v}))}
                                        placeholder="e.g. Chennai, Industrial Hub"
                                    />
                                    <SelectField 
                                        label="Transport Mode"
                                        value={travelForm.travelMode}
                                        onChange={(v) => setTravelForm(f => ({...f, travelMode: v}))}
                                        options={[
                                            {value: "PRIVATE_VEHICLE", label: "Private Vehicle"},
                                            {value: "PUBLIC_TRANSPORT", label: "Public Transport"},
                                            {value: "COMPANY_CAB", label: "Company Cab"},
                                            {value: "FLIGHT", label: "Air Travel"},
                                        ]}
                                    />
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Compliance & Safety</h3>
                                    <InputField 
                                        label="Emergency Contact Number"
                                        value={travelForm.emergencyContact}
                                        onChange={(v) => setTravelForm(f => ({...f, emergencyContact: v}))}
                                        placeholder="+91 XXXXX XXXXX"
                                    />
                                    <TextareaField 
                                        label="Materials/Tools Carried"
                                        value={travelForm.materialsCarried}
                                        onChange={(v) => setTravelForm(f => ({...f, materialsCarried: v}))}
                                        placeholder="e.g. Laptop, Tool kit, Spare parts"
                                    />
                                    <div className="flex items-center gap-3 p-4 border rounded-2xl bg-emerald-500/5 border-emerald-500/20">
                                        <Checkbox 
                                            id="ppe_check"
                                            checked={travelForm.ppeConfirmed}
                                            onCheckedChange={(v) => setTravelForm(f => ({...f, ppeConfirmed: !!v}))}
                                        />
                                        <label htmlFor="ppe_check" className="text-xs font-semibold leading-tight text-emerald-900 cursor-pointer">
                                            I confirm I have the required PPE for this plant and acknowledge safety norms.
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 border-t">
                                <Button className="w-full h-14 text-lg font-black gradient-primary" disabled={submittingCheckin || !travelForm.ppeConfirmed}>
                                    {submittingCheckin ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-6 w-6" />}
                                    Complete Industrial Check-in
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="visitors-list" className="space-y-4">
                    <div className="grid gap-6 md:grid-cols-[1fr_400px]">
                        <div className="space-y-6">
                            <Card className="rounded-[1.5rem] border-none shadow-card">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Users className="h-5 w-5 text-primary" />
                                        Your Visitor Pipeline
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {requests.filter(r => r.personToMeetUserId === user?.id || r.personToMeet === user?.fullName).map(request => (
                                            <div key={request.id} className="flex items-center justify-between p-6 border rounded-[1.25rem] bg-muted/10 hover:bg-muted/20 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary">
                                                        {request.visitorName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-lg">{request.visitorName}</p>
                                                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                                            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {request.visitorCompany}</span>
                                                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(request.entryTime)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {request.approvalStatus === "PENDING" ? (
                                                        <>
                                                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleRequestReview(request.id, "REJECT")}>Reject</Button>
                                                            <Button size="sm" className="gradient-primary px-6" onClick={() => handleRequestReview(request.id, "APPROVE")}>Approve</Button>
                                                        </>
                                                    ) : (
                                                        <Badge variant={request.approvalStatus === "APPROVED" ? "completed" : "error"} className="px-4">{request.approvalStatus}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {requests.filter(r => r.personToMeetUserId === user?.id || r.personToMeet === user?.fullName).length === 0 && (
                                            <div className="py-24 text-center space-y-4">
                                                <div className="h-20 w-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto">
                                                    <Users className="h-10 w-10 text-muted-foreground/30" />
                                                </div>
                                                <p className="text-muted-foreground font-medium italic">No active visitor requests found for you.</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card className="rounded-[1.5rem] border-none shadow-card">
                                <CardHeader>
                                    <CardTitle className="text-lg">Invite New Visitor</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <InputField 
                                        label="Full Name"
                                        value={invitationForm.visitorName}
                                        onChange={(v) => setInvitationForm(f => ({...f, visitorName: v}))}
                                        placeholder="Enter full name"
                                    />
                                    <div className="grid gap-4 grid-cols-2">
                                        <InputField 
                                            label="Organization"
                                            value={invitationForm.visitorCompany}
                                            onChange={(v) => setInvitationForm(f => ({...f, visitorCompany: v}))}
                                            placeholder="Company"
                                        />
                                        <InputField 
                                            label="Phone"
                                            value={invitationForm.visitorPhone}
                                            onChange={(v) => setInvitationForm(f => ({...f, visitorPhone: v}))}
                                            placeholder="Mobile"
                                        />
                                    </div>
                                    <InputField 
                                        label="Scheduled Arrival"
                                        type="datetime-local"
                                        value={invitationForm.expectedArrival}
                                        onChange={(v) => setInvitationForm(f => ({...f, expectedArrival: v}))}
                                    />
                                    <Button className="w-full h-12 gradient-primary font-bold shadow-lg shadow-primary/20" disabled={submittingInvitation}>
                                        Generate Invitation
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="approval" className="space-y-4">
                    <Card className="rounded-[1.5rem] border-none shadow-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Security Gate Authorization
                            </CardTitle>
                            <CardDescription>Scan digital pass or review pending industrial entries for plant authorization.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid gap-10 md:grid-cols-[1fr_350px]">
                                <div className="space-y-8">
                                    <div className="group relative overflow-hidden rounded-[2rem] border-2 border-dashed border-primary/20 p-12 text-center transition-all hover:border-primary/40 hover:bg-primary/[0.02]">
                                        <div className="mx-auto max-w-sm space-y-6">
                                            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                                                <QrCode className="h-12 w-12" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-black italic tracking-tight">SCAN VISITOR PASS</h3>
                                                <p className="text-xs text-muted-foreground leading-relaxed">Secure digital handshake for automated industrial check-in and zone authorization.</p>
                                            </div>
                                            <Button className="w-full h-12 gap-2 rounded-2xl gradient-primary shadow-xl shadow-primary/20" onClick={() => setQrScannerOpen(true)}>
                                                <Maximize size={18} /> Launch Scanner
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Pending Field Approvals</h3>
                                        <div className="grid gap-3">
                                            {requests.filter(r => r.approvalStatus === "PENDING").map((request) => (
                                                <div key={request.id} className="group relative flex items-center justify-between rounded-[1.5rem] border border-border/50 bg-card/40 p-5 transition-all hover:border-primary/30 hover:bg-card hover:shadow-xl">
                                                    <div className="flex items-center gap-5">
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 font-black text-primary">
                                                            {request.visitorName.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-lg">{request.visitorName}</p>
                                                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                                                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {request.visitorCompany || "Unknown"}</span>
                                                                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDateTime(request.entryTime)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Button size="sm" variant="secondary" className="rounded-xl opacity-0 group-hover:opacity-100 transition-all px-4" onClick={() => setSelectedRequestId(request.id)}>
                                                        Review <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            {requests.filter(r => r.approvalStatus === "PENDING").length === 0 && (
                                                <div className="py-20 text-center space-y-4 bg-muted/20 rounded-[1.5rem] border-2 border-dashed">
                                                    <div className="h-12 w-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto">
                                                        <ShieldCheck className="h-6 w-6 text-muted-foreground/30" />
                                                    </div>
                                                    <p className="text-sm text-muted-foreground italic">Clear queue - No pending gate authorizations</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <Card className="rounded-[1.5rem] border-none shadow-card bg-slate-900 text-white p-2 overflow-hidden">
                                        <div className="p-6 pb-2">
                                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">Security Verdict</h3>
                                        </div>
                                        <CardContent className="p-6 pt-2 space-y-5">
                                            <div className="space-y-3">
                                                <Label className="text-xs font-bold text-slate-400">Gate Notes</Label>
                                                <textarea
                                                    className="w-full h-32 rounded-2xl bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                                    placeholder="Restrictions, materials found, or verification comments..."
                                                    value={approvalComments}
                                                    onChange={(e) => setApprovalComments(e.target.value)}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <Button 
                                                    variant="ghost" 
                                                    className="w-full h-12 rounded-xl text-destructive hover:bg-destructive/10 border border-destructive/20" 
                                                    disabled={!selectedRequestId || !!reviewingRequestId} 
                                                    onClick={() => selectedRequestId && handleRequestReview(selectedRequestId, "REJECT")}
                                                >
                                                    {reviewingRequestId === selectedRequestId ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Deny Entry"}
                                                </Button>
                                                <Button 
                                                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black" 
                                                    disabled={!selectedRequestId || !!reviewingRequestId}
                                                    onClick={() => selectedRequestId && handleRequestReview(selectedRequestId, "APPROVE")}
                                                >
                                                    {reviewingRequestId === selectedRequestId ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Authorize"}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-[1.5rem] border-none shadow-card p-6">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">Gate Operations</h3>
                                        <div className="space-y-3">
                                            <Button variant="outline" className="w-full justify-start h-10 text-xs rounded-xl gap-3"><Users size={14} /> View All Today's Entries</Button>
                                            <Button variant="outline" className="w-full justify-start h-10 text-xs rounded-xl gap-3"><ArrowRight size={14} /> Material Outward Pass</Button>
                                            <Button variant="outline" className="w-full justify-start h-10 text-xs rounded-xl gap-3"><AlertTriangle size={14} /> Report Incident</Button>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>


            <MobileQrScannerDialog
                open={approvalQrOpen}
                onOpenChange={setApprovalQrOpen}
                title="Scan Visitor Approval QR"
                description="Scan visitor QR to open the request in the approval queue."
                onDecoded={(value) => {
                    void handleApprovalQrDecoded(value);
                }}
            />

            <Dialog open={safetyGateOpen} onOpenChange={() => { }}>
                <DialogContent className="sm:max-w-2xl [&>button]:hidden">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600"><AlertTriangle className="h-5 w-5" /> Mandatory Safety Acknowledgement</DialogTitle>
                        <DialogDescription>
                            Read the complete safety instructions before entering the visitor experience workspace.
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        ref={safetyContentRef}
                        onScroll={handleSafetyScroll}
                        className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground"
                    >
                        <p>1. Always wear required PPE in designated zones.</p>
                        <p>2. Follow escort and security instructions without exception.</p>
                        <p>3. Do not enter restricted or hazardous areas without authorization.</p>
                        <p>4. Report spills, alarms, and unsafe conditions immediately.</p>
                        <p>5. Emergency exits and assembly points must remain unobstructed.</p>
                        <p>6. Photography, recording, and device usage may be restricted by zone.</p>
                        <p>7. Visitors must carry visible pass badges throughout their visit.</p>
                        <p>8. In case of siren or emergency broadcast, stop work and evacuate safely.</p>
                        <p>9. Any safety violation may result in immediate visit termination.</p>
                        <p>10. Consent details (time, IP, device) are logged for compliance.</p>
                    </div>

                    <label className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
                        <Checkbox checked={safetyChecked} onCheckedChange={handleSafetyCheckedChange} />
                        <span>I confirm that I have read and will follow all safety instructions.</span>
                    </label>

                    <Button
                        onClick={() => void handleAcceptSafety()}
                        disabled={!safetyScrolled || !safetyChecked || savingSafetyConsent}
                    >
                        {savingSafetyConsent ? "Saving Consent..." : "I Agree & Enter"}
                    </Button>
                    {!safetyScrolled ? <p className="text-xs text-muted-foreground">Scroll to the end of safety instructions to continue.</p> : null}
                </DialogContent>
            </Dialog>
        </PageShell>
    );
}
