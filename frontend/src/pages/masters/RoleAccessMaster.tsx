import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, Save, Search, Trash2, Users } from "lucide-react";
import BackButton from "@/components/masters/BackButton";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField, TextareaField } from "@/components/shared/FormField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { AppSwitch } from "@/components/ui/app-switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuthStore, isRootAdmin, isSuperAdmin } from "@/store/auth.store";
import { invalidatePermissionsCache, usePermissions } from "@/hooks/usePermissions";
import { createRole, deleteRole, listRoles, type Role } from "@/api/roles";
import { getRolePermissions, saveRolePermissions, type RolePermissionMap } from "@/api/rolePermissions";
import { getRoleKpis, saveRoleKpis, type RoleKpiItem } from "@/api/roleKpis";
import { listUsers, updateUserRoles, type UserProfile } from "@/api/users";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

type ModuleGroup = {
  title: string;
  modules: Array<{ key: string; label: string }>;
};

const ACTIONS = ["READ", "CREATE", "UPDATE", "DELETE", "EXPORT", "APPROVE"] as const;
const ADMIN_LOCKED_MODULES = new Set(["PLANTS", "ROLE_ACCESS"]);

const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: "Core Navigation",
    modules: [
      { key: "DASHBOARD", label: "Dashboard" },
      { key: "WORK_ORDERS", label: "Work Orders" },
      { key: "ASSETS", label: "Assets" },
      { key: "PM", label: "Preventive Maintenance" },
      { key: "CALIBRATION", label: "Calibration" },
      { key: "AMC", label: "AMC" },
      { key: "ESG", label: "ESG" },
      { key: "SAFETY", label: "Safety" },
      { key: "GATES", label: "Security Gate" },
      { key: "LOGS", label: "Data Logging" },
      { key: "INVENTORY", label: "Spare Maintenance" },
      { key: "REPORTS", label: "Reports" },
      { key: "LOGS", label: "Logs" },
    ],
  },
  {
    title: "Advanced Operations",
    modules: [
      { key: "BENCHMARKING", label: "Benchmarking" },
      { key: "ANALYTICS", label: "Performance Logs" },
      { key: "NOTIFICATIONS", label: "Alert Center" },
      { key: "BENCHMARKING", label: "AI Insights" },
      { key: "BENCHMARKING", label: "Global Operations Dashboard" },
      { key: "REPORTS", label: "System Diagnostics" },
      { key: "ANALYTICS", label: "Analytics Engine" },
      { key: "NOTIFICATIONS", label: "Notifications" },
    ],
  },
  {
    title: "Masters",
    modules: [
      { key: "MASTERS", label: "Masters Landing" },
      { key: "PLANTS", label: "Plant Master" },
      { key: "DEPARTMENTS", label: "Department Master / Cost Centers" },
      { key: "MODULES", label: "Module Master" },
      { key: "ASSETS", label: "Machine Master" },
      { key: "USERS", label: "User Master" },
      { key: "ROLE_ACCESS", label: "Role & Access Master" },
      { key: "VENDORS", label: "Vendors" },
      { key: "SHIFTS", label: "Shifts" },
      { key: "GATES", label: "Gates" },
      { key: "ESG", label: "ESG Config Master" },
      { key: "SAFETY", label: "Safety Config Master" },
      { key: "PM", label: "PM Config Master" },
      { key: "CALIBRATION", label: "Calibration Config Master" },
      { key: "AMC", label: "AMC Config Master" },
      { key: "REPORTS", label: "Email Reports Master" },
      { key: "LOGS", label: "Log Templates Master" },
    ],
  },
  {
    title: "Admin",
    modules: [
      { key: "ROLE_ACCESS", label: "Role Administration" },
      { key: "USERS", label: "User Role Assignment" },
    ],
  },
];

const ALL_MODULE_KEYS = Array.from(new Set(MODULE_GROUPS.flatMap((group) => group.modules.map((moduleItem) => moduleItem.key))));

const KPI_LABELS: Array<{ key: string; label: string }> = [
  { key: "TOTAL_ASSETS", label: "Total Assets" },
  { key: "TOTAL_WORK_ORDERS", label: "Total Work Orders" },
  { key: "OPEN_WORK_ORDERS", label: "Open Work Orders" },
  { key: "CLOSED_WORK_ORDERS", label: "Closed Work Orders" },
  { key: "ACTIVE_WORK_ORDERS", label: "Active Work Orders" },
  { key: "LAST24H_WORK_ORDERS", label: "Last 24h Work Orders" },
  { key: "MTTR", label: "MTTR" },
  { key: "MTBF", label: "MTBF" },
  { key: "OVERDUE_PM", label: "Overdue PM" },
  { key: "PENDING_APPROVAL", label: "Pending Approval" },
  { key: "OVERDUE_CALIBRATIONS", label: "Overdue Calibrations" },
  { key: "VISITORS_TODAY", label: "Visitors Today" },
];

function roleNameOf(role: Role | null) {
  return (role?.name || "").trim().toUpperCase();
}

function isSuperAdminRole(role: Role | null) {
  return roleNameOf(role) === "SUPERADMIN" || roleNameOf(role) === "SUPER_ADMIN";
}

function isAdminRole(role: Role | null) {
  return roleNameOf(role) === "ADMIN";
}

function isRootAdminRole(role: Role | null) {
  return roleNameOf(role) === "ROOT_ADMIN";
}

function sanitizePermissions(role: Role | null, input: RolePermissionMap): RolePermissionMap {
  const normalized: RolePermissionMap = {};
  for (const moduleKey of ALL_MODULE_KEYS) {
    const actions = (input[moduleKey] || []).map((item) => item.toUpperCase());
    normalized[moduleKey] = Array.from(new Set(actions.filter((action) => ACTIONS.includes(action as (typeof ACTIONS)[number]))));
  }

  if (isRootAdminRole(role)) {
    for (const moduleKey of ALL_MODULE_KEYS) {
      normalized[moduleKey] = [...ACTIONS];
    }
    return normalized;
  }

  if (isAdminRole(role)) {
    normalized.PLANTS = [];
    normalized.ROLE_ACCESS = [];
  }

  return normalized;
}

function buildDefaultKpis(role: Role | null): RoleKpiItem[] {
  return KPI_LABELS.map((kpi, index) => ({
    kpiKey: kpi.key,
    isVisible: true,
    displayOrder: index,
  }));
}

function normalizeKpis(role: Role | null, rows: RoleKpiItem[]): RoleKpiItem[] {
  const byKey = new Map(rows.map((item) => [item.kpiKey.toUpperCase(), item]));
  const normalized = KPI_LABELS.map((kpi, index) => {
    const existing = byKey.get(kpi.key);
    return {
      kpiKey: kpi.key,
      isVisible: isRootAdminRole(role) ? true : existing ? existing.isVisible : true,
      displayOrder: existing ? existing.displayOrder : index,
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder);

  return normalized.map((item, index) => ({ ...item, displayOrder: index }));
}

function mapRoleLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (text) => text.toUpperCase());
}

export default function RoleAccessMaster() {
  const { user } = useAuthStore();
  const { can, lastSyncedAt, rbacVersion } = usePermissions();
  const canManageRoles = (isRootAdmin(user) || isSuperAdmin(user)) && (can("ROLE_ACCESS", "create") || can("ROLE_ACCESS", "update") || can("ROLE_ACCESS", "delete"));

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const [activeTab, setActiveTab] = useState("permissions");
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [permissionDraft, setPermissionDraft] = useState<RolePermissionMap>({});
  const [permissionInitial, setPermissionInitial] = useState<RolePermissionMap>({});

  const [kpiDraft, setKpiDraft] = useState<RoleKpiItem[]>([]);
  const [kpiInitial, setKpiInitial] = useState<RoleKpiItem[]>([]);

  const [copyFromRoleId, setCopyFromRoleId] = useState("");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const selectedRole = useMemo(() => roles.find((item) => item.id === selectedRoleId) || null, [roles, selectedRoleId]);

  const filteredRoles = useMemo(
    () => roles.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase().trim())),
    [roles, searchQuery],
  );

  const roleUsers = useMemo(
    () => users.filter((item) => (item.roles || []).map((role) => role.toUpperCase()).includes(roleNameOf(selectedRole))),
    [users, selectedRole],
  );

  const availableUsersForAssign = useMemo(
    () => users.filter((item) => !roleUsers.some((entry) => entry.userId === item.userId)),
    [users, roleUsers],
  );

  const permissionDirty = useMemo(() => JSON.stringify(permissionDraft) !== JSON.stringify(permissionInitial), [permissionDraft, permissionInitial]);
  const kpiDirty = useMemo(() => JSON.stringify(kpiDraft) !== JSON.stringify(kpiInitial), [kpiDraft, kpiInitial]);

  const canDeleteSelectedRole = canManageRoles && !!selectedRole && !selectedRole.isSystem;
  const visibleModuleGroups = MODULE_GROUPS;

  const loadRoles = async () => {
    setRolesLoading(true);
    try {
      const response = await listRoles();
      const rows = response.data || [];
      setRoles(rows);

      const nextRoleId = selectedRoleId && rows.some((role) => role.id === selectedRoleId) ? selectedRoleId : rows[0]?.id || "";
      setSelectedRoleId(nextRoleId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load roles");
    } finally {
      setRolesLoading(false);
    }
  };

  const loadRolePermissions = async (roleId: string, roleRef: Role | null) => {
    setPermissionsLoading(true);
    try {
      const response = await getRolePermissions(roleId);
      const normalized = sanitizePermissions(roleRef, response.data || {});
      setPermissionDraft(normalized);
      setPermissionInitial(normalized);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load role permissions");
      const fallback = sanitizePermissions(roleRef, {});
      setPermissionDraft(fallback);
      setPermissionInitial(fallback);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadRoleKpis = async (roleId: string, roleRef: Role | null) => {
    setKpisLoading(true);
    try {
      const response = await getRoleKpis(roleId);
      const normalized = normalizeKpis(roleRef, response.data || buildDefaultKpis(roleRef));
      setKpiDraft(normalized);
      setKpiInitial(normalized);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load KPI visibility");
      const fallback = normalizeKpis(roleRef, buildDefaultKpis(roleRef));
      setKpiDraft(fallback);
      setKpiInitial(fallback);
    } finally {
      setKpisLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await listUsers({ page: 1, limit: 200 });
      setUsers(response.data || []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load users");
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    if (!selectedRoleId) {
      setPermissionDraft({});
      setPermissionInitial({});
      setKpiDraft([]);
      setKpiInitial([]);
      return;
    }

    const roleRef = roles.find((item) => item.id === selectedRoleId) || null;
    loadRolePermissions(selectedRoleId, roleRef);
    loadRoleKpis(selectedRoleId, roleRef);
    loadUsers();
  }, [selectedRoleId, roles]);

  const isPermissionLocked = (moduleKey: string) => {
    if (!selectedRole) return false;
    if (isRootAdminRole(selectedRole)) return true;
    if (isAdminRole(selectedRole) && ADMIN_LOCKED_MODULES.has(moduleKey)) return true;
    return false;
  };

  const isActionChecked = (moduleKey: string, action: string) => {
    return (permissionDraft[moduleKey] || []).includes(action);
  };

  const toggleAction = (moduleKey: string, action: string, checked: boolean) => {
    if (isPermissionLocked(moduleKey)) return;

    setPermissionDraft((prev) => {
      const next = new Set(prev[moduleKey] || []);
      if (checked) next.add(action);
      else next.delete(action);
      return { ...prev, [moduleKey]: Array.from(next) };
    });
  };

  const toggleModuleAll = (moduleKey: string, checked: boolean) => {
    if (isPermissionLocked(moduleKey)) return;
    setPermissionDraft((prev) => ({
      ...prev,
      [moduleKey]: checked ? [...ACTIONS] : [],
    }));
  };

  const globalChecked = useMemo(() => {
    const editableModules = ALL_MODULE_KEYS.filter((moduleKey) => !isPermissionLocked(moduleKey));
    if (editableModules.length === 0) return true;
    return editableModules.every((moduleKey) => ACTIONS.every((action) => isActionChecked(moduleKey, action)));
  }, [permissionDraft, selectedRole]);

  const toggleGlobalAll = (checked: boolean) => {
    setPermissionDraft((prev) => {
      const next: RolePermissionMap = { ...prev };
      for (const moduleKey of ALL_MODULE_KEYS) {
        if (isPermissionLocked(moduleKey)) continue;
        next[moduleKey] = checked ? [...ACTIONS] : [];
      }
      return sanitizePermissions(selectedRole, next);
    });
  };

  const handleCopyFromRole = async () => {
    if (!copyFromRoleId || !selectedRole) return;
    try {
      const response = await getRolePermissions(copyFromRoleId);
      const copied = sanitizePermissions(selectedRole, response.data || {});
      setPermissionDraft(copied);
      toast.success("Permissions copied");
    } catch (error: any) {
      toast.error(error?.message || "Failed to copy permissions");
    }
  };

  const handleSave = async () => {
    if (!selectedRoleId) return;

    setSaving(true);
    try {
      if (activeTab === "permissions") {
        const payload = sanitizePermissions(selectedRole, permissionDraft);
        const response = await saveRolePermissions(selectedRoleId, payload);
        const normalized = sanitizePermissions(selectedRole, response.data || payload);
        setPermissionDraft(normalized);
        setPermissionInitial(normalized);
        invalidatePermissionsCache();
        toast.success("Role permissions saved");
      }

      if (activeTab === "kpis") {
        const payload = kpiDraft.map((item, index) => ({ ...item, displayOrder: index }));
        const response = await saveRoleKpis(selectedRoleId, payload);
        const normalized = normalizeKpis(selectedRole, response.data || payload);
        setKpiDraft(normalized);
        setKpiInitial(normalized);
        invalidatePermissionsCache();
        toast.success("Role KPI visibility saved");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (activeTab === "permissions") {
      setPermissionDraft(permissionInitial);
    }
    if (activeTab === "kpis") {
      setKpiDraft(kpiInitial);
    }
  };

  const moveKpi = (index: number, direction: -1 | 1) => {
    if (isRootAdminRole(selectedRole)) return;
    const target = index + direction;
    if (target < 0 || target >= kpiDraft.length) return;

    const next = [...kpiDraft];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setKpiDraft(next.map((item, rowIndex) => ({ ...item, displayOrder: rowIndex })));
  };

  const toggleKpi = (kpiKey: string, visible: boolean) => {
    if (isRootAdminRole(selectedRole)) return;
    setKpiDraft((prev) =>
      prev.map((item) =>
        item.kpiKey === kpiKey
          ? {
              ...item,
              isVisible: visible,
            }
          : item,
      ),
    );
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setSaving(true);
    try {
      const response = await createRole({
        name: newRoleName.trim(),
        description: newRoleDescription.trim() || null,
      });
      toast.success("Role created");
      setAddDialogOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      invalidatePermissionsCache();
      await loadRoles();
      setSelectedRoleId(response.data.id);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create role");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await deleteRole(selectedRole.id);
      toast.success("Role deleted");
      setDeleteDialogOpen(false);
      invalidatePermissionsCache();
      await loadRoles();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete role");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignUser = async () => {
    if (!selectedRole || !assignUserId) return;
    const targetUser = users.find((item) => item.userId === assignUserId);
    if (!targetUser) return;

    const selectedRoleName = roleNameOf(selectedRole);
    if (selectedRoleName === "ROOT_ADMIN" && !isRootAdmin(user)) {
      toast.error("Only ROOT_ADMIN can assign ROOT_ADMIN role");
      return;
    }
    if (selectedRoleName !== "SUPERADMIN" && selectedRoleName !== "SUPER_ADMIN" && !targetUser.plantId) {
      toast.error("Selected user does not have a plant assigned");
      return;
    }

    setAssigning(true);
    try {
      await updateUserRoles(targetUser.userId, {
        roles: [selectedRoleName],
        plantId: targetUser.plantId,
      });
      invalidatePermissionsCache();
      toast.success("User assigned to role");
      setAssignUserId("");
      await loadUsers();
    } catch (error: any) {
      toast.error(error?.message || "Failed to assign user role");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignUser = async (targetUser: UserProfile) => {
    if (!selectedRole || roleNameOf(selectedRole) === "USER") {
      toast.error("Cannot unassign USER role");
      return;
    }

    setAssigning(true);
    try {
      await updateUserRoles(targetUser.userId, {
        roles: ["USER"],
        plantId: targetUser.plantId,
      });
      invalidatePermissionsCache();
      toast.success("User moved to USER role");
      await loadUsers();
    } catch (error: any) {
      toast.error(error?.message || "Failed to unassign user");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <PageShell>
      <BackButton />
      <PageHeader
        title="Role & Access Master"
        subtitle="Manage roles, permissions, and dashboard KPI visibility"
      />
      <p className="text-xs text-muted-foreground">
        Permissions last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "pending"}
        {import.meta.env.DEV && typeof rbacVersion === "number" ? ` | RBAC v${rbacVersion}` : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="shadow-card">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Roles</CardTitle>
              {canManageRoles && (
                <Button size="sm" className="gap-1" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Role
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 pl-9" placeholder="Search roles..." />
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {rolesLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading roles...
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No roles found.</div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredRoles.map((role) => {
                  const selected = role.id === selectedRoleId;
                  return (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{mapRoleLabel(role.name)}</div>
                          <div className="text-xs text-muted-foreground">{role.description || "No description"}</div>
                        </div>
                        {role.isSystem && <Badge variant="secondary">{mapRoleLabel(role.name)} (System)</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={!canDeleteSelectedRole}
              >
                <Trash2 className="h-4 w-4" />
                Delete Role
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">
                  {selectedRole ? `${mapRoleLabel(selectedRole.name)} Access` : "Select a role"}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRole?.description || "Select a role from left panel to manage access."}
                </p>
                {isRootAdminRole(selectedRole) && <p className="text-xs text-amber-600 mt-1 font-medium">ROOT_ADMIN permissions are locked to full access.</p>}
                {isSuperAdminRole(selectedRole) && <p className="text-xs text-muted-foreground mt-1">Use "Select all editable permissions" and Save to grant full SUPERADMIN access.</p>}
              </div>
              {selectedRole && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || (!permissionDirty && !kpiDirty)}>
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={handleSave}
                    disabled={saving || (activeTab === "permissions" ? !permissionDirty : activeTab === "kpis" ? !kpiDirty : true)}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {!selectedRole ? (
              <div className="text-sm text-muted-foreground py-12 text-center">Select a role from the left panel.</div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="permissions">Permissions</TabsTrigger>
                  <TabsTrigger value="kpis">Dashboard KPIs</TabsTrigger>
                  <TabsTrigger value="users">Users</TabsTrigger>
                </TabsList>

                <TabsContent value="permissions" className="space-y-4 mt-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="flex items-end gap-2">
                      <div className="space-y-2 min-w-[220px]">
                        <Label>Copy from role</Label>
                        <Select value={copyFromRoleId} onValueChange={setCopyFromRoleId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles
                              .filter((role) => role.id !== selectedRole.id)
                              .map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {mapRoleLabel(role.name)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="outline" className="gap-1" onClick={handleCopyFromRole} disabled={!copyFromRoleId || permissionsLoading}>
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox checked={globalChecked} onCheckedChange={(checked) => toggleGlobalAll(checked === true)} id="global-all" />
                      <Label htmlFor="global-all" className="text-sm font-medium">Select all editable permissions</Label>
                    </div>
                  </div>

                  {permissionsLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading permissions...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleModuleGroups.map((group) => (
                        <Card key={group.title} className="border-border/70">
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">{group.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0 pb-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left border-b">
                                  <th className="py-2 pr-3 min-w-[220px]">Module</th>
                                  <th className="py-2 pr-2 text-center">All</th>
                                  {ACTIONS.map((action) => (
                                    <th key={action} className="py-2 px-2 text-center">{action}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {group.modules.map((moduleItem) => {
                                  const checkedCount = ACTIONS.filter((action) => isActionChecked(moduleItem.key, action)).length;
                                  const rowAllChecked = checkedCount === ACTIONS.length;
                                  const locked = isPermissionLocked(moduleItem.key);

                                  return (
                                    <tr key={`${group.title}-${moduleItem.key}-${moduleItem.label}`} className="border-b last:border-0">
                                      <td className="py-2 pr-3">
                                        <div className="font-medium">{moduleItem.label}</div>
                                        <div className="text-xs text-muted-foreground">{moduleItem.key}</div>
                                      </td>
                                      <td className="py-2 px-2 text-center">
                                        <Checkbox
                                          checked={rowAllChecked}
                                          disabled={locked}
                                          onCheckedChange={(checked) => toggleModuleAll(moduleItem.key, checked === true)}
                                        />
                                      </td>
                                      {ACTIONS.map((action) => (
                                        <td key={`${moduleItem.key}-${moduleItem.label}-${action}`} className="py-2 px-2 text-center">
                                          <Checkbox
                                            checked={isActionChecked(moduleItem.key, action)}
                                            disabled={locked}
                                            onCheckedChange={(checked) => toggleAction(moduleItem.key, action, checked === true)}
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="kpis" className="space-y-4 mt-4">
                  {kpisLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading KPI visibility...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {kpiDraft.map((item, index) => {
                        const label = KPI_LABELS.find((entry) => entry.key === item.kpiKey)?.label || item.kpiKey;
                        const locked = isRootAdminRole(selectedRole);
                        return (
                          <div key={item.kpiKey} className="flex flex-col gap-3 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-medium text-sm">{label}</div>
                              <div className="text-xs text-muted-foreground">{item.kpiKey}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <AppSwitch checked={item.isVisible || locked} disabled={locked} onCheckedChange={(checked) => toggleKpi(item.kpiKey, checked)} aria-label={`${label} visible`} />
                              <Button variant="ghost" size="icon" onClick={() => moveKpi(index, -1)} disabled={locked || index === 0}>
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => moveKpi(index, 1)} disabled={locked || index === kpiDraft.length - 1}>
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="users" className="space-y-4 mt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Users currently assigned to this role
                  </div>

                  {canManageRoles && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <Label>Assign selected role to user</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Select value={assignUserId} onValueChange={setAssignUserId}>
                          <SelectTrigger className="h-10 sm:flex-1">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableUsersForAssign.map((item) => (
                              <SelectItem key={item.userId} value={item.userId}>
                                {item.userCode} - {item.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAssignUser} disabled={!assignUserId || assigning}>
                          {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Assign
                        </Button>
                      </div>
                    </div>
                  )}

                  {usersLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading users...
                    </div>
                  ) : roleUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-10 text-center">No users assigned to this role.</div>
                  ) : (
                    <div className="space-y-2">
                      {roleUsers.map((item) => (
                        <div key={item.userId} className="rounded-lg border px-3 py-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">{item.fullName}</div>
                            <div className="text-xs text-muted-foreground">{item.userCode} - {item.email}</div>
                          </div>
                          {canManageRoles && (
                            <Button variant="outline" size="sm" onClick={() => handleUnassignUser(item)} disabled={assigning || roleNameOf(selectedRole) === "USER"}>
                              Unassign
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <FormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        title="Add Role"
        description="Create a new custom role"
        onSubmit={handleCreateRole}
        submitLabel="Create Role"
        isLoading={saving}
      >
        <InputField label="Role Name" required value={newRoleName} onChange={setNewRoleName} placeholder="e.g. MAINTENANCE_MANAGER" />
        <TextareaField label="Description" value={newRoleDescription} onChange={setNewRoleDescription} placeholder="Role purpose" />
      </FormDialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Role"
        description="This will permanently delete the selected role. This action cannot be undone."
        itemName={selectedRole?.name}
        onConfirm={handleDeleteRole}
        isLoading={saving}
      />
    </PageShell>
  );
}
