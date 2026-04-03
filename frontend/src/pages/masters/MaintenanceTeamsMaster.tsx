import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, SelectField, SwitchField } from "@/components/shared/FormField";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { DetailRow, DetailSection, ViewDialog } from "@/components/shared/ViewDialog";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";
import BackButton from "@/components/masters/BackButton";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Toolbar } from "@/components/layout/Toolbar";
import { StatusBadge } from "@/components/ui/status-badge";
import { createMaintenanceTeam, deleteMaintenanceTeam, listMaintenanceTeams, type MaintenanceTeam, updateMaintenanceTeam } from "@/api/maintenanceTeams";
import { listPlants, type Plant } from "@/api/plants";
import { listUsers, type UserProfile } from "@/api/users";
import { isAdmin, isSuperAdmin, useAuthStore } from "@/store/auth.store";
import { ChevronDown, Edit, Eye, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface TeamFormState {
  plantId: string;
  teamName: string;
  discipline: string;
  teamLeaderId: string;
  teamMemberIds: string[];
  isActive: boolean;
}

const emptyForm: TeamFormState = {
  plantId: "",
  teamName: "",
  discipline: "",
  teamLeaderId: "",
  teamMemberIds: [],
  isActive: true,
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function UsersMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const selectedLabels = options.filter((option) => value.includes(option.value)).map((option) => option.label);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Team Members</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 w-full justify-between font-normal">
            <span className="truncate text-left">
              {selectedLabels.length > 0 ? `${selectedLabels.length} members selected` : "Select team members"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] space-y-2 p-2">
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])
                    }
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selectedLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedLabels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function MaintenanceTeamsMaster() {
  const { user } = useAuthStore();
  const canManage = isAdmin(user);
  const canSelectPlant = isSuperAdmin(user);
  const defaultPlantId = user?.plantId || "";

  const [plants, setPlants] = useState<Plant[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<MaintenanceTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlantId, setSelectedPlantId] = useState(defaultPlantId);
  const [selectedTeam, setSelectedTeam] = useState<MaintenanceTeam | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<TeamFormState>({ ...emptyForm, plantId: defaultPlantId });

  const resolvedPlantId = canSelectPlant ? selectedPlantId : defaultPlantId;
  const formPlantId = canSelectPlant ? formData.plantId : defaultPlantId;

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

  useEffect(() => {
    if (!resolvedPlantId) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    void (async () => {
      try {
        const response = await listUsers({ page: 1, limit: 500, plantId: resolvedPlantId });
        setUsers((response.data || []).filter((item) => item.isActive));
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load users"));
      } finally {
        setUsersLoading(false);
      }
    })();
  }, [resolvedPlantId]);

  useEffect(() => {
    if (canSelectPlant && !resolvedPlantId) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const response = await listMaintenanceTeams({
          page: 1,
          limit: 200,
          plantId: resolvedPlantId || undefined,
          search: searchQuery || undefined,
          includeInactive: true,
        });
        setTeams(response.data || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to load maintenance teams"));
      } finally {
        setLoading(false);
      }
    })();
  }, [canSelectPlant, resolvedPlantId, searchQuery]);

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

  const userOptions = useMemo(
    () =>
      users
        .slice()
        .sort((left, right) => left.fullName.localeCompare(right.fullName))
        .map((member) => ({
          value: member.userId,
          label: `${member.fullName} (${member.userCode})`,
        })),
    [users],
  );

  const userNameById = useMemo(
    () =>
      Object.fromEntries(users.map((member) => [member.userId, member.fullName])) as Record<string, string>,
    [users],
  );

  const canSubmit = Boolean(
    (canSelectPlant ? formData.plantId : defaultPlantId) &&
      formData.teamName.trim() &&
      formData.discipline.trim() &&
      formData.teamLeaderId,
  );

  const refreshTeams = async (plantId: string) => {
    const response = await listMaintenanceTeams({
      page: 1,
      limit: 200,
      plantId,
      search: searchQuery || undefined,
      includeInactive: true,
    });
    setTeams(response.data || []);
  };

  const handleAdd = () => {
    setIsEditing(false);
    setSelectedTeam(null);
    setFormData({ ...emptyForm, plantId: resolvedPlantId || "" });
    setIsFormOpen(true);
  };

  const handleEdit = (team: MaintenanceTeam) => {
    setIsEditing(true);
    setSelectedTeam(team);
    setFormData({
      plantId: team.plantId || resolvedPlantId || "",
      teamName: team.teamName,
      discipline: team.discipline,
      teamLeaderId: team.teamLeaderId || "",
      teamMemberIds: team.teamMemberIds || [],
      isActive: team.isActive,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    const plantId = canSelectPlant ? formData.plantId : defaultPlantId;
    if (!plantId || !formData.teamName.trim() || !formData.discipline.trim() || !formData.teamLeaderId) {
      toast.error("Plant, team name, discipline, and team leader are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        plantId,
        teamName: formData.teamName.trim(),
        discipline: formData.discipline.trim(),
        teamLeaderId: formData.teamLeaderId,
        teamMemberIds: formData.teamMemberIds,
        isActive: formData.isActive,
      };

      if (isEditing && selectedTeam) {
        await updateMaintenanceTeam(selectedTeam.id, payload);
        toast.success("Maintenance team updated");
      } else {
        await createMaintenanceTeam(payload);
        toast.success("Maintenance team created");
      }

      await refreshTeams(plantId);
      setIsFormOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save maintenance team"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedTeam) return;
    setSaving(true);
    try {
      await deleteMaintenanceTeam(selectedTeam.id);
      toast.success("Maintenance team deleted");
      setTeams((current) => current.filter((team) => team.id !== selectedTeam.id));
      setIsDeleteOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete maintenance team"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "teamName", header: "Team Name", render: (item: MaintenanceTeam) => <span className="font-semibold text-primary">{item.teamName}</span> },
    { key: "discipline", header: "Discipline", render: (item: MaintenanceTeam) => item.discipline },
    { key: "leader", header: "Team Leader", render: (item: MaintenanceTeam) => userNameById[item.teamLeaderId || ""] || "-", hideOnMobile: true },
    { key: "members", header: "Members", render: (item: MaintenanceTeam) => `${item.teamMemberIds.length} selected`, hideOnMobile: true },
    { key: "status", header: "Status", render: (item: MaintenanceTeam) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: MaintenanceTeam) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTeam(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canManage ? (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedTeam(item); setIsDeleteOpen(true); }}>
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
        title="Maintenance Teams Master"
        subtitle="Create maintenance teams and define leaders and members."
        actions={
          canManage ? (
            <Button onClick={handleAdd} className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Team
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
            Keep teams simple: one leader, multiple members, one plant scope.
          </div>
        </CardContent>
      </Card>

      <DataTableShell
        title={<span className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Maintenance Teams ({teams.length})</span>}
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search teams..." className="h-10 pl-9" />
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : !resolvedPlantId && canSelectPlant ? (
          <EmptyState title="Select a plant" description="Choose a plant first to manage its maintenance teams." />
        ) : teams.length === 0 ? (
          <EmptyState title="No maintenance teams found" description="Create the first team to start routing work orders by category." actionLabel={canManage ? "Add Team" : undefined} onAction={canManage ? handleAdd : undefined} />
        ) : (
          <ResponsiveTable
            data={teams}
            columns={columns}
            keyExtractor={(item: MaintenanceTeam) => item.id}
            mobileCard={(item: MaintenanceTeam) => (
              <MobileCard onView={() => { setSelectedTeam(item); setIsViewOpen(true); }} onEdit={canManage ? () => handleEdit(item) : undefined} onDelete={canManage ? () => { setSelectedTeam(item); setIsDeleteOpen(true); } : undefined}>
                <MobileCardHeader title={item.teamName} subtitle={item.discipline} badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>} />
                <MobileCardRow label="Team Leader" value={userNameById[item.teamLeaderId || ""] || "-"} />
                <MobileCardRow label="Members" value={`${item.teamMemberIds.length}`} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog open={isFormOpen} onOpenChange={setIsFormOpen} title={isEditing ? "Edit Maintenance Team" : "Add Maintenance Team"} description="Keep the team details short and clear." onSubmit={handleSubmit} submitLabel={isEditing ? "Update Team" : "Create Team"} submitDisabled={!canSubmit || saving || usersLoading}>
        <FormGrid>
          {canSelectPlant ? (
            <SelectField label="Plant" value={formData.plantId} onChange={(value) => { setSelectedPlantId(value); setFormData((current) => ({ ...current, plantId: value, teamLeaderId: "", teamMemberIds: [] })); }} options={plantOptions} placeholder="Select plant" required />
          ) : null}
          <InputField label="Team Name" value={formData.teamName} onChange={(value) => setFormData((current) => ({ ...current, teamName: value }))} placeholder="Mechanical Core Team" required />
          <InputField label="Discipline" value={formData.discipline} onChange={(value) => setFormData((current) => ({ ...current, discipline: value }))} placeholder="Mechanical" required />
          <SelectField label="Team Leader" value={formData.teamLeaderId} onChange={(value) => setFormData((current) => ({ ...current, teamLeaderId: value }))} options={userOptions} placeholder={usersLoading ? "Loading users..." : "Select leader"} required disabled={!formPlantId || usersLoading} />
        </FormGrid>
        <UsersMultiSelect value={formData.teamMemberIds} onChange={(value) => setFormData((current) => ({ ...current, teamMemberIds: value }))} options={userOptions} />
        <SwitchField label="Active Team" checked={formData.isActive} onChange={(checked) => setFormData((current) => ({ ...current, isActive: checked }))} description="Inactive teams stay in history but cannot be assigned in new mappings." />
      </FormDialog>

      <ViewDialog open={isViewOpen} onOpenChange={setIsViewOpen} title={selectedTeam?.teamName || ""} subtitle={selectedTeam?.discipline || ""}>
        {selectedTeam ? (
          <div className="space-y-4">
            <DetailSection title="Team Summary">
              <DetailRow label="Team Leader" value={userNameById[selectedTeam.teamLeaderId || ""] || "-"} />
              <DetailRow label="Members" value={`${selectedTeam.teamMemberIds.length}`} />
              <DetailRow label="Status" value={selectedTeam.isActive ? "Active" : "Inactive"} />
            </DetailSection>
            <DetailSection title="Member List">
              <div className="flex flex-wrap gap-2">
                {selectedTeam.teamMemberIds.length > 0 ? selectedTeam.teamMemberIds.map((memberId) => (
                  <Badge key={memberId} variant="secondary">{userNameById[memberId] || memberId}</Badge>
                )) : <span className="text-sm text-muted-foreground">No members selected</span>}
              </div>
            </DetailSection>
          </div>
        ) : null}
      </ViewDialog>

      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} title="Delete Maintenance Team" itemName={selectedTeam?.teamName} onConfirm={confirmDelete} isLoading={saving} />
    </PageShell>
  );
}
