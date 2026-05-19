import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DoorOpen, Loader2, MapPinned, Plus, Search, Settings2, Trash2 } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { broadcastGateSync, subscribeGateSync } from "@/lib/gate-sync";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import {
  getPlantVisitorLayout,
  savePlantVisitorLayout,
  type PlantLayoutEdge,
  type PlantLayoutNode,
} from "@/api/visitorExperience";
import {
  createGate,
  createGateTemplate,
  deleteGate,
  deleteGateTemplate,
  getGateSyncStatus,
  listGates,
  listGateTemplates,
  updateGate,
  updateGateTemplate,
  type Gate,
  type GateTemplate,
} from "@/api/gates";

const gateTypeOptions = [
  { value: "MAIN_GATE", label: "Main Gate" },
  { value: "VISITOR_GATE", label: "Visitor Gate" },
  { value: "MATERIAL_GATE", label: "Material Gate" },
  { value: "DISPATCH_GATE", label: "Dispatch Gate" },
  { value: "STAFF_GATE", label: "Staff Gate" },
  { value: "EMPLOYEE_GATE", label: "Employee Gate" },
];

const visitorTypeOptions = [
  { value: "EMPLOYEE_ENTRY", label: "Employee Entry" },
  { value: "VISITOR_ENTRY", label: "Visitor Entry" },
  { value: "VENDOR_ENTRY", label: "Vendor Entry" },
  { value: "CONTRACTOR_ENTRY", label: "Contractor Entry" },
  { value: "MATERIAL_INWARD", label: "Material Inward" },
  { value: "MATERIAL_OUTWARD", label: "Material Outward" },
  { value: "VEHICLE_ENTRY", label: "Vehicle Entry" },
  { value: "COURIER_ENTRY", label: "Courier Entry" },
  { value: "WASTE_DISPOSAL", label: "Waste Disposal" },
];

const defaultGateType = "MAIN_GATE";

type ActiveTab = "gates" | "templates" | "plant-layout";

type LayoutNodeFormState = {
  label: string;
  nodeType: string;
  refId: string;
  x: string;
  y: string;
  latitude: string;
  longitude: string;
};

const emptyLayoutNodeForm: LayoutNodeFormState = {
  label: "",
  nodeType: "CHECKPOINT",
  refId: "",
  x: "",
  y: "",
  latitude: "",
  longitude: "",
};

function parseNumericInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function formatVisitorType(visitorType: string) {
  const matched = visitorTypeOptions.find((option) => option.value === visitorType);
  return matched?.label || visitorType.replace(/_/g, " ");
}

export default function GateMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();
  const syncVersionRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("gates");

  const [gatesLoading, setGatesLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [savingGate, setSavingGate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [gates, setGates] = useState<Gate[]>([]);
  const [templates, setTemplates] = useState<GateTemplate[]>([]);

  const [searchGate, setSearchGate] = useState("");
  const [searchTemplate, setSearchTemplate] = useState("");

  const [gateDialog, setGateDialog] = useState(false);
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);
  const [gateForm, setGateForm] = useState({
    gateName: "",
    gateTypes: [defaultGateType] as string[],
    plantId: defaultPlantId,
    location: "",
    securityUserIds: [] as string[],
  });

  const [templateDialog, setTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GateTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    gateId: "",
    visitorTypes: ["VISITOR_ENTRY"] as string[],
  });

  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutPlantId, setLayoutPlantId] = useState(canSelectPlant ? "" : defaultPlantId);
  const [layoutName, setLayoutName] = useState("Plant Layout");
  const [layoutSvgMarkup, setLayoutSvgMarkup] = useState("");
  const [layoutNodes, setLayoutNodes] = useState<PlantLayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<PlantLayoutEdge[]>([]);
  const [newLayoutNode, setNewLayoutNode] = useState<LayoutNodeFormState>(emptyLayoutNodeForm);
  const [newEdge, setNewEdge] = useState({
    fromNodeId: "",
    toNodeId: "",
    distance: "1",
    directional: false,
  });

  const plantName = useCallback(
    (plantId: string | null | undefined) => plantsOptions.find((item) => item.value === plantId)?.label || "-",
    [plantsOptions],
  );

  const gateById = useMemo(() => {
    return new Map(gates.map((gate) => [gate.id, gate]));
  }, [gates]);

  const gateOptions = useMemo(
    () => gates.map((gate) => ({ value: gate.id, label: `${gate.gateName} (${gate.gateCode})` })),
    [gates],
  );

  const templateCountByGate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of templates) {
      if (!template.isActive) continue;
      counts.set(template.gateId, (counts.get(template.gateId) || 0) + 1);
    }
    return counts;
  }, [templates]);

  const filteredGates = useMemo(() => {
    const keyword = searchGate.trim().toLowerCase();
    if (!keyword) return gates;

    return gates.filter((gate) => {
      return [gate.gateName, gate.gateCode, gate.location || "", gate.gateType].join(" ").toLowerCase().includes(keyword);
    });
  }, [gates, searchGate]);

  const filteredTemplates = useMemo(() => {
    const keyword = searchTemplate.trim().toLowerCase();
    if (!keyword) return templates;

    return templates.filter((template) => {
      const gateName = template.gate?.gateName || gateById.get(template.gateId)?.gateName || "";
      return [template.templateName, template.visitorType, gateName].join(" ").toLowerCase().includes(keyword);
    });
  }, [gateById, searchTemplate, templates]);

  const loadGates = useCallback(async () => {
    setGatesLoading(true);
    try {
      const response = await listGates({
        page: 1,
        limit: 250,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setGates(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load gates"));
    } finally {
      setGatesLoading(false);
    }
  }, [canSelectPlant, defaultPlantId]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const response = await listGateTemplates({
        page: 1,
        limit: 250,
        plantId: canSelectPlant ? undefined : defaultPlantId || undefined,
      });
      setTemplates(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load template configuration"));
    } finally {
      setTemplatesLoading(false);
    }
  }, [canSelectPlant, defaultPlantId]);

  useEffect(() => {
    void fetchPlants();
    void loadGates();
    void loadTemplates();
  }, [fetchPlants, loadGates, loadTemplates]);

  useEffect(() => {
    const unsubscribe = subscribeGateSync(() => {
      void loadGates();
      void loadTemplates();
    });
    return unsubscribe;
  }, [loadGates, loadTemplates]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getGateSyncStatus({ plantId: canSelectPlant ? undefined : defaultPlantId || undefined });
          const nextVersion = `${response.data.configVersion || ""}:${response.data.activityVersion || ""}`;
          if (syncVersionRef.current && syncVersionRef.current !== nextVersion) {
            await Promise.all([loadGates(), loadTemplates()]);
          }
          syncVersionRef.current = nextVersion;
        } catch {
          // Ignore background sync failures.
        }
      })();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [canSelectPlant, defaultPlantId, loadGates, loadTemplates]);

  const loadPlantLayout = useCallback(async (plantId: string) => {
    if (!plantId) return;

    setLayoutLoading(true);
    try {
      const response = await getPlantVisitorLayout(plantId);
      setLayoutName(response.data.layoutName || "Plant Layout");
      setLayoutSvgMarkup(response.data.svgMarkup || "");
      setLayoutNodes(response.data.mapData?.nodes || []);
      setLayoutEdges(response.data.mapData?.edges || []);
    } catch (error: unknown) {
      setLayoutName("Plant Layout");
      setLayoutSvgMarkup("");
      setLayoutNodes([]);
      setLayoutEdges([]);
      toast.error(getErrorMessage(error, "Failed to load plant layout"));
    } finally {
      setLayoutLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canSelectPlant) {
      if (!layoutPlantId && plantsOptions.length > 0) {
        setLayoutPlantId(plantsOptions[0].value);
      }
      return;
    }

    if (defaultPlantId && layoutPlantId !== defaultPlantId) {
      setLayoutPlantId(defaultPlantId);
    }
  }, [canSelectPlant, defaultPlantId, layoutPlantId, plantsOptions]);

  useEffect(() => {
    if (activeTab !== "plant-layout" || !layoutPlantId) return;
    void loadPlantLayout(layoutPlantId);
  }, [activeTab, layoutPlantId, loadPlantLayout]);

  const openCreateGateDialog = () => {
    setSelectedGate(null);
    setGateForm({
      gateName: "",
      gateTypes: [defaultGateType],
      plantId: canSelectPlant ? "" : defaultPlantId,
      location: "",
      securityUserIds: [],
    });
    setGateDialog(true);
  };

  const openEditGateDialog = (gate: Gate) => {
    setSelectedGate(gate);
    setGateForm({
      gateName: gate.gateName,
      gateTypes: [gate.gateType || defaultGateType],
      plantId: gate.plantId || (canSelectPlant ? "" : defaultPlantId),
      location: gate.location || "",
      securityUserIds: gate.securityUserIds || [],
    });
    setGateDialog(true);
  };

  const saveGate = async () => {
    if (!gateForm.gateName.trim()) {
      toast.error("Gate number is required");
      return;
    }
    const selectedGateTypes = Array.from(new Set(gateForm.gateTypes.filter(Boolean)));
    if (selectedGateTypes.length === 0) {
      toast.error("Select at least one gate type");
      return;
    }
    if (canSelectPlant && !gateForm.plantId) {
      toast.error("Select a plant");
      return;
    }

    setSavingGate(true);
    try {
      const basePayload = {
        gateName: gateForm.gateName.trim(),
        plantId: canSelectPlant ? gateForm.plantId || null : defaultPlantId || null,
        location: gateForm.location.trim() || null,
        securityUserIds: gateForm.securityUserIds,
      };

      if (selectedGate) {
        const [primaryType, ...additionalTypes] = selectedGateTypes;
        await updateGate(selectedGate.id, { ...basePayload, gateType: primaryType });
        if (additionalTypes.length > 0) {
          await Promise.all(
            additionalTypes.map((gateType) =>
              createGate({
                ...basePayload,
                gateType,
              }),
            ),
          );
        }
        toast.success(
          additionalTypes.length > 0
            ? `Gate updated and ${additionalTypes.length} additional gate${additionalTypes.length > 1 ? "s" : ""} created`
            : "Gate updated",
        );
      } else {
        await Promise.all(
          selectedGateTypes.map((gateType) =>
            createGate({
              ...basePayload,
              gateType,
            }),
          ),
        );
        toast.success(selectedGateTypes.length > 1 ? `${selectedGateTypes.length} gates created` : "Gate created");
      }

      broadcastGateSync();
      setGateDialog(false);
      await Promise.all([loadGates(), loadTemplates()]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save gate"));
      await loadGates();
    } finally {
      setSavingGate(false);
    }
  };

  const openCreateTemplateDialog = () => {
    setSelectedTemplate(null);
    setTemplateForm({
      gateId: "",
      visitorTypes: ["VISITOR_ENTRY"],
    });
    setTemplateDialog(true);
  };

  const openEditTemplateDialog = (template: GateTemplate) => {
    setSelectedTemplate(template);
    setTemplateForm({
      gateId: template.gateId,
      visitorTypes: [template.visitorType],
    });
    setTemplateDialog(true);
  };

  const resolveTemplateName = (gateId: string, visitorType: string) => {
    const gateName = gateById.get(gateId)?.gateName || "Gate";
    return `${gateName} - ${formatVisitorType(visitorType)}`;
  };

  const saveTemplate = async () => {
    if (!templateForm.gateId) {
      toast.error("Select a gate");
      return;
    }
    const selectedVisitorTypes = Array.from(new Set(templateForm.visitorTypes.filter(Boolean)));
    if (selectedVisitorTypes.length === 0) {
      toast.error("Select at least one allowed entry type");
      return;
    }

    const duplicateTypes = selectedVisitorTypes.filter((visitorType) =>
      templates.some(
        (template) =>
          template.id !== selectedTemplate?.id
          && template.gateId === templateForm.gateId
          && template.isActive
          && template.visitorType === visitorType,
      ),
    );

    if (duplicateTypes.length > 0) {
      toast.error(`Configuration already exists for: ${duplicateTypes.map(formatVisitorType).join(", ")}`);
      return;
    }

    const selectedGateRecord = gateById.get(templateForm.gateId);
    const resolvedPlantId = selectedGateRecord?.plantId ?? (canSelectPlant ? null : defaultPlantId || null);

    setSavingTemplate(true);
    try {
      const buildTemplatePayload = (visitorType: string) => ({
        gateId: templateForm.gateId,
        plantId: resolvedPlantId,
        templateName: resolveTemplateName(templateForm.gateId, visitorType),
        visitorType,
        departmentId: null,
        moduleId: null,
        machineId: null,
        allowedRoles: null,
        frequency: null,
        securityLevel: null,
      });

      if (selectedTemplate) {
        const [primaryType, ...additionalTypes] = selectedVisitorTypes;
        await updateGateTemplate(selectedTemplate.id, buildTemplatePayload(primaryType));
        if (additionalTypes.length > 0) {
          await Promise.all(additionalTypes.map((visitorType) => createGateTemplate(buildTemplatePayload(visitorType))));
        }
        toast.success(
          additionalTypes.length > 0
            ? `Template updated and ${additionalTypes.length} additional configuration${additionalTypes.length > 1 ? "s" : ""} created`
            : "Template configuration updated",
        );
      } else {
        await Promise.all(selectedVisitorTypes.map((visitorType) => createGateTemplate(buildTemplatePayload(visitorType))));
        toast.success(
          selectedVisitorTypes.length > 1
            ? `${selectedVisitorTypes.length} template configurations created`
            : "Template configuration created",
        );
      }

      broadcastGateSync();
      setTemplateDialog(false);
      await loadTemplates();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save template configuration"));
    } finally {
      setSavingTemplate(false);
    }
  };

  const addLayoutNode = () => {
    if (!newLayoutNode.label.trim()) {
      toast.error("Node label is required");
      return;
    }

    const generatedId = `NODE_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const nextNode: PlantLayoutNode = {
      id: generatedId,
      label: newLayoutNode.label.trim(),
      nodeType: newLayoutNode.nodeType.trim() || "CHECKPOINT",
      refId: newLayoutNode.refId.trim() || null,
      x: parseNumericInput(newLayoutNode.x),
      y: parseNumericInput(newLayoutNode.y),
      latitude: parseNumericInput(newLayoutNode.latitude),
      longitude: parseNumericInput(newLayoutNode.longitude),
    };

    setLayoutNodes((current) => [...current, nextNode]);
    setNewLayoutNode(emptyLayoutNodeForm);
  };

  const updateLayoutNode = (nodeId: string, key: keyof PlantLayoutNode, value: string | boolean) => {
    setLayoutNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;

        if (key === "x" || key === "y" || key === "latitude" || key === "longitude") {
          return {
            ...node,
            [key]: typeof value === "string" ? parseNumericInput(value) : undefined,
          };
        }

        if (key === "refId") {
          return {
            ...node,
            refId: typeof value === "string" && value.trim().length > 0 ? value.trim() : null,
          };
        }

        if (key === "label" || key === "nodeType") {
          return {
            ...node,
            [key]: typeof value === "string" ? value : node[key],
          };
        }

        return node;
      }),
    );
  };

  const removeLayoutNode = (nodeId: string) => {
    setLayoutNodes((current) => current.filter((node) => node.id !== nodeId));
    setLayoutEdges((current) => current.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId));
  };

  const addLayoutEdge = () => {
    if (!newEdge.fromNodeId || !newEdge.toNodeId) {
      toast.error("Select source and destination nodes");
      return;
    }
    if (newEdge.fromNodeId === newEdge.toNodeId) {
      toast.error("Source and destination cannot be the same node");
      return;
    }

    const alreadyExists = layoutEdges.some(
      (edge) => edge.fromNodeId === newEdge.fromNodeId && edge.toNodeId === newEdge.toNodeId,
    );
    if (alreadyExists) {
      toast.error("This edge already exists");
      return;
    }

    setLayoutEdges((current) => [
      ...current,
      {
        fromNodeId: newEdge.fromNodeId,
        toNodeId: newEdge.toNodeId,
        distance: parseNumericInput(newEdge.distance) ?? 1,
        directional: newEdge.directional,
      },
    ]);
    setNewEdge({ fromNodeId: "", toNodeId: "", distance: "1", directional: false });
  };

  const updateLayoutEdge = (index: number, key: keyof PlantLayoutEdge, value: string | boolean) => {
    setLayoutEdges((current) =>
      current.map((edge, edgeIndex) => {
        if (edgeIndex !== index) return edge;

        if (key === "distance") {
          return {
            ...edge,
            distance: typeof value === "string" ? parseNumericInput(value) ?? 1 : edge.distance,
          };
        }

        if (key === "directional") {
          return {
            ...edge,
            directional: Boolean(value),
          };
        }

        if (key === "fromNodeId" || key === "toNodeId") {
          return {
            ...edge,
            [key]: typeof value === "string" ? value : edge[key],
          };
        }

        return edge;
      }),
    );
  };

  const removeLayoutEdge = (index: number) => {
    setLayoutEdges((current) => current.filter((_, edgeIndex) => edgeIndex !== index));
  };

  const saveLayout = async () => {
    if (!layoutPlantId) {
      toast.error("Select a plant before saving layout");
      return;
    }
    if (layoutNodes.length === 0) {
      toast.error("Add at least one layout node");
      return;
    }

    setLayoutSaving(true);
    try {
      await savePlantVisitorLayout({
        plantId: layoutPlantId,
        layoutName: layoutName.trim() || "Plant Layout",
        svgMarkup: layoutSvgMarkup.trim() || null,
        mapData: {
          nodes: layoutNodes,
          edges: layoutEdges,
        },
        publishNow: true,
      });
      toast.success("Plant layout saved with GPS coordinates");
      await loadPlantLayout(layoutPlantId);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save plant layout"));
    } finally {
      setLayoutSaving(false);
    }
  };

  const templateNamePreview = useMemo(() => {
    if (!templateForm.gateId) return [] as string[];
    return Array.from(new Set(templateForm.visitorTypes.filter(Boolean))).map((visitorType) =>
      resolveTemplateName(templateForm.gateId, visitorType),
    );
  }, [templateForm.gateId, templateForm.visitorTypes]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Gate Master</h1>
        <p className="text-sm text-muted-foreground">Create gates with location details and configure allowed entry types for each gate.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="gates" className="gap-2"><DoorOpen className="h-4 w-4" /> Gates</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><Settings2 className="h-4 w-4" /> Template Configuration</TabsTrigger>
          <TabsTrigger value="plant-layout" className="gap-2"><MapPinned className="h-4 w-4" /> Plant Layout</TabsTrigger>
        </TabsList>

        <TabsContent value="gates" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" /> Gates ({filteredGates.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" value={searchGate} onChange={(event) => setSearchGate(event.target.value)} placeholder="Search gates..." />
                  </div>
                  <Button onClick={openCreateGateDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Gate
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {gatesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
              ) : filteredGates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No gates found for your search.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredGates.map((gate) => (
                    <Card key={gate.id} className="border border-border/70 shadow-none">
                      <CardContent className="space-y-3 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{gate.gateName}</p>
                            <p className="text-xs font-mono text-muted-foreground">{gate.gateCode}</p>
                          </div>
                          <StatusBadge variant={gate.isActive ? "active" : "default"} showDot>{gate.isActive ? "Active" : "Inactive"}</StatusBadge>
                        </div>

                        <p className="text-sm text-muted-foreground">{plantName(gate.plantId)} • {gate.location || "No location"}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{templateCountByGate.get(gate.id) ?? gate.templateCount ?? 0} entry types</Badge>
                          <Badge variant="outline">{gate.gateType.replace(/_/g, " ")}</Badge>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => openEditGateDialog(gate)}>Edit</Button>
                          <Button
                            variant="outline"
                            className="text-destructive"
                            onClick={async () => {
                              if (!confirm(`Deactivate ${gate.gateName}?`)) return;
                              try {
                                await deleteGate(gate.id);
                                toast.success("Gate deactivated");
                                broadcastGateSync();
                                await Promise.all([loadGates(), loadTemplates()]);
                              } catch (error: unknown) {
                                toast.error(getErrorMessage(error, "Failed to deactivate gate"));
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <FormDialog
            open={gateDialog}
            onOpenChange={setGateDialog}
            title={selectedGate ? "Edit Gate" : "Add Gate"}
            submitLabel={savingGate ? "Saving..." : selectedGate ? "Update" : "Create"}
            onSubmit={() => void saveGate()}
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Gate Number" value={gateForm.gateName} onChange={(value) => setGateForm((current) => ({ ...current, gateName: value }))} required />
                <InputField label="Location" value={gateForm.location} onChange={(value) => setGateForm((current) => ({ ...current, location: value }))} />
                {canSelectPlant ? (
                  <SelectField
                    label="Plant"
                    value={gateForm.plantId}
                    onChange={(value) => setGateForm((current) => ({ ...current, plantId: value }))}
                    options={plantsOptions}
                    required
                  />
                ) : (
                  <InputField label="Plant" value={plantName(defaultPlantId)} onChange={() => {}} disabled />
                )}
                <div className="space-y-3 rounded-2xl border border-border/70 p-4 sm:col-span-2">
                  <p className="text-sm font-medium">Gate Types</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {gateTypeOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                        <Checkbox
                          checked={gateForm.gateTypes.includes(option.value)}
                          onCheckedChange={(checked) =>
                            setGateForm((current) => ({
                              ...current,
                              gateTypes: checked
                                ? Array.from(new Set([...current.gateTypes, option.value]))
                                : current.gateTypes.filter((value) => value !== option.value),
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </FormDialog>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Template Configuration ({filteredTemplates.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" value={searchTemplate} onChange={(event) => setSearchTemplate(event.target.value)} placeholder="Search configurations..." />
                  </div>
                  <Button onClick={openCreateTemplateDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Configuration
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {templatesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No template configurations found.</div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredTemplates.map((template) => {
                    const gate = template.gate || gateById.get(template.gateId);
                    const resolvedPlantId = template.plantId ?? gate?.plantId;
                    return (
                      <Card key={template.id} className="border border-border/70 shadow-none">
                        <CardContent className="space-y-3 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{formatVisitorType(template.visitorType)}</p>
                              <p className="text-xs text-muted-foreground">{gate?.gateName || "Unknown gate"}</p>
                            </div>
                            <StatusBadge variant={template.isActive ? "active" : "default"} showDot>{template.isActive ? "Active" : "Inactive"}</StatusBadge>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">Allowed Entry Type</Badge>
                            <Badge variant="outline">{plantName(resolvedPlantId)}</Badge>
                            {gate?.location ? <Badge variant="outline">{gate.location}</Badge> : null}
                          </div>

                          <p className="text-sm text-muted-foreground">{template.templateName}</p>

                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => openEditTemplateDialog(template)}>Edit</Button>
                            <Button
                              variant="outline"
                              className="text-destructive"
                              onClick={async () => {
                                if (!confirm(`Deactivate ${template.templateName}?`)) return;
                                try {
                                  await deleteGateTemplate(template.id);
                                  toast.success("Template configuration deactivated");
                                  broadcastGateSync();
                                  await loadTemplates();
                                } catch (error: unknown) {
                                  toast.error(getErrorMessage(error, "Failed to deactivate template configuration"));
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <FormDialog
            open={templateDialog}
            onOpenChange={setTemplateDialog}
            title={selectedTemplate ? "Edit Template Configuration" : "Add Template Configuration"}
            submitLabel={savingTemplate ? "Saving..." : selectedTemplate ? "Update" : "Create"}
            onSubmit={() => void saveTemplate()}
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Gate"
                  value={templateForm.gateId}
                  onChange={(value) => setTemplateForm((current) => ({ ...current, gateId: value }))}
                  options={gateOptions}
                  required
                />
                <div className="space-y-3 rounded-2xl border border-border/70 p-4 sm:col-span-2">
                  <p className="text-sm font-medium">Allowed Entry Types</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {visitorTypeOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                        <Checkbox
                          checked={templateForm.visitorTypes.includes(option.value)}
                          onCheckedChange={(checked) =>
                            setTemplateForm((current) => ({
                              ...current,
                              visitorTypes: checked
                                ? Array.from(new Set([...current.visitorTypes, option.value]))
                                : current.visitorTypes.filter((value) => value !== option.value),
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">Configurations To Be Saved</p>
                {templateNamePreview.length === 0 ? (
                  <p className="text-sm font-medium">Select gate and one or more entry types</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templateNamePreview.map((name) => (
                      <Badge key={name} variant="outline">{name}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FormDialog>
        </TabsContent>

        <TabsContent value="plant-layout" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-primary" /> Plant Layout GPS Mapping</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  {canSelectPlant ? (
                    <SelectField
                      label="Plant"
                      value={layoutPlantId}
                      onChange={(value) => setLayoutPlantId(value)}
                      options={plantsOptions}
                    />
                  ) : (
                    <InputField label="Plant" value={plantName(defaultPlantId)} onChange={() => {}} disabled />
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!layoutPlantId) {
                        toast.error("Select a plant first");
                        return;
                      }
                      void loadPlantLayout(layoutPlantId);
                    }}
                    disabled={layoutLoading || !layoutPlantId}
                  >
                    Reload
                  </Button>
                  <Button onClick={() => void saveLayout()} disabled={layoutSaving || layoutLoading || !layoutPlantId}>
                    {layoutSaving ? "Saving..." : "Save Layout"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {layoutLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
              ) : !layoutPlantId ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Select a plant to configure layout and GPS coordinates.</div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <InputField
                      label="Layout Name"
                      value={layoutName}
                      onChange={(value) => setLayoutName(value)}
                      required
                    />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Optional SVG Markup</p>
                      <Textarea
                        value={layoutSvgMarkup}
                        onChange={(event) => setLayoutSvgMarkup(event.target.value)}
                        placeholder="Paste SVG layout markup if available"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Add Layout Node</p>
                      <Button type="button" variant="outline" onClick={addLayoutNode}>Add Node</Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <InputField label="Label" value={newLayoutNode.label} onChange={(value) => setNewLayoutNode((current) => ({ ...current, label: value }))} required />
                      <InputField label="Node Type" value={newLayoutNode.nodeType} onChange={(value) => setNewLayoutNode((current) => ({ ...current, nodeType: value }))} />
                      <InputField label="Reference Id" value={newLayoutNode.refId} onChange={(value) => setNewLayoutNode((current) => ({ ...current, refId: value }))} />
                      <InputField label="X" value={newLayoutNode.x} onChange={(value) => setNewLayoutNode((current) => ({ ...current, x: value }))} type="number" />
                      <InputField label="Y" value={newLayoutNode.y} onChange={(value) => setNewLayoutNode((current) => ({ ...current, y: value }))} type="number" />
                      <InputField label="Latitude" value={newLayoutNode.latitude} onChange={(value) => setNewLayoutNode((current) => ({ ...current, latitude: value }))} type="number" />
                      <InputField label="Longitude" value={newLayoutNode.longitude} onChange={(value) => setNewLayoutNode((current) => ({ ...current, longitude: value }))} type="number" />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 p-4">
                    <p className="mb-3 text-sm font-medium">Layout Nodes ({layoutNodes.length})</p>
                    {layoutNodes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No nodes added yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {layoutNodes.map((node) => (
                          <div key={node.id} className="rounded-xl border border-border/60 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">Node Id: {node.id}</p>
                              <Button type="button" variant="outline" className="text-destructive" onClick={() => removeLayoutNode(node.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <InputField label="Label" value={node.label} onChange={(value) => updateLayoutNode(node.id, "label", value)} required />
                              <InputField label="Node Type" value={node.nodeType} onChange={(value) => updateLayoutNode(node.id, "nodeType", value)} />
                              <InputField label="Reference Id" value={node.refId || ""} onChange={(value) => updateLayoutNode(node.id, "refId", value)} />
                              <InputField label="X" value={node.x ?? ""} onChange={(value) => updateLayoutNode(node.id, "x", value)} type="number" />
                              <InputField label="Y" value={node.y ?? ""} onChange={(value) => updateLayoutNode(node.id, "y", value)} type="number" />
                              <InputField label="Latitude" value={node.latitude ?? ""} onChange={(value) => updateLayoutNode(node.id, "latitude", value)} type="number" />
                              <InputField label="Longitude" value={node.longitude ?? ""} onChange={(value) => updateLayoutNode(node.id, "longitude", value)} type="number" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Add Path Edge</p>
                      <Button type="button" variant="outline" onClick={addLayoutEdge}>Add Edge</Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SelectField
                        label="From Node"
                        value={newEdge.fromNodeId}
                        onChange={(value) => setNewEdge((current) => ({ ...current, fromNodeId: value }))}
                        options={layoutNodes.map((node) => ({ value: node.id, label: `${node.label} (${node.nodeType})` }))}
                      />
                      <SelectField
                        label="To Node"
                        value={newEdge.toNodeId}
                        onChange={(value) => setNewEdge((current) => ({ ...current, toNodeId: value }))}
                        options={layoutNodes.map((node) => ({ value: node.id, label: `${node.label} (${node.nodeType})` }))}
                      />
                      <InputField
                        label="Distance"
                        value={newEdge.distance}
                        onChange={(value) => setNewEdge((current) => ({ ...current, distance: value }))}
                        type="number"
                      />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Directional</p>
                        <label className="flex h-10 items-center gap-2 rounded-md border border-border/70 px-3 text-sm">
                          <Checkbox
                            checked={newEdge.directional}
                            onCheckedChange={(checked) => setNewEdge((current) => ({ ...current, directional: Boolean(checked) }))}
                          />
                          <span>One way path</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 p-4">
                    <p className="mb-3 text-sm font-medium">Path Edges ({layoutEdges.length})</p>
                    {layoutEdges.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No edges configured yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {layoutEdges.map((edge, index) => (
                          <div key={`${edge.fromNodeId}-${edge.toNodeId}-${index}`} className="rounded-xl border border-border/60 p-3">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                              <SelectField
                                label="From"
                                value={edge.fromNodeId}
                                onChange={(value) => updateLayoutEdge(index, "fromNodeId", value)}
                                options={layoutNodes.map((node) => ({ value: node.id, label: node.label }))}
                              />
                              <SelectField
                                label="To"
                                value={edge.toNodeId}
                                onChange={(value) => updateLayoutEdge(index, "toNodeId", value)}
                                options={layoutNodes.map((node) => ({ value: node.id, label: node.label }))}
                              />
                              <InputField
                                label="Distance"
                                value={edge.distance ?? 1}
                                onChange={(value) => updateLayoutEdge(index, "distance", value)}
                                type="number"
                              />
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Directional</p>
                                <label className="flex h-10 items-center gap-2 rounded-md border border-border/70 px-3 text-sm">
                                  <Checkbox
                                    checked={Boolean(edge.directional)}
                                    onCheckedChange={(checked) => updateLayoutEdge(index, "directional", Boolean(checked))}
                                  />
                                  <span>One way</span>
                                </label>
                              </div>
                              <div className="flex items-end">
                                <Button type="button" variant="outline" className="text-destructive" onClick={() => removeLayoutEdge(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
