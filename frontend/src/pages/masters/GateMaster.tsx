import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { DoorOpen, Loader2, Plus, Search, Settings2, Trash2 } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const [activeTab, setActiveTab] = useState<"gates" | "templates">("gates");

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

  const templateNamePreview = useMemo(() => {
    if (!templateForm.gateId) return [] as string[];
    return Array.from(new Set(templateForm.visitorTypes.filter(Boolean))).map((visitorType) =>
      resolveTemplateName(templateForm.gateId, visitorType),
    );
  }, [templateForm.gateId, templateForm.visitorTypes]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Gate Master</h1>
        <p className="text-sm text-muted-foreground">Create gates with location details and configure allowed entry types for each gate.</p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "gates" | "templates")} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="gates" className="gap-2"><DoorOpen className="h-4 w-4" /> Gates</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><Settings2 className="h-4 w-4" /> Template Configuration</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
