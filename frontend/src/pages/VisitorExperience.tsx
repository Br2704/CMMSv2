import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    AlertTriangle,
    CheckCircle2,
    IdCard,
    MapPinned,
    Navigation,
    RefreshCw,
    ShieldAlert,
    Siren,
    UserCheck,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectField } from "@/components/shared/FormField";
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
    type VisitorNavigationRoute,
    type VisitorPassData,
    type VisitorProfileResponse,
    type VisitorRequestRecord,
    type VisitorTrackingResponse,
} from "@/api/visitorExperience";
import { isSuperAdmin, useAuthStore } from "@/store/auth.store";

type VisitorTab = "profile" | "navigation" | "approval" | "pass" | "safety";

function resolveErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message;
        }
    }
    return fallback;
}

function isApprovalRole(role: string) {
    const normalized = role.trim().toUpperCase();
    return ["ROOT_ADMIN", "SUPERADMIN", "ADMIN", "SECURITY", "SECURITY_USER"].includes(normalized);
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

    const [approvalComments, setApprovalComments] = useState("");
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

    const [safetyGateOpen, setSafetyGateOpen] = useState(false);
    const [safetyChecked, setSafetyChecked] = useState(false);
    const [safetyScrolled, setSafetyScrolled] = useState(false);
    const [savingSafetyConsent, setSavingSafetyConsent] = useState(false);
    const [safetyConsentAcknowledged, setSafetyConsentAcknowledged] = useState(false);
    const safetyContentRef = useRef<HTMLDivElement | null>(null);

    const [sosNote, setSosNote] = useState("");
    const [sosSending, setSosSending] = useState(false);

    const canApproveRequests = useMemo(() => (user?.roles ?? []).some((role) => isApprovalRole(role)), [user?.roles]);
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
        async (showRefreshLoader = false) => {
            if (showRefreshLoader) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            try {
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
                const hasConsent = safetyConsentAcknowledged || serverHasConsent;
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
            setActiveTab("navigation");
        } catch (error: unknown) {
            toast.error(resolveErrorMessage(error, "Failed to load navigation route"));
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
        } catch {
            setPassData(null);
        } finally {
            setPassLoading(false);
        }

        try {
            const trackingResponse = await getVisitorTracking({ gateEntryId: selectedRequestId, page: 1, limit: 50 });
            setTrackingData(trackingResponse.data);
        } catch {
            setTrackingData(null);
        } finally {
            setTrackingLoading(false);
        }
    }, [selectedRequestId]);

    useEffect(() => {
        void loadPassAndTracking();
    }, [loadPassAndTracking]);

    const handleRequestReview = async (requestId: string, action: "APPROVE" | "REJECT") => {
        setReviewingRequestId(requestId);
        try {
            await reviewVisitorRequest(requestId, {
                action,
                comments: approvalComments.trim() || null,
            });
            toast.success(action === "APPROVE" ? "Visitor request approved" : "Visitor request rejected");
            setApprovalComments("");
            await loadVisitorContext(true);
        } catch (error: unknown) {
            toast.error(resolveErrorMessage(error, `Failed to ${action.toLowerCase()} request`));
        } finally {
            setReviewingRequestId(null);
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
            await loadVisitorContext(true);
        } catch (error: unknown) {
            setSafetyConsentAcknowledged(false);
            setSafetyGateOpen(true);
            toast.error(resolveErrorMessage(error, "Failed to record safety consent"));
        } finally {
            setSavingSafetyConsent(false);
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

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.total}</p><p className="text-xs text-muted-foreground">Total Requests</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.pending}</p><p className="text-xs text-muted-foreground">Pending Approvals</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.approved}</p><p className="text-xs text-muted-foreground">Approved</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{summary.active}</p><p className="text-xs text-muted-foreground">Active Visitors</p></CardContent></Card>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as VisitorTab)} className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
                    <TabsTrigger value="profile" className="gap-2"><UserCheck className="h-4 w-4" /> Company Profile</TabsTrigger>
                    <TabsTrigger value="navigation" className="gap-2"><Navigation className="h-4 w-4" /> Plant Navigation</TabsTrigger>
                    <TabsTrigger value="approval" className="gap-2"><CheckCircle2 className="h-4 w-4" /> Visitor Approval</TabsTrigger>
                    <TabsTrigger value="pass" className="gap-2"><IdCard className="h-4 w-4" /> Pass / Status</TabsTrigger>
                    <TabsTrigger value="safety" className="gap-2"><ShieldAlert className="h-4 w-4" /> Emergency & Safety</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-4">
                    <Card className="shadow-card">
                        <CardHeader>
                            <CardTitle>{profile?.pageTitle || "Visitor Experience"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">{profile?.companyOverview || "Company profile details will appear here."}</p>

                            <div className="flex flex-wrap gap-2">
                                {(profile?.certifications || []).map((item) => (
                                    <Badge key={item} variant="outline">{item}</Badge>
                                ))}
                                {(profile?.certifications || []).length === 0 ? <p className="text-xs text-muted-foreground">No certifications configured.</p> : null}
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                                    <p className="text-sm font-medium">Plant Capabilities</p>
                                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                        {(profile?.plantCapabilities || []).map((capability) => (
                                            <li key={capability}>• {capability}</li>
                                        ))}
                                        {(profile?.plantCapabilities || []).length === 0 ? <li>Not configured</li> : null}
                                    </ul>
                                </div>
                                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                                    <p className="text-sm font-medium">Contact</p>
                                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                        <p>{profile?.contactName || "Front Office"}</p>
                                        <p>{profile?.contactEmail || "-"}</p>
                                        <p>{profile?.contactPhone || "-"}</p>
                                        <p>{profile?.contactAddress || "-"}</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="navigation" className="space-y-4">
                    <Card className="shadow-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary" /> Plant Navigation Route</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                <SelectField
                                    label="Approved Request"
                                    value={selectedRequestId}
                                    onChange={(value) => setSelectedRequestId(value)}
                                    options={approvedNavigationRequests.map((request) => ({
                                        value: request.id,
                                        label: `${request.visitorName} • ${request.purpose || "Visit"}`,
                                    }))}
                                    placeholder="Select approved request"
                                />
                                <Button className="md:mt-7" onClick={() => void loadRoute()} disabled={routeLoading || !selectedRequestId}>
                                    {routeLoading ? "Loading Route..." : "Generate Route"}
                                </Button>
                            </div>

                            {routeData ? (
                                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                                    <p className="text-sm font-medium">Navigation Instructions</p>
                                    <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                                        {routeData.instructions.map((instruction, index) => (
                                            <li key={`${instruction}-${index}`}>{instruction}</li>
                                        ))}
                                    </ol>

                                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Path Nodes</p>
                                        {routeData.pathNodes.map((node) => (
                                            <div key={node.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1 text-sm last:border-b-0">
                                                <div>
                                                    <p className="font-medium">{node.label}</p>
                                                    <p className="text-xs text-muted-foreground">{node.nodeType}</p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    GPS: {node.latitude ?? "-"}, {node.longitude ?? "-"}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Choose an approved request to generate the visitor route.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="approval" className="space-y-4">
                    <Card className="shadow-card">
                        <CardHeader>
                            <CardTitle>Visitor Requests & Approval Queue</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Textarea
                                value={approvalComments}
                                onChange={(event) => setApprovalComments(event.target.value)}
                                placeholder="Optional approval/rejection comments"
                                rows={3}
                            />

                            <div className="space-y-3">
                                {requests.map((request) => (
                                    <div key={request.id} className="rounded-xl border border-border/70 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-medium">{request.visitorName}</p>
                                            <Badge variant={request.approvalStatus === "APPROVED" ? "default" : request.approvalStatus === "REJECTED" ? "destructive" : "outline"}>
                                                {request.approvalStatus}
                                            </Badge>
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">Purpose: {request.purpose || "-"}</p>
                                        <p className="text-xs text-muted-foreground">Requested: {formatDateTime(request.approvalRequestedAt)}</p>
                                        <p className="text-xs text-muted-foreground">Host: {request.personToMeetUser?.fullName || request.personToMeet || "-"}</p>

                                        {canApproveRequests && request.approvalStatus === "PENDING" ? (
                                            <div className="mt-3 flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => {
                                                        void handleRequestReview(request.id, "APPROVE");
                                                    }}
                                                    disabled={reviewingRequestId === request.id}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        void handleRequestReview(request.id, "REJECT");
                                                    }}
                                                    disabled={reviewingRequestId === request.id}
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}

                                {requests.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No visitor requests available for this scope.</p>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pass" className="space-y-4">
                    <Card className="shadow-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5 text-primary" /> Visitor Pass / Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => void loadPassAndTracking()} disabled={passLoading || trackingLoading || !selectedRequestId}>
                                    Refresh Pass
                                </Button>
                                {!selectedRequestId ? <p className="text-xs text-muted-foreground">Select a request in Plant Navigation to view pass status.</p> : null}
                            </div>

                            {passLoading ? <p className="text-sm text-muted-foreground">Loading pass details...</p> : null}

                            {passData ? (
                                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">{passData.visitor.name}</p>
                                        <Badge variant={passData.validity.status === "VALID" ? "default" : passData.validity.status === "EXPIRED" ? "destructive" : "outline"}>
                                            {passData.validity.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Host: {passData.host.name || "-"}</p>
                                    <p className="text-xs text-muted-foreground">Gate: {passData.location.gate || "-"}</p>
                                    <p className="text-xs text-muted-foreground">Valid To: {formatDateTime(passData.validity.validTo)}</p>
                                    <p className="text-xs text-muted-foreground">Remaining: {passData.validity.remainingSeconds} sec</p>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No pass data available yet.</p>
                            )}

                            <div className="rounded-xl border border-border/70 p-4">
                                <p className="text-sm font-medium">Recent Tracking</p>
                                {trackingLoading ? (
                                    <p className="mt-2 text-xs text-muted-foreground">Loading tracking points...</p>
                                ) : trackingData?.path?.length ? (
                                    <div className="mt-2 space-y-2">
                                        {trackingData.path.slice(0, 8).map((point) => (
                                            <div key={point.id} className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
                                                <p>{formatDateTime(point.trackedAt)}</p>
                                                <p>Node: {point.nodeLabel || point.nodeId || "-"}</p>
                                                <p>GPS: {point.latitude || "-"}, {point.longitude || "-"}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-xs text-muted-foreground">No tracking data available.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="safety" className="space-y-4">
                    <Card className="shadow-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Emergency & Safety</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                                <p className="text-sm font-medium">Safety Instructions</p>
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                    {(profile?.safetyInstructions || []).map((instruction, index) => (
                                        <li key={`${instruction}-${index}`}>• {instruction}</li>
                                    ))}
                                    {(profile?.safetyInstructions || []).length === 0 ? <li>Safety instructions are not configured.</li> : null}
                                </ul>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                                <p className="text-sm font-medium">Emergency Contacts</p>
                                <div className="mt-2 space-y-2">
                                    {(profile?.emergencyContacts || []).map((contact) => (
                                        <div key={`${contact.name}-${contact.phone}`} className="rounded-md border border-border/60 bg-background/80 p-2 text-sm">
                                            <p className="font-medium">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground">{contact.role || "Emergency Contact"} • {contact.phone}</p>
                                        </div>
                                    ))}
                                    {(profile?.emergencyContacts || []).length === 0 ? <p className="text-xs text-muted-foreground">No emergency contacts configured.</p> : null}
                                </div>
                            </div>

                            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                                <div className="mb-2 flex items-center gap-2 text-rose-700">
                                    <Siren className="h-4 w-4" />
                                    <p className="text-sm font-medium">SOS Alert</p>
                                </div>
                                <Textarea
                                    value={sosNote}
                                    onChange={(event) => setSosNote(event.target.value)}
                                    rows={3}
                                    placeholder="Describe the emergency briefly"
                                />
                                <Button className="mt-3" variant="destructive" onClick={() => void handleSendSos()} disabled={sosSending}>
                                    {sosSending ? "Sending SOS..." : "Send SOS Alert"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

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
                        <Checkbox checked={safetyChecked} onCheckedChange={(checked) => setSafetyChecked(Boolean(checked))} />
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
