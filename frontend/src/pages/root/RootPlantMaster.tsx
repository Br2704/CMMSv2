import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { listUsers } from "@/api/users";
import { createPlant, deletePlant, listPlants, type Plant, updatePlant } from "@/api/plants";
import { listOrganizations, type Organization } from "@/api/organizations";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Search, Edit, Trash2, Building, Eye, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/masters/BackButton";
import HierarchyBreadcrumb from "@/components/masters/HierarchyBreadcrumb";
import { FormDialog } from "@/components/shared/FormDialog";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { useMastersOptions } from "@/hooks/useMastersOptions";
import { usePermissions } from "@/hooks/usePermissions";
import { useBrandingStore } from "@/store/branding.store";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Toolbar } from "@/components/layout/Toolbar";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { EmptyState } from "@/components/app-shell/EmptyState";

interface UserOption {
  value: string;
  label: string;
}

interface PlantFormState {
  plantCode: string;
  plantName: string;
  organizationId: string;
  location: string;
  isActive: boolean;
  plantAdminId: string;
}

const emptyForm: PlantFormState = {
  plantCode: "",
  plantName: "",
  organizationId: "",
  location: "",
  isActive: true,
  plantAdminId: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : fallback;
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

export default function RootPlantMaster() {
  const { user } = useAuthStore();
  const brandingOrganizationId = useBrandingStore((state) => state.organizationId);
  const brandingOrganizationName = useBrandingStore((state) => state.organizationName);
  const isRootUser = isRootAdmin(user);
  const isScopedSuperAdmin = isSuperAdmin(user) && !isRootUser;
  const { can } = usePermissions();
  const canEditPlant = isRootUser || isScopedSuperAdmin || can("PLANTS", "update");
  const canAddPlant = isRootUser || can("PLANTS", "create");
  const canDeletePlant = isRootUser || can("PLANTS", "delete");
  const { invalidateOptions } = useMastersOptions();

  const [plants, setPlants] = useState<Plant[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [formData, setFormData] = useState<PlantFormState>(emptyForm);
  const [organizationFilter, setOrganizationFilter] = useState("ALL");
  const [isEditing, setIsEditing] = useState(false);

  const fetchPlants = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await listPlants({ page: 1, limit: 100, search: searchQuery || undefined });
      setPlants(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load plants"));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [searchQuery]);

  const fetchUsers = async () => {
    try {
      const response = await listUsers({ page: 1, limit: 100 });
      const options = response.data
        .filter(
          (item) =>
            item.isActive &&
            (item.roles || []).some((role) => role.toUpperCase() === "ADMIN") &&
            !(item.roles || []).some((role) => {
              const normalized = role.toUpperCase();
              return normalized === "SUPERADMIN" || normalized === "SUPER_ADMIN" || normalized === "ROOT_ADMIN";
            }),
        )
        .map((item) => ({ value: item.userId, label: `${item.userCode} - ${item.fullName}` }));
      setUsers(options);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load users"));
    }
  };

  const fetchOrganizations = async () => {
    try {
      const response = await listOrganizations({ page: 1, limit: 200, includeInactive: false });
      setOrganizations(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load organizations"));
    }
  };

  useEffect(() => {
    fetchUsers();
    if (isRootUser) {
      fetchOrganizations();
    }
  }, [isRootUser, user?.id]);

  useEffect(() => {
    if (!isRootUser) {
      setOrganizationFilter("ALL");
      return;
    }
    if (organizationFilter === "ALL") return;
    const exists = organizations.some((organization) => organization.id === organizationFilter);
    if (!exists) {
      setOrganizationFilter("ALL");
    }
  }, [isRootUser, organizationFilter, organizations]);

  useEffect(() => {
    const refresh = () => {
      void fetchPlants(true);
    };

    void fetchPlants();

    const intervalId = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchPlants]);

  const organizationNameById = useMemo(() => {
    const map = new Map<string, string>();
    organizations.forEach((organization) => {
      map.set(organization.id, organization.name);
    });
    return map;
  }, [organizations]);

  const scopedPlants = useMemo(() => {
    if (isRootUser || isScopedSuperAdmin) {
      return plants;
    }
    if (user?.plantId) {
      return plants.filter((plant) => plant.id === user.plantId);
    }
    // If not root/superadmin and no plantId assigned, they should see nothing (high security)
    return [];
  }, [isRootUser, isScopedSuperAdmin, plants, user?.plantId]);

  const filtered = useMemo(() => {
    const source = organizationFilter === "ALL" ? scopedPlants : scopedPlants.filter((plant) => plant.organizationId === organizationFilter);
    return [...source].sort((a, b) => {
      const orgA = (organizationNameById.get(a.organizationId) || a.organizationId || "").toLowerCase();
      const orgB = (organizationNameById.get(b.organizationId) || b.organizationId || "").toLowerCase();
      if (orgA !== orgB) return orgA.localeCompare(orgB);
      return (a.plantCode || "").localeCompare(b.plantCode || "");
    });
  }, [scopedPlants, organizationFilter, organizationNameById]);

  const getAdminName = (adminId: string | null) => {
    if (!adminId) return "-";
    const selected = users.find((item) => item.value === adminId);
    return selected ? selected.label : "-";
  };
  const getOrganizationName = (organizationId: string | null | undefined) => {
    if (!organizationId) return "-";
    const mappedName = organizationNameById.get(organizationId);
    if (mappedName) return mappedName;
    if (brandingOrganizationName && (!brandingOrganizationId || brandingOrganizationId === organizationId)) {
      return brandingOrganizationName;
    }
    return "Unknown Organization";
  };
  const organizationOptions = useMemo(() => {
    if (isRootUser) {
      return organizations.map((organization) => ({
        value: organization.id,
        label: `${organization.code || "-"} - ${organization.name}`,
      }));
    }

    if (brandingOrganizationId && brandingOrganizationName) {
      return [
        {
          value: brandingOrganizationId,
          label: brandingOrganizationName,
        },
      ];
    }

    return [];
  }, [brandingOrganizationId, brandingOrganizationName, isRootUser, organizations]);
  const selectedOrganization = organizationFilter === "ALL"
    ? null
    : organizations.find((organization) => organization.id === organizationFilter) ?? null;

  const handleAdd = () => {
    setFormData(emptyForm);
    setSelectedPlant(null);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (plant: Plant) => {
    setFormData({
      plantCode: plant.plantCode,
      plantName: plant.plantName,
      organizationId: plant.organizationId,
      location: plant.location || "",
      isActive: plant.isActive,
      plantAdminId: plant.plantAdminId || "",
    });
    setSelectedPlant(plant);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!canEditPlant && (isEditing || !canAddPlant)) {
      toast.error("You do not have permission to perform this action");
      return;
    }

    if (!formData.plantCode.trim() || !formData.plantName.trim() || !formData.organizationId) {
      toast.error("Plant code, name and organization are required");
      return;
    }

    setSaving(true);
    try {
      const payload: {
        plantCode: string;
        plantName: string;
        isActive: boolean;
        location?: string;
        plantAdminId?: string;
      } = {
        plantCode: formData.plantCode.trim(),
        plantName: formData.plantName.trim(),
        isActive: formData.isActive,
      };

      const trimmedLocation = formData.location.trim();
      if (trimmedLocation) {
        payload.location = trimmedLocation;
      }

      const trimmedPlantAdminId = formData.plantAdminId.trim();
      if (trimmedPlantAdminId) {
        payload.plantAdminId = trimmedPlantAdminId;
      }

      if (isEditing && selectedPlant) {
        await updatePlant(selectedPlant.id, isRootUser ? { ...payload, organizationId: formData.organizationId } : payload);
        toast.success("Plant updated");
      } else {
        await createPlant({ ...payload, organizationId: formData.organizationId });
        toast.success("Plant created");
      }

      invalidateOptions(["plants", "departments", "modules", "assets"]);
      setIsFormOpen(false);
      await fetchPlants();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save plant"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedPlant) return;
    setSaving(true);
    const deletedPlantId = selectedPlant.id;
    const previous = plants;
    setPlants((curr) => curr.filter((plant) => plant.id !== deletedPlantId));
    try {
      await deletePlant(deletedPlantId);
      toast.success("Plant deleted");
      invalidateOptions(["plants", "departments", "modules", "assets"]);
      setIsDeleteOpen(false);
      await fetchPlants();
    } catch (error: unknown) {
      setPlants(previous);
      if (getErrorStatus(error) === 409) {
        toast.error(getErrorMessage(error, "Plant cannot be deleted because departments/modules/assets exist."));
        return;
      }
      toast.error(getErrorMessage(error, "Failed to delete plant"));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "code", header: "Code", render: (item: Plant) => <span className="font-semibold text-primary">{item.plantCode}</span> },
    { key: "name", header: "Name", render: (item: Plant) => <span className="font-medium">{item.plantName}</span> },
    { key: "organization", header: "Organization", render: (item: Plant) => getOrganizationName(item.organizationId), hideOnMobile: true },
    { key: "location", header: "Location", render: (item: Plant) => item.location || "-", hideOnMobile: true },
    { key: "admin", header: "Plant Admin", render: (item: Plant) => <span className="text-sm">{getAdminName(item.plantAdminId)}</span>, hideOnMobile: true },
    { key: "status", header: "Status", render: (item: Plant) => <StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge> },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: Plant) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedPlant(item); setIsViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {canEditPlant && (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canDeletePlant && (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setSelectedPlant(item); setIsDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <BackButton to={isRootUser ? "/root/dashboard" : "/masters"} label={isRootUser ? "Back to Governance Dashboard" : "Back to Masters"} />
      <PageHeader
        title="Plant Master"
        subtitle={
          isRootUser
            ? "Root admin can securely create, edit, delete, and review organization-wise plant details."
            : isScopedSuperAdmin
              ? "Super admin can view and edit plant details within the assigned organization scope."
              : "View your scoped plant data"
        }
        actions={
          canAddPlant ? (
            <Button onClick={handleAdd} className="gap-2 gradient-primary text-primary-foreground shadow-glow w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Plant
            </Button>
          ) : undefined
        }
      />

      {isRootUser && (
        <Card className="shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Organizations</p>
              <p className="text-xs text-muted-foreground">
                Click an organization card to view its plant details.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => setOrganizationFilter("ALL")}
                className={`rounded-lg border p-3 text-left transition ${
                  organizationFilter === "ALL" ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="h-14 w-14 rounded-md border border-border/70 bg-white p-2 flex items-center justify-center">
                  <Building className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-2 font-medium text-sm">All Organizations</p>
                <p className="text-xs text-muted-foreground">Show all plants</p>
              </button>
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  onClick={() => setOrganizationFilter(organization.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    organizationFilter === organization.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="h-14 w-14 rounded-md border border-border/70 bg-white p-2 flex items-center justify-center overflow-hidden">
                    {organization.logoUrl ? (
                      <img src={organization.logoUrl} alt={`${organization.name} logo`} className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-2 truncate font-medium text-sm">{organization.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{organization.code || "-"}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isRootUser && (
        <Card className="shadow-card">
          <CardContent className="py-4">
            <HierarchyBreadcrumb currentLevel="plant" />
          </CardContent>
        </Card>
      )}

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            {isRootUser ? `${selectedOrganization?.name || "Organization-wise"} Plants` : "Plants"} ({filtered.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search plants..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" />
                </div>
              </div>
            }
          />
        }
      >
        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No plants found"
            description={
              isRootUser && organizationFilter !== "ALL"
                ? "No plants are mapped to the selected organization."
                : "Add a plant to start mapping your hierarchy."
            }
            actionLabel={canAddPlant ? "Add Plant" : undefined}
            onAction={canAddPlant ? handleAdd : undefined}
          />
        ) : (
          <ResponsiveTable
            data={filtered}
            columns={columns}
            keyExtractor={(item: Plant) => item.id}
            mobileCard={(item: Plant) => (
              <MobileCard
                onView={() => { setSelectedPlant(item); setIsViewOpen(true); }}
                onEdit={canEditPlant ? () => handleEdit(item) : undefined}
                onDelete={canDeletePlant ? () => { setSelectedPlant(item); setIsDeleteOpen(true); } : undefined}
              >
                <MobileCardHeader
                  title={item.plantCode}
                  subtitle={item.plantName}
                  badge={<StatusBadge variant={item.isActive ? "active" : "inactive"}>{item.isActive ? "Active" : "Inactive"}</StatusBadge>}
                />
                <MobileCardRow label="Location" value={item.location || "-"} />
                <MobileCardRow label="Organization" value={getOrganizationName(item.organizationId)} />
                <MobileCardRow label="Admin" value={getAdminName(item.plantAdminId)} />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={isEditing ? "Edit Plant" : "Add New Plant"}
        description={isEditing ? "Update plant information" : "Add a new plant location"}
        onSubmit={handleSubmit}
        submitLabel={saving ? "Saving..." : isEditing ? "Update" : "Add Plant"}
        size="lg"
      >
        <FormGrid>
          <InputField label="Plant Code" value={formData.plantCode} onChange={(value) => setFormData({ ...formData, plantCode: value })} placeholder="PLT-001" required />
          <InputField label="Plant Name" value={formData.plantName} onChange={(value) => setFormData({ ...formData, plantName: value })} placeholder="Plant Name - City" required />
          <SelectField
            label="Organization"
            value={formData.organizationId}
            onChange={(value) => setFormData({ ...formData, organizationId: value })}
            options={organizationOptions}
            placeholder="Select organization"
            required
            disabled={!isRootUser && isEditing}
            hint={!isRootUser && isEditing ? "Only ROOT_ADMIN can change organization assignment." : undefined}
          />
          <InputField label="Location" value={formData.location} onChange={(value) => setFormData({ ...formData, location: value })} placeholder="Chennai, TN" />
          <SelectField label="Plant Admin" value={formData.plantAdminId} onChange={(value) => setFormData({ ...formData, plantAdminId: value })} options={users} placeholder="Select plant admin" />
          <SelectField
            label="Status"
            value={formData.isActive ? "Active" : "Inactive"}
            onChange={(value) => setFormData({ ...formData, isActive: value === "Active" })}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
        </FormGrid>
      </FormDialog>

      <ViewDialog
        open={isViewOpen}
        onOpenChange={setIsViewOpen}
        title={selectedPlant?.plantName || ""}
        subtitle={selectedPlant?.plantCode}
      >
        {selectedPlant && (
          <div className="space-y-6">
            <DetailSection title="Basic Information">
              <DetailRow label="Plant Code" value={selectedPlant.plantCode} />
              <DetailRow label="Plant Name" value={selectedPlant.plantName} />
              <DetailRow label="Organization" value={getOrganizationName(selectedPlant.organizationId)} />
              <DetailRow label="Location" value={selectedPlant.location || "-"} />
              <DetailRow label="Plant Admin" value={getAdminName(selectedPlant.plantAdminId)} />
              <DetailRow label="Status" value={<StatusBadge variant={selectedPlant.isActive ? "active" : "inactive"}>{selectedPlant.isActive ? "Active" : "Inactive"}</StatusBadge>} />
              <DetailRow label="Created" value={new Date(selectedPlant.createdAt).toLocaleDateString()} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Plant"
        description="This permanently removes the plant from the database for Root Admin. If related records still depend on it, clear or reassign them first."
        itemName={selectedPlant?.plantName}
        onConfirm={confirmDelete}
        isLoading={saving}
      />
    </PageShell>
  );
}
