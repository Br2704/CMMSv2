import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/ui/status-badge';
import { InputField, SelectField, TextareaField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageShell } from '@/components/layout/PageShell';
import { approveSmartVisitor, createVisitorRequest, getPlantVisitorLayout, getSmartNavigationRoute, getVisitorExperienceContent, getVisitorInsights, getVisitorSessionStatus, listVisitorRequests, savePlantVisitorLayout, saveVisitorExperienceContent, type PlantLayout, type PlantLayoutEdge, type PlantLayoutNode, type VisitorExperienceContent, type VisitorExperienceProduct, type VisitorNavigationRoute, type VisitorRequestRecord, type VisitorSessionStatus, updateVisitorLocation } from '@/api/visitorExperience';
import { listAssets, type Asset } from '@/api/assets';
import { listPlants, type Plant } from '@/api/plants';
import { listDepartments, type Department } from '@/api/departments';
import { listModules, type MachineModule } from '@/api/modules';
import { listUsers, type UserProfile } from '@/api/users';
import { listGates, type Gate } from '@/api/gates';
import { isAdmin, useAuthStore } from '@/store/auth.store';

const EMPTY_CONTENT_DRAFT = {
  pageTitle: 'Welcome to JK Fenner',
  companyOverview: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  productsJson: '[]',
};

const EMPTY_LAYOUT_DRAFT = {
  layoutName: 'Plant Layout',
  svgMarkup: '',
  mapDataJson: '{\n  "nodes": [],\n  "edges": []\n}',
};

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return '[]';
  }
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  return fallback;
}

function parseLayoutNode(value: unknown): PlantLayoutNode | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const id = String(input.id ?? '').trim();
  const label = String(input.label ?? '').trim();
  if (!id || !label) return null;

  return {
    id,
    label,
    nodeType: String(input.nodeType ?? 'WAYPOINT'),
    refId: input.refId ? String(input.refId) : undefined,
    x: typeof input.x === 'number' ? input.x : undefined,
    y: typeof input.y === 'number' ? input.y : undefined,
  };
}

function parseLayoutEdge(value: unknown): PlantLayoutEdge | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const fromNodeId = String(input.fromNodeId ?? '').trim();
  const toNodeId = String(input.toNodeId ?? '').trim();
  if (!fromNodeId || !toNodeId) return null;

  return {
    fromNodeId,
    toNodeId,
    distance: typeof input.distance === 'number' ? input.distance : undefined,
    directional: typeof input.directional === 'boolean' ? input.directional : undefined,
  };
}

function formatVisitorStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'PENDING') return 'Pending Approval';
  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  if (normalized === 'IN') return 'Inside Plant';
  if (normalized === 'OUT') return 'Exited';
  return normalized || 'Unknown';
}

function getStatusVariant(status: string | null | undefined) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'IN') return 'completed' as const;
  if (normalized === 'REJECTED') return 'error' as const;
  if (normalized === 'PENDING') return 'warning' as const;
  return 'default' as const;
}

export default function VisitorExperience() {
  const { user } = useAuthStore();
  const userIsAdmin = isAdmin(user);
  const isSecurityUser = useMemo(
    () =>
      (user?.roles ?? []).some((role) => {
        const normalized = role.toUpperCase();
        return normalized === 'SECURITY' || normalized === 'SECURITY_USER';
      }),
    [user?.roles],
  );
  const userIsVisitor = useMemo(
    () => (user?.roles ?? []).some((role) => role.toUpperCase() === 'VISITOR'),
    [user?.roles],
  );

  const [loading, setLoading] = useState(true);
  const [savingContent, setSavingContent] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<MachineModule[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);

  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [content, setContent] = useState<VisitorExperienceContent | null>(null);
  const [layout, setLayout] = useState<PlantLayout | null>(null);
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof getVisitorInsights>>['data'] | null>(null);

  const [contentDraft, setContentDraft] = useState(EMPTY_CONTENT_DRAFT);
  const [layoutDraft, setLayoutDraft] = useState(EMPTY_LAYOUT_DRAFT);

  const [requestScope, setRequestScope] = useState<'my-requests' | 'approvals' | 'all'>('my-requests');
  const [requests, setRequests] = useState<VisitorRequestRecord[]>([]);
  const [requestSearch, setRequestSearch] = useState('');

  const [requestForm, setRequestForm] = useState({
    gateId: '',
    departmentId: '',
    moduleId: '',
    personToMeetUserId: '',
    visitorName: user?.fullName || '',
    visitorCompany: '',
    visitorPhone: user?.phone || '',
    purpose: '',
    desiredVisitAt: '',
    idProofType: '',
    idProofNumber: '',
    vehicleNumber: '',
    remarks: '',
  });

  const [selectedProduct, setSelectedProduct] = useState<VisitorExperienceProduct | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [routeData, setRouteData] = useState<VisitorNavigationRoute | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string>('');
  const [sessionTokenInput, setSessionTokenInput] = useState('');
  const [sessionStatus, setSessionStatus] = useState<VisitorSessionStatus | null>(null);
  const [loadingSessionStatus, setLoadingSessionStatus] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>('');
  const [departmentMachines, setDepartmentMachines] = useState<Asset[]>([]);
  const [routeCoordinateLookup, setRouteCoordinateLookup] = useState<Record<string, { latitude: number; longitude: number; label: string; departmentId: string | null }>>({});

  const plantOptions = useMemo(
    () => plants.map((plant) => ({ value: plant.id, label: `${plant.plantCode} - ${plant.plantName}` })),
    [plants],
  );

  const selectedPlant = useMemo(() => plants.find((plant) => plant.id === selectedPlantId) || null, [plants, selectedPlantId]);

  const filteredDepartments = useMemo(
    () => departments.filter((department) => !selectedPlantId || department.plantId === selectedPlantId),
    [departments, selectedPlantId],
  );

  const filteredModules = useMemo(
    () =>
      modules.filter((module) => {
        if (selectedPlantId && module.plantId !== selectedPlantId) return false;
        if (requestForm.departmentId && module.departmentId !== requestForm.departmentId) return false;
        return true;
      }),
    [modules, requestForm.departmentId, selectedPlantId],
  );

  const employeeOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.isActive)
        .map((employee) => ({
          value: employee.userId,
          label: `${employee.fullName} (${employee.userCode})`,
        })),
    [employees],
  );

  const gateOptions = useMemo(
    () => gates.map((gate) => ({ value: gate.id, label: `${gate.gateName} (${gate.gateCode})` })),
    [gates],
  );

  const requestScopeOptions = useMemo(() => {
    if (userIsVisitor) return [{ value: 'my-requests', label: 'My Requests' }];
    if (userIsAdmin || isSecurityUser) {
      return [
        { value: 'all', label: 'All Visitor Requests' },
        { value: 'approvals', label: 'My Approvals' },
        { value: 'my-requests', label: 'Requests Raised by Me' },
      ];
    }
    return [
      { value: 'approvals', label: 'My Approvals' },
      { value: 'my-requests', label: 'Requests Raised by Me' },
    ];
  }, [isSecurityUser, userIsAdmin, userIsVisitor]);

  const requestOptions = useMemo(
    () =>
      requests
        .filter((request) => request.approvalStatus === 'APPROVED' && request.navigationEnabled)
        .map((request) => ({
          value: request.id,
          label: `${request.visitorName} • ${request.department?.name || 'Department'} • ${formatVisitorStatus(request.status)}`,
        })),
    [requests],
  );

  const canReviewRequest = (request: VisitorRequestRecord) => {
    if (request.approvalStatus !== 'PENDING') return false;
    if (userIsAdmin || isSecurityUser) return true;
    return request.personToMeetUserId === user?.authId;
  };

  const canConfigureExperience = userIsAdmin || isSecurityUser;

  const loadPlants = useCallback(async () => {
    try {
      const response = await listPlants({ page: 1, limit: 200, includeInactive: false });
      const availablePlants = response.data;
      setPlants(availablePlants);

      const fallbackPlantId = user?.plantId || availablePlants[0]?.id || '';
      setSelectedPlantId((current) => current || fallbackPlantId);
    } catch {
      if (user?.plantId && user?.plantCode && user?.plantName) {
        setPlants([
          {
            id: user.plantId,
            plantCode: user.plantCode,
            plantName: user.plantName,
            location: null,
            plantAdminId: null,
            organizationId: user.organizationId || '',
            isActive: true,
            createdAt: '',
            updatedAt: '',
          },
        ]);
        setSelectedPlantId(user.plantId);
      }
    }
  }, [user?.organizationId, user?.plantCode, user?.plantId, user?.plantName]);

  const loadReferenceData = useCallback(async (plantId: string) => {
    const [departmentResponse, moduleResponse, userResponse, gateResponse] = await Promise.all([
      listDepartments({ page: 1, limit: 300, plantId, includeInactive: false }),
      listModules({ page: 1, limit: 400, plantId, includeInactive: false }),
      listUsers({ page: 1, limit: 400, plantId, includeInactive: false }),
      listGates({ page: 1, limit: 100, plantId, includeInactive: false }),
    ]);

    setDepartments(departmentResponse.data || []);
    setModules(moduleResponse.data || []);

    const filteredEmployees = (userResponse.data || []).filter((profile) => {
      const roles = (profile.roles ?? []).map((role) => role.toUpperCase());
      return !roles.includes('VISITOR');
    });
    setEmployees(filteredEmployees);

    const activeGates = (gateResponse.data || []).filter((gate) => gate.isActive);
    setGates(activeGates);

    setRequestForm((current) => ({
      ...current,
      gateId: current.gateId || activeGates[0]?.id || '',
      personToMeetUserId: current.personToMeetUserId || filteredEmployees[0]?.userId || '',
    }));
  }, []);

  const loadVisitorExperienceContext = useCallback(async (plantId: string) => {
    if (!plantId) return;

    const [contentResponse, layoutResponse, requestResponse, insightResponse] = await Promise.all([
      getVisitorExperienceContent(plantId),
      getPlantVisitorLayout(plantId),
      listVisitorRequests({ plantId, scope: requestScope, search: requestSearch || undefined, page: 1, limit: 100 }),
      getVisitorInsights({ plantId }),
    ]);

    setContent(contentResponse.data);
    setContentDraft({
      pageTitle: contentResponse.data.pageTitle || 'Welcome to JK Fenner',
      companyOverview: contentResponse.data.companyOverview || '',
      contactName: contentResponse.data.contactName || '',
      contactEmail: contentResponse.data.contactEmail || '',
      contactPhone: contentResponse.data.contactPhone || '',
      contactAddress: contentResponse.data.contactAddress || '',
      productsJson: prettyJson(contentResponse.data.products || []),
    });

    setLayout(layoutResponse.data);
    setLayoutDraft({
      layoutName: layoutResponse.data.layoutName || 'Plant Layout',
      svgMarkup: layoutResponse.data.svgMarkup || '',
      mapDataJson: prettyJson(layoutResponse.data.mapData || { nodes: [], edges: [] }),
    });

    setRequests(requestResponse.data || []);
    setInsights(insightResponse.data);

    if (requestResponse.data.length > 0) {
      const firstApprovedRequest = requestResponse.data.find((request) => request.approvalStatus === 'APPROVED' && request.navigationEnabled);
      if (firstApprovedRequest) {
        setSelectedRequestId((current) => current || firstApprovedRequest.id);
      }
    }
  }, [requestScope, requestSearch]);

  const refreshAll = useCallback(async () => {
    if (!selectedPlantId) return;
    setLoading(true);
    try {
      await loadReferenceData(selectedPlantId);
      await loadVisitorExperienceContext(selectedPlantId);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to load visitor experience'));
    } finally {
      setLoading(false);
    }
  }, [loadReferenceData, loadVisitorExperienceContext, selectedPlantId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadPlants();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPlants]);

  useEffect(() => {
    if (!selectedPlantId) return;
    void refreshAll();
  }, [refreshAll, selectedPlantId]);

  useEffect(() => {
    if (!selectedPlantId) return;
    void loadVisitorExperienceContext(selectedPlantId).catch((error: unknown) => {
      toast.error(resolveErrorMessage(error, 'Failed to refresh visitor requests'));
    });
  }, [loadVisitorExperienceContext, selectedPlantId]);

  const handleSubmitVisitorRequest = async () => {
    if (!selectedPlantId) {
      toast.error('Select a plant before submitting visitor request');
      return;
    }
    if (!requestForm.personToMeetUserId) {
      toast.error('Select the employee to visit');
      return;
    }
    if (!requestForm.visitorName.trim() || !requestForm.purpose.trim()) {
      toast.error('Visitor name and purpose are required');
      return;
    }

    setSubmittingRequest(true);
    try {
      await createVisitorRequest({
        gateId: requestForm.gateId || null,
        plantId: selectedPlantId,
        departmentId: requestForm.departmentId || null,
        moduleId: requestForm.moduleId || null,
        personToMeetUserId: requestForm.personToMeetUserId,
        visitorName: requestForm.visitorName.trim(),
        visitorCompany: requestForm.visitorCompany.trim() || null,
        visitorPhone: requestForm.visitorPhone.trim() || null,
        purpose: requestForm.purpose.trim(),
        desiredVisitAt: requestForm.desiredVisitAt || null,
        idProofType: requestForm.idProofType.trim() || null,
        idProofNumber: requestForm.idProofNumber.trim() || null,
        vehicleNumber: requestForm.vehicleNumber.trim() || null,
        remarks: requestForm.remarks.trim() || null,
      });

      toast.success('Visitor request submitted successfully');
      setRequestForm((current) => ({
        ...current,
        purpose: '',
        desiredVisitAt: '',
        idProofType: '',
        idProofNumber: '',
        vehicleNumber: '',
        remarks: '',
      }));

      await loadVisitorExperienceContext(selectedPlantId);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to submit visitor request'));
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleReviewVisitorRequest = async (request: VisitorRequestRecord, action: 'APPROVE' | 'REJECT') => {
    if (!canReviewRequest(request)) return;

    const commentsPrompt = action === 'REJECT' ? 'Enter rejection comments (required):' : 'Enter approval comments (optional):';
    const comments = window.prompt(commentsPrompt, action === 'REJECT' ? 'Please update visit details and resubmit.' : '') ?? '';

    if (action === 'REJECT' && !comments.trim()) {
      toast.error('Rejection comments are required');
      return;
    }

    setReviewingRequestId(request.id);
    try {
      await approveSmartVisitor({
        gateEntryId: request.id,
        action,
        comments: comments.trim() || null,
      });

      toast.success(action === 'APPROVE' ? 'Visitor request approved' : 'Visitor request rejected');
      await loadVisitorExperienceContext(selectedPlantId);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, `Failed to ${action.toLowerCase()} visitor request`));
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleSaveContent = async () => {
    if (!selectedPlantId) {
      toast.error('Select a plant before saving content');
      return;
    }

    let products: VisitorExperienceProduct[] = [];
    try {
      const parsed = JSON.parse(contentDraft.productsJson || '[]');
      if (!Array.isArray(parsed)) {
        toast.error('Products must be a JSON array');
        return;
      }
      products = parsed;
    } catch {
      toast.error('Products JSON is invalid');
      return;
    }

    setSavingContent(true);
    try {
      const response = await saveVisitorExperienceContent({
        plantId: selectedPlantId,
        pageTitle: contentDraft.pageTitle,
        companyOverview: contentDraft.companyOverview || null,
        contactName: contentDraft.contactName || null,
        contactEmail: contentDraft.contactEmail || null,
        contactPhone: contentDraft.contactPhone || null,
        contactAddress: contentDraft.contactAddress || null,
        products,
      });
      setContent(response.data);
      toast.success('Visitor experience content saved');
      await loadVisitorExperienceContext(selectedPlantId);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to save visitor content'));
    } finally {
      setSavingContent(false);
    }
  };

  const handleSaveLayout = async () => {
    if (!selectedPlantId) {
      toast.error('Select a plant before saving layout');
      return;
    }

    let mapData: { nodes: PlantLayoutNode[]; edges: PlantLayoutEdge[] };
    try {
      const parsed = JSON.parse(layoutDraft.mapDataJson || '{}') as { nodes?: unknown; edges?: unknown };
      const nodes = Array.isArray(parsed.nodes)
        ? parsed.nodes
            .map((node) => parseLayoutNode(node))
            .filter((node): node is PlantLayoutNode => node !== null)
        : [];
      const edges = Array.isArray(parsed.edges)
        ? parsed.edges
            .map((edge) => parseLayoutEdge(edge))
            .filter((edge): edge is PlantLayoutEdge => edge !== null)
        : [];
      mapData = {
        nodes,
        edges,
      };
    } catch {
      toast.error('Layout map JSON is invalid');
      return;
    }

    setSavingLayout(true);
    try {
      const response = await savePlantVisitorLayout({
        plantId: selectedPlantId,
        layoutName: layoutDraft.layoutName,
        svgMarkup: layoutDraft.svgMarkup || null,
        mapData,
        publishNow: true,
      });
      setLayout(response.data);
      toast.success('Plant layout saved');
      await loadVisitorExperienceContext(selectedPlantId);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to save plant layout'));
    } finally {
      setSavingLayout(false);
    }
  };

  const loadDestinationAssets = useCallback(async (departmentId: string | null) => {
    if (!selectedPlantId || !departmentId) {
      setDepartmentMachines([]);
      setDestinationDepartmentId('');
      return;
    }

    const response = await listAssets({ page: 1, limit: 200, plantId: selectedPlantId, departmentId, includeInactive: false });
    setDestinationDepartmentId(departmentId);
    setDepartmentMachines(response.data || []);
  }, [selectedPlantId]);

  const handleLoadSessionStatus = useCallback(async (lookup?: { gateEntryId?: string; sessionToken?: string }) => {
    setLoadingSessionStatus(true);
    try {
      const response = await getVisitorSessionStatus({
        gateEntryId: lookup?.gateEntryId,
        sessionToken: lookup?.sessionToken,
      });
      setSessionStatus(response.data);
      if (response.data.gateEntryId) {
        setSelectedRequestId((current) => current || response.data.gateEntryId);
      }
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to fetch visitor session status'));
    } finally {
      setLoadingSessionStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRequestId) return;
    const interval = window.setInterval(() => {
      void handleLoadSessionStatus({ gateEntryId: selectedRequestId });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [handleLoadSessionStatus, selectedRequestId]);

  const handleGenerateRoute = async () => {
    if (!selectedRequestId) {
      toast.error('Select an approved visitor request to generate navigation route');
      return;
    }

    try {
      const response = await getSmartNavigationRoute({ gateEntryId: selectedRequestId });
      const smartRoute = response.data;

      const nodes: PlantLayoutNode[] = smartRoute.routeCoordinates.map((coordinate) => ({
        id: coordinate.id,
        label: coordinate.locationName,
        nodeType: coordinate.locationType,
        refId: coordinate.moduleId || coordinate.departmentId || coordinate.gateId || undefined,
      }));

      const lookup = Object.fromEntries(
        smartRoute.routeCoordinates.map((coordinate) => [
          coordinate.id,
          {
            latitude: Number(coordinate.latitude),
            longitude: Number(coordinate.longitude),
            label: coordinate.locationName,
            departmentId: coordinate.departmentId,
          },
        ]),
      );
      setRouteCoordinateLookup(lookup);

      setRouteData({
        gateEntryId: smartRoute.gateEntryId,
        approvalStatus: smartRoute.sessionStatus,
        sourceNode: {
          id: smartRoute.source.id,
          label: smartRoute.source.locationName,
          nodeType: smartRoute.source.locationType,
          refId: smartRoute.source.moduleId || smartRoute.source.departmentId || smartRoute.source.gateId || undefined,
        },
        destinationNode: {
          id: smartRoute.destination.id,
          label: smartRoute.destination.locationName,
          nodeType: smartRoute.destination.locationType,
          refId: smartRoute.destination.moduleId || smartRoute.destination.departmentId || smartRoute.destination.gateId || undefined,
        },
        pathNodes: nodes,
        instructions: smartRoute.steps,
        svgMarkup: layout?.svgMarkup || null,
        mapData: {
          nodes,
          edges: [],
        },
      });

      setCurrentNodeId(smartRoute.source.id);
      await Promise.all([
        loadDestinationAssets(smartRoute.destination.departmentId),
        handleLoadSessionStatus({ gateEntryId: selectedRequestId }),
      ]);
      toast.success('Navigation route generated');
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to generate route'));
    }
  };

  const handleManualCheckIn = async () => {
    if (!selectedRequestId) {
      toast.error('Select a visitor request first');
      return;
    }

    const selectedNode = routeCoordinateLookup[currentNodeId];
    if (!selectedNode) {
      toast.error('Select a checkpoint node for check-in');
      return;
    }

    setUpdatingLocation(true);
    try {
      await updateVisitorLocation({
        gateEntryId: selectedRequestId,
        nodeId: currentNodeId,
        nodeLabel: selectedNode.label,
        latitude: selectedNode.latitude,
        longitude: selectedNode.longitude,
        source: 'CHECKPOINT',
      });
      toast.success('Checkpoint check-in recorded');
      await Promise.all([
        loadVisitorExperienceContext(selectedPlantId),
        handleLoadSessionStatus({ gateEntryId: selectedRequestId }),
      ]);
    } catch (error: unknown) {
      toast.error(resolveErrorMessage(error, 'Failed to record checkpoint'));
    } finally {
      setUpdatingLocation(false);
    }
  };

  const handleGpsCheckIn = async () => {
    if (!selectedRequestId) {
      toast.error('Select a visitor request first');
      return;
    }

    if (!('geolocation' in navigator)) {
      toast.error('GPS is not available on this device');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setUpdatingLocation(true);
        try {
          await updateVisitorLocation({
            gateEntryId: selectedRequestId,
            nodeId: currentNodeId || null,
            nodeLabel: routeData?.mapData.nodes.find((node) => node.id === currentNodeId)?.label || 'GPS location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            source: 'GPS',
          });
          toast.success('GPS location check-in recorded');
          await Promise.all([
            loadVisitorExperienceContext(selectedPlantId),
            handleLoadSessionStatus({ gateEntryId: selectedRequestId }),
          ]);
        } catch (error: unknown) {
          toast.error(resolveErrorMessage(error, 'Failed to save GPS location'));
        } finally {
          setUpdatingLocation(false);
        }
      },
      () => {
        toast.error('Unable to capture GPS location');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
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
    <PageShell>
      <PageHeader
        title="Visitor Experience"
        subtitle="Plant visitor page, smart approval flow, and digital navigation integrated with Gate Entry and Asset hierarchy."
        actions={
          <div className="flex flex-wrap gap-2">
            <SelectField label="" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" className="w-[250px]" />
            <Button variant="outline" onClick={() => void refreshAll()}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.pendingApprovals || 0}</p><p className="text-xs text-muted-foreground">Pending Approvals</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.approvedToday || 0}</p><p className="text-xs text-muted-foreground">Approved Today</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.rejectedToday || 0}</p><p className="text-xs text-muted-foreground">Rejected Today</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.activeVisitors || 0}</p><p className="text-xs text-muted-foreground">Active Visitors</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.navigationEnabled || 0}</p><p className="text-xs text-muted-foreground">Navigation Enabled</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-2xl font-semibold">{insights?.liveTracked || 0}</p><p className="text-xs text-muted-foreground">Live Tracking Points</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>{content?.pageTitle || 'Welcome to JK Fenner'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{content?.companyOverview || 'Company overview is being updated for this plant.'}</p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(content?.products || []).map((product) => (
                <button
                  key={product.id || product.name}
                  type="button"
                  className="rounded-2xl border border-border/70 bg-background p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => setSelectedProduct(product)}
                >
                  <p className="font-semibold text-foreground">{product.name}</p>
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{product.description || 'Click to view product details and linked departments.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(product.linkedDepartments || []).slice(0, 2).map((department) => (
                      <Badge key={department.id} variant="secondary">{department.code}</Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-semibold">Contact</p>
              <p className="mt-2 text-sm text-muted-foreground">{content?.contactName || 'Front Office'} • {content?.contactEmail || 'frontdesk@jkfenner.com'}</p>
              <p className="text-sm text-muted-foreground">{content?.contactPhone || '+91-00000-00000'}</p>
              <p className="text-sm text-muted-foreground">{content?.contactAddress || selectedPlant?.location || 'Plant contact address unavailable.'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Smart Visitor Flow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SelectField label="Gate" value={requestForm.gateId} onChange={(value) => setRequestForm((current) => ({ ...current, gateId: value }))} options={gateOptions} placeholder="Select gate" />
            <SelectField label="Department" value={requestForm.departmentId} onChange={(value) => setRequestForm((current) => ({ ...current, departmentId: value, moduleId: '' }))} options={filteredDepartments.map((department) => ({ value: department.id, label: `${department.code} - ${department.name}` }))} placeholder="Select department" />
            <SelectField label="Module" value={requestForm.moduleId} onChange={(value) => setRequestForm((current) => ({ ...current, moduleId: value }))} options={filteredModules.map((module) => ({ value: module.id, label: module.code ? `${module.code} - ${module.name}` : module.name }))} placeholder="Select module" />
            <SelectField label="Employee to Visit" value={requestForm.personToMeetUserId} onChange={(value) => setRequestForm((current) => ({ ...current, personToMeetUserId: value }))} options={employeeOptions} placeholder="Select employee" required />
            <InputField label="Visitor Name" value={requestForm.visitorName} onChange={(value) => setRequestForm((current) => ({ ...current, visitorName: value }))} required />
            <InputField label="Company" value={requestForm.visitorCompany} onChange={(value) => setRequestForm((current) => ({ ...current, visitorCompany: value }))} />
            <InputField label="Phone" value={requestForm.visitorPhone} onChange={(value) => setRequestForm((current) => ({ ...current, visitorPhone: value }))} />
            <TextareaField label="Purpose of Visit" value={requestForm.purpose} onChange={(value) => setRequestForm((current) => ({ ...current, purpose: value }))} rows={3} required />
            <InputField
              label="Desired Visit Time"
              type="datetime-local"
              value={requestForm.desiredVisitAt}
              onChange={(value) => setRequestForm((current) => ({ ...current, desiredVisitAt: value }))}
              placeholder="Select desired visit date and time"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <InputField label="ID Proof Type" value={requestForm.idProofType} onChange={(value) => setRequestForm((current) => ({ ...current, idProofType: value }))} />
              <InputField label="ID Proof Number" value={requestForm.idProofNumber} onChange={(value) => setRequestForm((current) => ({ ...current, idProofNumber: value }))} />
            </div>
            <InputField label="Vehicle Number" value={requestForm.vehicleNumber} onChange={(value) => setRequestForm((current) => ({ ...current, vehicleNumber: value }))} />
            <TextareaField label="Additional Remarks" value={requestForm.remarks} onChange={(value) => setRequestForm((current) => ({ ...current, remarks: value }))} rows={2} />
            <Button className="w-full" onClick={() => void handleSubmitVisitorRequest()} disabled={submittingRequest}>
              {submittingRequest ? 'Submitting request...' : 'Submit Visitor Request'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Plant Digital Map</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Phase 1 static layout is enabled. Phase 2 live navigation uses GPS or checkpoint updates after approval.</p>

            <div className="rounded-2xl border border-border/70 bg-slate-50 p-3">
              {layout?.svgMarkup ? (
                <div className="max-h-[420px] overflow-auto rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: layout.svgMarkup }} />
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No plant layout published yet.</div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <SelectField label="Approved Request" value={selectedRequestId} onChange={setSelectedRequestId} options={requestOptions} placeholder="Select approved visitor request" />
              <Button className="md:mt-7" onClick={() => void handleGenerateRoute()} disabled={!selectedRequestId}>
                Generate Route
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                placeholder="Session token / QR token (optional)"
                value={sessionTokenInput}
                onChange={(event) => setSessionTokenInput(event.target.value)}
              />
              <Button
                className="md:mt-0"
                variant="outline"
                onClick={() =>
                  void handleLoadSessionStatus(
                    sessionTokenInput.trim()
                      ? { sessionToken: sessionTokenInput.trim() }
                      : selectedRequestId
                        ? { gateEntryId: selectedRequestId }
                        : undefined,
                  )
                }
                disabled={loadingSessionStatus && !selectedRequestId && !sessionTokenInput.trim()}
              >
                {loadingSessionStatus ? 'Loading Session...' : 'Check Session'}
              </Button>
            </div>

            {sessionStatus ? (
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Session Status</p>
                  <StatusBadge variant={sessionStatus.accessAllowed ? 'active' : 'warning'}>
                    {sessionStatus.status}
                  </StatusBadge>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>Access: {sessionStatus.accessAllowed ? 'Allowed' : 'Restricted'}</p>
                  <p>Approval: {sessionStatus.approvalStatus}</p>
                  <p>Start: {sessionStatus.startTime ? format(new Date(sessionStatus.startTime), 'dd MMM yyyy, HH:mm') : '-'}</p>
                  <p>End: {sessionStatus.endTime ? format(new Date(sessionStatus.endTime), 'dd MMM yyyy, HH:mm') : '-'}</p>
                  <p>Remaining: {Math.max(0, Math.floor(sessionStatus.remainingSeconds / 60))} mins</p>
                  <p>Last Node: {sessionStatus.currentLocation.nodeLabel || '-'}</p>
                </div>
              </div>
            ) : null}

            {routeData ? (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-semibold">Navigation Instructions</p>
                <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                  {routeData.instructions.map((instruction, index) => (
                    <li key={`instruction-${index}`}>{instruction}</li>
                  ))}
                </ol>

                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <SelectField
                    label="Checkpoint"
                    value={currentNodeId}
                    onChange={setCurrentNodeId}
                    options={routeData.mapData.nodes.map((node) => ({ value: node.id, label: `${node.nodeType}: ${node.label}` }))}
                    placeholder="Select checkpoint"
                  />
                  <Button className="md:mt-7" variant="outline" onClick={() => void handleManualCheckIn()}>
                    {updatingLocation ? 'Updating...' : 'Manual Check-in'}
                  </Button>
                  <Button className="md:mt-7" variant="outline" onClick={() => void handleGpsCheckIn()} disabled={updatingLocation}>
                    GPS Check-in
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-semibold">Department Details (Assets Hierarchy)</p>
              {destinationDepartmentId ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Department: {filteredDepartments.find((department) => department.id === destinationDepartmentId)?.name || destinationDepartmentId}
                  </p>
                  <div className="max-h-40 space-y-2 overflow-auto pr-1">
                    {departmentMachines.map((machine) => (
                      <div key={machine.id} className="rounded-xl border border-border/60 bg-background p-2 text-xs">
                        <p className="font-medium text-foreground">{machine.code} - {machine.name}</p>
                        <p className="text-muted-foreground">Type: {machine.assetType} · Status: {machine.status}</p>
                      </div>
                    ))}
                    {departmentMachines.length === 0 ? <p className="text-xs text-muted-foreground">No mapped machines found for destination department.</p> : null}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Generate a route to load department-level product and machine details.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Visitor Requests & Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
              <Input placeholder="Search visitor, company, purpose..." value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} />
              <SelectField label="" value={requestScope} onChange={(value) => setRequestScope(value as 'my-requests' | 'approvals' | 'all')} options={requestScopeOptions} />
            </div>

            <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
              {requests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-border/70 bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{request.visitorName}</p>
                      <p className="text-xs text-muted-foreground">{request.visitorCompany || 'Independent Visitor'} • {request.department?.name || 'Department not selected'}</p>
                    </div>
                    <StatusBadge variant={getStatusVariant(request.approvalStatus)}>{formatVisitorStatus(request.approvalStatus)}</StatusBadge>
                  </div>

                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    <p>Purpose: {request.purpose || '-'}</p>
                    <p>To Meet: {request.personToMeetUser?.fullName || request.personToMeet || '-'}</p>
                    <p>Requested: {request.approvalRequestedAt ? format(new Date(request.approvalRequestedAt), 'dd MMM yyyy, HH:mm') : '-'}</p>
                    <p>Status: {formatVisitorStatus(request.status)}</p>
                    {request.approvalComments ? <p>Comments: {request.approvalComments}</p> : null}
                  </div>

                  {canReviewRequest(request) ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleReviewVisitorRequest(request, 'APPROVE')}
                        disabled={reviewingRequestId === request.id}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleReviewVisitorRequest(request, 'REJECT')}
                        disabled={reviewingRequestId === request.id}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}

              {requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No visitor requests found for the selected scope.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Visitors Per Employee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(insights?.visitorsPerEmployee || []).map((row) => (
              <div key={row.userId}>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{row.employeeName}</span>
                  <span>{row.total}</span>
                </div>
                <Progress
                  className="h-2 bg-muted"
                  value={Math.min(100, (row.total / Math.max(1, (insights?.visitorsPerEmployee?.[0]?.total || 1))) * 100)}
                />
              </div>
            ))}
            {(insights?.visitorsPerEmployee || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No employee-wise visitor records yet.</p>
            ) : null}
          </CardContent>
        </Card>

        {canConfigureExperience ? (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Admin Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 rounded-2xl border border-border/70 p-3">
                <p className="text-sm font-semibold">Visitor Page Content</p>
                <InputField label="Page Title" value={contentDraft.pageTitle} onChange={(value) => setContentDraft((current) => ({ ...current, pageTitle: value }))} />
                <TextareaField label="Company Overview" value={contentDraft.companyOverview} onChange={(value) => setContentDraft((current) => ({ ...current, companyOverview: value }))} rows={4} />
                <InputField label="Contact Name" value={contentDraft.contactName} onChange={(value) => setContentDraft((current) => ({ ...current, contactName: value }))} />
                <InputField label="Contact Email" value={contentDraft.contactEmail} onChange={(value) => setContentDraft((current) => ({ ...current, contactEmail: value }))} />
                <InputField label="Contact Phone" value={contentDraft.contactPhone} onChange={(value) => setContentDraft((current) => ({ ...current, contactPhone: value }))} />
                <TextareaField label="Contact Address" value={contentDraft.contactAddress} onChange={(value) => setContentDraft((current) => ({ ...current, contactAddress: value }))} rows={2} />
                <TextareaField
                  label="Products JSON"
                  value={contentDraft.productsJson}
                  onChange={(value) => setContentDraft((current) => ({ ...current, productsJson: value }))}
                  rows={8}
                />
                <Button onClick={() => void handleSaveContent()} disabled={savingContent}>{savingContent ? 'Saving content...' : 'Save Visitor Content'}</Button>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 p-3">
                <p className="text-sm font-semibold">Plant Layout</p>
                <InputField label="Layout Name" value={layoutDraft.layoutName} onChange={(value) => setLayoutDraft((current) => ({ ...current, layoutName: value }))} />
                <TextareaField
                  label="SVG Markup"
                  value={layoutDraft.svgMarkup}
                  onChange={(value) => setLayoutDraft((current) => ({ ...current, svgMarkup: value }))}
                  rows={8}
                />
                <TextareaField
                  label="Map Data JSON"
                  value={layoutDraft.mapDataJson}
                  onChange={(value) => setLayoutDraft((current) => ({ ...current, mapDataJson: value }))}
                  rows={10}
                />
                <Button onClick={() => void handleSaveLayout()} disabled={savingLayout}>{savingLayout ? 'Saving layout...' : 'Save Plant Layout'}</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProduct?.name || 'Product'}</DialogTitle>
            <DialogDescription>Linked to existing plant hierarchy for guided visitor navigation.</DialogDescription>
          </DialogHeader>
          {selectedProduct ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{selectedProduct.description || 'No description provided.'}</p>
              <div className="flex flex-wrap gap-2">
                {(selectedProduct.linkedDepartments || []).map((department) => (
                  <Badge key={department.id} variant="secondary">{department.code} - {department.name}</Badge>
                ))}
              </div>
              {(selectedProduct.linkedDepartments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No linked departments configured for this product yet.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
