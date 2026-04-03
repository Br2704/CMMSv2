import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { SelectField } from "@/components/shared/FormField";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import BackButton from "@/components/masters/BackButton";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { listMaintenanceTeams, type MaintenanceTeam } from "@/api/maintenanceTeams";
import { listPlants, type Plant } from "@/api/plants";
import { createWorkOrderTeamMapping, deleteWorkOrderTeamMapping, listWorkOrderTeamMappings, type WorkOrderTeamMapping, updateWorkOrderTeamMapping } from "@/api/workOrderTeamMappings";
import { formatWorkOrderCategory, WORK_ORDER_CATEGORY_OPTIONS } from "@/config/work-order-categories";
import { isAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { Edit, Link2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface MappingFormState {
  plantId: string;
  category: string;
  teamId: string;
}

const emptyForm: MappingFormState = {
  plantId: "",
  category: "",
  teamId: "",
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

export default function WorkOrderTeamMappingMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [teams, setTeams] = useState<MaintenanceTeam[]>([]);
  const [mappings, setMappings] = useState<WorkOrderTeamMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedMapping, setSelectedMapping] = useState<WorkOrderTeamMapping | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<MappingFormState>({ ...emptyForm, plantId: defaultPlantId });

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;

  useEffect(() => {
    if (!canSelectPlant) return;
    void (async () => {
      try {
        const response = await listPlants({ page: 1, limit: 500, includeInactive: true });
        setPlants(response.data || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load plants"));
      }
    })();
  }, [canSelectPlant]);

  const refreshData = async (plantId: string) => {
    const [teamsResponse, mappingsResponse] = await Promise.all([
      listMaintenanceTeams({ page: 1, limit: 200, plantId, includeInactive: true }),
      listWorkOrderTeamMappings({ page: 1, limit: 100, plantId }),
    ]);
    setTeams(teamsResponse.data || []);
    setMappings(mappingsResponse.data || []);
  };

  useEffect(() => {
    if (canSelectPlant && !resolvedPlantId) {
      setTeams([]);
      setMappings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refreshData(resolvedPlantId || "")
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error, "Failed to load category team mappings"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canSelectPlant, resolvedPlantId]);

  const filteredMappings = useMemo(
    () =>
      mappings.filter((mapping) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const teamName = teams.find((team) => team.id === mapping.teamId)?.teamName.toLowerCase() || "";
        return mapping.category.toLowerCase().includes(query) || teamName.includes(query);
      }),
    [mappings, searchQuery, teams],
  );

  const plantOptions = useMemo(
    () =>
      plants
        .filter((plant) => plant.isActive ?? true)
        .map((plant) => ({
          value: plant.id,
          label: `${plant.plantCode} - ${plant.plantName}`,
        })),
    [plants],
  );

  const activeTeamOptions = useMemo(
    () =>
      teams
        .filter((team) => team.isActive)
        .sort((left, right) => left.teamName.localeCompare(right.teamName))
        .map((team) => ({
          value: team.id,
          label: `${team.teamName} · ${team.discipline}`,
        })),
    [teams],
  );

  const teamNameById = useMemo(
    () =>
      Object.fromEntries(teams.map((team) => [team.id, team.teamName])) as Record<string, string>,
    [teams],
  );

  const canSubmit = Boolean((canSelectPlant ? formData.plantId : defaultPlantId) && formData.category && formData.teamId);

  const handleAdd = () => {
    setIsEditing(false);
    setSelectedMapping(null);
    setFormData({ ...emptyForm, plantId: resolvedPlantId || "" });
    setIsFormOpen(true);
  };

  const handleEdit = (mapping: WorkOrderTeamMapping) => {
    setIsEditing(true);
    setSelectedMapping(mapping);
    setFormData({
      plantId: mapping.plantId || resolvedPlantId || "",
      category: mapping.category,
      teamId: mapping.teamId,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    const plantId = canSelectPlant ? formData.plantId : defaultPlantId;
    if (!plantId || !formData.category || !formData.teamId) {
      toast.error("Plant, category, and assigned team are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        plantId,
        category: formData.category,
        teamId: formData.teamId,
      };

      if (isEditing && selectedMapping) {
        await updateWorkOrderTeamMapping(selectedMapping.id, payload);
        toast.success("Mapping updated");
      } else {
        await createWorkOrderTeamMapping(payload);
        toast.success("Mapping created");
      }

      await refreshData(plantId);
      setIsFormOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save mapping"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedMapping) return;
    setSaving(true);
    try {
      await deleteWorkOrderTeamMapping(selectedMapping.id);
      toast.success("Mapping deleted");
      setMappings((current) => current.filter((mapping) => mapping.id !== selectedMapping.id));
      setIsDeleteOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete mapping"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "category", header: "Work Order Category", render: (item: WorkOrderTeamMapping) => <span className="font-semibold text-primary">{formatWorkOrderCategory(item.category)}</span> },
    { key: "team", header: "Assigned Team", render: (item: WorkOrderTeamMapping) => teamNameById[item.teamId] || "-", hideOnMobile: true },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: WorkOrderTeamMapping) => (
        <div className="flex justify-end gap-1">
          {canManage ? (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedMapping(item); setIsDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="Work Order Category Team Mapping"
        subtitle="Map each work order category to the right maintenance team."
        actions={
          canManage ? (
            <Button onClick={handleAdd} className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Mapping
            </Button>
          ) : undefined
        }
      />

      <Card className="shadow-card">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between">
          {canSelectPlant ? (
            <div className="w-full sm:max-w-sm">
              <SelectField label="Plant" value={selectedPlantId} onChange={setSelectedPlantId} options={plantOptions} placeholder="Select plant" />
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Plant</p>
              <p className="text-sm text-muted-foreground">{user?.plantCode || "Plant"} - {user?.plantName || "Assigned Plant"}</p>
            </div>
          )}
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            One category, one assigned team. The work order leader assignment happens automatically.
          </div>
        </CardContent>
      </Card>

      <DataTableShell
        title={<span className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />Category Team Mappings ({filteredMappings.length})</span>}
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search mappings..." className="h-10 pl-9" />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : !resolvedPlantId && canSelectPlant ? (
          <EmptyState title="Select a plant" description="Choose a plant first to manage category mappings." />
        ) : filteredMappings.length === 0 ? (
          <EmptyState title="No mappings found" description="Create a category-to-team rule so new work orders are assigned automatically." actionLabel={canManage ? "Add Mapping" : undefined} onAction={canManage ? handleAdd : undefined} />
        ) : (
          <ResponsiveTable
            data={filteredMappings}
            columns={columns}
            keyExtractor={(item: WorkOrderTeamMapping) => item.id}
            mobileCard={(item: WorkOrderTeamMapping) => (
              <MobileCard onEdit={canManage ? () => handleEdit(item) : undefined} onDelete={canManage ? () => { setSelectedMapping(item); setIsDeleteOpen(true); } : undefined}>
                <MobileCardHeader title={formatWorkOrderCategory(item.category)} subtitle={teamNameById[item.teamId] || "-"} />
                <MobileCardRow label="Assigned Team" value={teamNameById[item.teamId] || "-"} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={isEditing ? "Edit Mapping" : "Add Mapping"} description="Choose a category and the team that should receive new work orders." onSubmit={handleSubmit} submitLabel={isEditing ? "Update Mapping" : "Create Mapping"} submitDisabled={!canSubmit || saving}>
        <FormGrid>
          {canSelectPlant ? (
            <SelectField label="Plant" value={formData.plantId} onChange={(value) => { setSelectedPlantId(value); setFormData((current) => ({ ...current, plantId: value, teamId: "" })); }} options={plantOptions} placeholder="Select plant" required />
          ) : null}
          <SelectField label="Work Order Category" value={formData.category} onChange={(value) => setFormData((current) => ({ ...current, category: value }))} options={WORK_ORDER_CATEGORY_OPTIONS} placeholder="Select category" required />
          <SelectField label="Assigned Team" value={formData.teamId} onChange={(value) => setFormData((current) => ({ ...current, teamId: value }))} options={activeTeamOptions} placeholder="Select team" required disabled={!resolvedPlantId} />
        </FormGrid>
      </FormDialog>

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Mapping" itemName={selectedMapping ? formatWorkOrderCategory(selectedMapping.category) : undefined} onConfirm={confirmDelete} isLoading={saving} />
    </PageShell>
  );
}
