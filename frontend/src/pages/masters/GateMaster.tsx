import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { DoorOpen, Loader2, Plus, Search, Shield, Trash2 } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { broadcastGateSync, subscribeGateSync } from "@/lib/gate-sync";
import { useAuthStore, isSuperAdmin } from "@/store/auth.store";
import { listProfiles } from "@/api/users";
import {
  createGate,
  deleteGate,
  getGateSyncStatus,
  listGates,
  updateGate,
  type Gate,
} from "@/api/gates";

const gateTypeOptions = [
  { value: "MAIN_GATE", label: "Main Gate" },
  { value: "VISITOR_GATE", label: "Visitor Gate" },
  { value: "MATERIAL_GATE", label: "Material Gate" },
  { value: "DISPATCH_GATE", label: "Dispatch Gate" },
  { value: "STAFF_GATE", label: "Staff Gate" },
  { value: "EMPLOYEE_GATE", label: "Employee Gate" },
];

export default function GateMaster() {
  const { user } = useAuthStore();
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";
  const { plantsOptions, fetchPlants } = useMastersOptions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);
  const [securityUsers, setSecurityUsers] = useState<Array<{ id: string; fullName: string; roles?: string[] }>>([]);
  const [searchGate, setSearchGate] = useState("");
  const [gateDialog, setGateDialog] = useState(false);
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);
  const [gateForm, setGateForm] = useState({ gateName: "", gateType: "MAIN_GATE", plantId: defaultPlantId, location: "", securityUserIds: [] as string[] });
  const syncVersionRef = useRef<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [gateResponse, usersResponse] = await Promise.all([
        listGates({ page: 1, limit: 100, search: searchGate || undefined, plantId: canSelectPlant ? undefined : defaultPlantId || undefined }),
        listProfiles({ page: 1, limit: 250, plantId: canSelectPlant ? undefined : defaultPlantId || undefined }),
      ]);
      setGates(gateResponse.data);
      setSecurityUsers(usersResponse.data.filter((profile) => (profile.roles || []).some((role) => role.toUpperCase().includes("SECURITY"))).map((profile) => ({ id: profile.id, fullName: profile.fullName, roles: profile.roles })));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load gate configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlants();
    void loadData();
  }, [searchGate, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    const unsubscribe = subscribeGateSync(() => {
      void loadData();
    });
    return unsubscribe;
  }, [searchGate, defaultPlantId, canSelectPlant]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getGateSyncStatus({ plantId: canSelectPlant ? undefined : defaultPlantId || undefined });
          const nextVersion = `${response.data.configVersion || ""}:${response.data.activityVersion || ""}`;
          if (syncVersionRef.current && syncVersionRef.current !== nextVersion) {
            await loadData();
          }
          syncVersionRef.current = nextVersion;
        } catch {
          // Ignore background sync failures; manual load path already shows errors.
        }
      })();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [canSelectPlant, defaultPlantId, searchGate]);

  const plantName = (plantId: string | null | undefined) => plantsOptions.find((item) => item.value === plantId)?.label || "-";
  const securityUserName = (userId: string) => securityUsers.find((item) => item.id === userId)?.fullName || userId;

  const saveGate = async () => {
    if (!gateForm.gateName.trim()) return toast.error("Gate name is required");
    setSaving(true);
    try {
      const payload = {
        gateName: gateForm.gateName.trim(),
        gateType: gateForm.gateType,
        plantId: canSelectPlant ? gateForm.plantId || null : defaultPlantId || null,
        location: gateForm.location || null,
        securityUserIds: gateForm.securityUserIds,
      };
      if (selectedGate) {
        await updateGate(selectedGate.id, payload);
      } else {
        const optimisticGate: Gate = {
          id: `temp-${Date.now()}`,
          gateCode: "PENDING",
          gateName: payload.gateName,
          gateType: payload.gateType,
          plantId: payload.plantId ?? null,
          location: payload.location ?? null,
          securityUserIds: payload.securityUserIds,
          securityAssignmentsCount: payload.securityUserIds.length,
          isActive: true,
          templateCount: 0,
          activeVisitors: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          plant: null,
        };
        setGates((current) => [...current, optimisticGate]);
        await createGate(payload);
      }
      toast.success(selectedGate ? "Gate updated" : "Gate created");
      broadcastGateSync();
      setGateDialog(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save gate");
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Gate Master</h1>
        <p className="text-sm text-muted-foreground">Create gates, assign security users, and manage active entry points per plant.</p>
      </motion.div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" /> Gates ({gates.length})</CardTitle>
            <div className="flex gap-2">
              <div className="relative min-w-[220px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={searchGate} onChange={(event) => setSearchGate(event.target.value)} placeholder="Search gates..." /></div>
              <Button onClick={() => { setSelectedGate(null); setGateForm({ gateName: "", gateType: "MAIN_GATE", plantId: canSelectPlant ? "" : defaultPlantId, location: "", securityUserIds: [] }); setGateDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Add Gate</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {gates.map((gate) => (
                <Card key={gate.id} className="border border-border/70 shadow-none">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold">{gate.gateName}</p><p className="text-xs font-mono text-muted-foreground">{gate.gateCode}</p></div>
                      <StatusBadge variant={gate.isActive ? "active" : "default"} showDot>{gate.isActive ? "Active" : "Inactive"}</StatusBadge>
                    </div>
                    <p className="text-sm text-muted-foreground">{gate.gateType.replace(/_/g, " ")} · {plantName(gate.plantId)}</p>
                    <div className="flex flex-wrap gap-2"><Badge variant="secondary">{gate.templateCount || 0} entry types</Badge><Badge variant="outline">{gate.activeVisitors || 0} active</Badge><Badge variant="outline">{gate.securityAssignmentsCount || gate.securityUserIds?.length || 0} security users</Badge></div>
                    {(gate.securityUserIds || []).length > 0 ? <div className="flex flex-wrap gap-2">{(gate.securityUserIds || []).slice(0, 3).map((userId) => <Badge key={userId} variant="outline">{securityUserName(userId)}</Badge>)}</div> : null}
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setSelectedGate(gate); setGateForm({ gateName: gate.gateName, gateType: gate.gateType, plantId: gate.plantId || (canSelectPlant ? "" : defaultPlantId), location: gate.location || "", securityUserIds: gate.securityUserIds || [] }); setGateDialog(true); }}>Edit</Button>
                      <Button variant="outline" className="text-destructive" onClick={async () => { if (!confirm(`Deactivate ${gate.gateName}?`)) return; await deleteGate(gate.id); toast.success("Gate deactivated"); broadcastGateSync(); await loadData(); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog open={gateDialog} onOpenChange={setGateDialog} title={selectedGate ? "Edit Gate" : "Add Gate"} submitLabel={saving ? "Saving..." : selectedGate ? "Update" : "Create"} onSubmit={() => void saveGate()}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Gate Name" value={gateForm.gateName} onChange={(value) => setGateForm((current) => ({ ...current, gateName: value }))} required />
            <SelectField label="Gate Type" value={gateForm.gateType} onChange={(value) => setGateForm((current) => ({ ...current, gateType: value }))} options={gateTypeOptions} />
            {canSelectPlant ? <SelectField label="Plant" value={gateForm.plantId} onChange={(value) => setGateForm((current) => ({ ...current, plantId: value }))} options={plantsOptions} /> : <InputField label="Plant" value={plantName(defaultPlantId)} onChange={() => {}} disabled />}
            <InputField label="Location" value={gateForm.location} onChange={(value) => setGateForm((current) => ({ ...current, location: value }))} />
          </div>
          <div className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-primary" /> Security Assigned Users</div>
            <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
              {securityUsers.map((profile) => (
                <label key={profile.id} className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                  <Checkbox checked={gateForm.securityUserIds.includes(profile.id)} onCheckedChange={(checked) => setGateForm((current) => ({ ...current, securityUserIds: checked ? [...current.securityUserIds, profile.id] : current.securityUserIds.filter((item) => item !== profile.id) }))} />
                  <span>{profile.fullName}</span>
                </label>
              ))}
              {securityUsers.length === 0 ? <p className="text-sm text-muted-foreground">No scoped security users found.</p> : null}
            </div>
          </div>
        </div>
      </FormDialog>

    </div>
  );
}
