import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { ApiError } from "@/api/http";
import {
  createOrgRole,
  deleteOrgRole,
  getOrgRolePermissions,
  listOrgRoles,
  saveOrgRolePermissions,
  updateOrgRole,
  type OrgRole,
  type OrgRolePermissionMap,
} from "@/api/orgRoleAccess";
import { listOrganizations, type Organization } from "@/api/organizations";
import {
  APP_PERMISSION_ACTIONS,
  NON_ROOT_APP_PAGES,
  NON_ROOT_PAGE_SECTIONS,
  type AppPageDefinition,
  type AppPermissionAction,
} from "@/config/app-page-catalog";
import { invalidatePermissionsCache } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { FormDialog } from "@/components/shared/FormDialog";
import { InputField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppSwitch } from "@/components/ui/app-switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

const ACTION_META: Record<AppPermissionAction, { label: string; hint: string }> = {
  READ: { label: "View", hint: "Open and read this page." },
  CREATE: { label: "Create", hint: "Add new records on this page." },
  UPDATE: { label: "Edit", hint: "Change existing records." },
  DELETE: { label: "Delete", hint: "Remove records from this page." },
  APPROVE: { label: "Approve", hint: "Approve workflow actions." },
  EXPORT: { label: "Export", hint: "Download exports from this page." },
};

const SYSTEM_USER_BLOCKED_MODULES = new Set(["PLANTS", "ORGANIZATIONS", "ROLE_ACCESS", "MODULES", "DEPARTMENTS", "USERS", "VENDORS", "SHIFTS"]);

type SyncState = "idle" | "saving" | "saved" | "error";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) return "Only Root Admin can manage organization role access.";
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

function normalizeActions(actions: string[] | undefined): AppPermissionAction[] {
  return Array.from(
    new Set((actions ?? []).map((action) => action.toUpperCase()).filter((action): action is AppPermissionAction =>
      APP_PERMISSION_ACTIONS.includes(action as AppPermissionAction))),
  );
}

function sanitizePermissionMap(input: OrgRolePermissionMap): OrgRolePermissionMap {
  return Object.fromEntries(
    Array.from(new Set(Object.keys(input ?? {})))
      .map((key) => key.trim().toUpperCase())
      .filter(Boolean)
      .map((key) => [key, normalizeActions(input[key])]),
  );
}

function serializePermissionMap(input: OrgRolePermissionMap) {
  return JSON.stringify(Object.keys(input).sort().map((key) => [key, normalizeActions(input[key]).sort()]));
}

function pagePermissionKeys(page: AppPageDefinition) {
  return Array.from(new Set([page.permissionModuleKey, ...(page.aliases ?? [])])).map((key) => key.toUpperCase());
}

function readPageActions(input: OrgRolePermissionMap, page: AppPageDefinition): AppPermissionAction[] {
  return Array.from(new Set(pagePermissionKeys(page).flatMap((key) => normalizeActions(input[key]))));
}

function writePageActions(input: OrgRolePermissionMap, page: AppPageDefinition, nextActions: AppPermissionAction[]) {
  const next = { ...input };
  const sanitized = normalizeActions(nextActions);
  pagePermissionKeys(page).forEach((key) => {
    next[key] = sanitized;
  });
  return next;
}

function normalizeRoleKeyForPolicy(roleKey: string) {
  const normalized = roleKey
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized === "SUPER_ADMIN") return "SUPERADMIN";
  if (normalized === "SECURITY_USER") return "SECURITY";
  return normalized;
}

function buildFullAccessMapFromCatalog(seed: OrgRolePermissionMap) {
  const keys = new Set<string>(Object.keys(seed));
  NON_ROOT_APP_PAGES.forEach((page) => {
    pagePermissionKeys(page).forEach((key) => keys.add(key));
  });
  return Object.fromEntries(Array.from(keys).map((key) => [key, [...APP_PERMISSION_ACTIONS]])) as OrgRolePermissionMap;
}

function applySystemRolePolicy(roleKey: string, input: OrgRolePermissionMap) {
  const normalizedRoleKey = normalizeRoleKeyForPolicy(roleKey);
  const normalized = sanitizePermissionMap(input);

  if (normalizedRoleKey === "SUPERADMIN") {
    const next = buildFullAccessMapFromCatalog(normalized);
    next.ORGANIZATIONS = ["READ"];
    next.PLANTS = ["READ", "UPDATE"];
    next["MASTERS.PLANT"] = ["READ", "UPDATE"];
    return next;
  }

  if (normalizedRoleKey === "ADMIN") {
    const next = buildFullAccessMapFromCatalog(normalized);
    delete next.PLANTS;
    delete next["MASTERS.PLANT"];
    next.ORGANIZATIONS = ["READ"];
    return next;
  }

  if (normalizedRoleKey === "VISITOR") {
    return {};
  }

  if (normalizedRoleKey === "VENDOR") {
    const actions = normalizeActions(normalized.AMC);
    return { AMC: actions.length > 0 ? actions : ["READ"] };
  }

  if (normalizedRoleKey === "SECURITY") {
    const actions = normalizeActions(normalized.GATES);
    return { GATES: actions.length > 0 ? actions : ["READ"] };
  }

  if (normalizedRoleKey === "USER") {
    const filtered: OrgRolePermissionMap = {};
    Object.entries(normalized).forEach(([moduleKey, actions]) => {
      if (moduleKey === "MASTERS" || moduleKey.startsWith("MASTERS.")) return;
      if (SYSTEM_USER_BLOCKED_MODULES.has(moduleKey)) return;
      filtered[moduleKey] = actions;
    });
    return filtered;
  }

  return normalized;
}

function getSystemRolePolicyHint(roleKey: string): string | null {
  const normalizedRoleKey = normalizeRoleKeyForPolicy(roleKey);
  if (normalizedRoleKey === "SUPERADMIN") return "SUPERADMIN policy is fixed: full organization access across modules, with Plant Master limited to view and edit.";
  if (normalizedRoleKey === "ADMIN") return "ADMIN policy is fixed: all modules except Plant Master.";
  if (normalizedRoleKey === "USER") return "USER policy is enforced: governance/master module permissions are removed.";
  if (normalizedRoleKey === "VENDOR") return "VENDOR policy is enforced: AMC-only access.";
  if (normalizedRoleKey === "VISITOR") return "VISITOR policy is enforced: no page access.";
  if (normalizedRoleKey === "SECURITY") return "SECURITY policy is enforced: gate-entry-only access.";
  return null;
}

function buildRoleKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatSyncTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function RootRoleAccessMaster() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const [permissionMap, setPermissionMap] = useState<OrgRolePermissionMap>({});
  const [permissionInitial, setPermissionInitial] = useState<OrgRolePermissionMap>({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState(NON_ROOT_APP_PAGES[0]?.id ?? "");

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isRenameRoleOpen, setIsRenameRoleOpen] = useState(false);
  const [isDeleteRoleOpen, setIsDeleteRoleOpen] = useState(false);
  const [roleNameInput, setRoleNameInput] = useState("");
  const [isRoleSubmitting, setIsRoleSubmitting] = useState(false);

  const autosaveRequestRef = useRef(0);
  const didLoadPermissionsRef = useRef(false);
  const rolesRequestRef = useRef(0);
  const permissionsRequestRef = useRef(0);

  const selectedOrganization = useMemo(() => organizations.find((item) => item.id === selectedOrgId) ?? null, [organizations, selectedOrgId]);
  const selectedRole = useMemo(() => roles.find((item) => item.id === selectedRoleId) ?? null, [roles, selectedRoleId]);
  const selectedPage = useMemo(
    () => NON_ROOT_APP_PAGES.find((page) => page.id === selectedPageId) ?? NON_ROOT_APP_PAGES[0] ?? null,
    [selectedPageId],
  );
  const selectedPageActions = useMemo(
    () => (selectedPage ? readPageActions(permissionMap, selectedPage) : []),
    [permissionMap, selectedPage],
  );
  const permissionDirty = serializePermissionMap(permissionMap) !== serializePermissionMap(permissionInitial);
  const allowedPages = useMemo(
    () => NON_ROOT_PAGE_SECTIONS.flatMap((section) => NON_ROOT_APP_PAGES.filter((page) => page.section === section)),
    [],
  );

  const fetchRoles = useCallback(async (orgId: string) => {
    const requestId = ++rolesRequestRef.current;
    setRolesLoading(true);
    try {
      const response = await listOrgRoles(orgId);
      if (requestId !== rolesRequestRef.current) return;
      const rows = response.data || [];
      setRoles(rows);
      setSelectedRoleId((current) => (current && rows.some((role) => role.id === current) ? current : rows[0]?.id || ""));
    } catch (error) {
      if (requestId !== rolesRequestRef.current) return;
      toast.error(getErrorMessage(error, "Failed to load organization roles"));
    } finally {
      if (requestId === rolesRequestRef.current) {
        setRolesLoading(false);
      }
    }
  }, []);

  const fetchRolePermissions = useCallback(async (orgId: string, roleId: string, roleKey?: string) => {
    const requestId = ++permissionsRequestRef.current;
    setPermissionsLoading(true);
    didLoadPermissionsRef.current = false;
    try {
      const response = await getOrgRolePermissions(orgId, roleId);
      if (requestId !== permissionsRequestRef.current) return;
      const normalized = sanitizePermissionMap(response.data || {});
      const effective = roleKey ? applySystemRolePolicy(roleKey, normalized) : normalized;
      setPermissionMap(effective);
      setPermissionInitial(effective);
      setSyncState("saved");
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== permissionsRequestRef.current) return;
      if (error instanceof ApiError && error.status === 404) {
        setSelectedRoleId("");
        setPermissionMap({});
        setPermissionInitial({});
        setSyncState("idle");
        setLastSyncedAt(null);
        void fetchRoles(orgId);
        return;
      }
      toast.error(getErrorMessage(error, "Failed to load role permissions"));
      setPermissionMap({});
      setPermissionInitial({});
      setSyncState("error");
    } finally {
      if (requestId === permissionsRequestRef.current) {
        didLoadPermissionsRef.current = true;
        setPermissionsLoading(false);
      }
    }
  }, [fetchRoles]);

  useEffect(() => {
    void (async () => {
      setOrganizationLoading(true);
      try {
        const response = await listOrganizations({ page: 1, limit: 200, includeInactive: true });
        const rows = response.data || [];
        setOrganizations(rows);
        setSelectedOrgId((current) => (current && rows.some((row) => row.id === current) ? current : rows[0]?.id || ""));
      } catch (error) {
        toast.error(getErrorMessage(error, "Failed to load organizations"));
      } finally {
        setOrganizationLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedOrgId) {
      rolesRequestRef.current += 1;
      permissionsRequestRef.current += 1;
      setRoles([]);
      setSelectedRoleId("");
      setPermissionMap({});
      setPermissionInitial({});
      setSyncState("idle");
      setLastSyncedAt(null);
      return;
    }
    rolesRequestRef.current += 1;
    permissionsRequestRef.current += 1;
    setRoles([]);
    setSelectedRoleId("");
    setPermissionMap({});
    setPermissionInitial({});
    setSyncState("idle");
    setLastSyncedAt(null);
    void fetchRoles(selectedOrgId);
  }, [selectedOrgId, fetchRoles]);

  useEffect(() => {
    if (!selectedOrgId || !selectedRole || selectedRole.organizationId !== selectedOrgId) {
      permissionsRequestRef.current += 1;
      setPermissionMap({});
      setPermissionInitial({});
      setSyncState("idle");
      setLastSyncedAt(null);
      return;
    }
    void fetchRolePermissions(selectedOrgId, selectedRole.id, selectedRole.key);
  }, [fetchRolePermissions, selectedOrgId, selectedRole]);

  useEffect(() => {
    if (!selectedPageId && allowedPages[0]) {
      setSelectedPageId(allowedPages[0].id);
    }
  }, [allowedPages, selectedPageId]);

  useEffect(() => {
    if (!selectedOrgId || !selectedRole || selectedRole.organizationId !== selectedOrgId || !didLoadPermissionsRef.current || permissionsLoading) return;
    if (!permissionDirty) return;

    setSyncState("saving");
    const requestId = ++autosaveRequestRef.current;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = selectedRole ? applySystemRolePolicy(selectedRole.key, sanitizePermissionMap(permissionMap)) : sanitizePermissionMap(permissionMap);
          const response = await saveOrgRolePermissions(selectedOrgId, selectedRole.id, payload);
          if (requestId !== autosaveRequestRef.current) return;

          const normalized = sanitizePermissionMap(response.data?.permissions || payload);
          const effective = selectedRole ? applySystemRolePolicy(selectedRole.key, normalized) : normalized;
          setPermissionMap(effective);
          setPermissionInitial(effective);
          setSyncState("saved");
          setLastSyncedAt(new Date().toISOString());
          invalidatePermissionsCache();
        } catch (error) {
          if (requestId !== autosaveRequestRef.current) return;
          if (error instanceof ApiError && error.status === 404) {
            setSyncState("idle");
            setSelectedRoleId("");
            setPermissionMap({});
            setPermissionInitial({});
            setLastSyncedAt(null);
            void fetchRoles(selectedOrgId);
            return;
          }
          setSyncState("error");
          toast.error(getErrorMessage(error, "Failed to sync role access"));
        }
      })();
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [fetchRoles, permissionDirty, permissionMap, permissionsLoading, selectedOrgId, selectedRole]);

  const togglePageAction = (page: AppPageDefinition, action: AppPermissionAction, checked: boolean) => {
    setPermissionMap((current) => {
      const actions = new Set(readPageActions(current, page));
      if (checked) actions.add(action);
      else actions.delete(action);
      return writePageActions(current, page, Array.from(actions) as AppPermissionAction[]);
    });
  };

  const handleCreateRole = async () => {
    if (!selectedOrgId) {
      toast.error("Select an organization first");
      return;
    }
    const name = roleNameInput.trim();
    const key = buildRoleKey(name);
    if (!name || !key) {
      toast.error("Role name is required");
      return;
    }

    setIsRoleSubmitting(true);
    try {
      const response = await createOrgRole(selectedOrgId, { key, name, isActive: true });
      await fetchRoles(selectedOrgId);
      setSelectedRoleId(response.data.id);
      setRoleNameInput("");
      setIsCreateRoleOpen(false);
      invalidatePermissionsCache();
      toast.success("Role created");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create role"));
    } finally {
      setIsRoleSubmitting(false);
    }
  };

  const handleRenameRole = async () => {
    if (!selectedOrgId || !selectedRole) return;
    const name = roleNameInput.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }

    setIsRoleSubmitting(true);
    try {
      await updateOrgRole(selectedOrgId, selectedRole.id, { name });
      await fetchRoles(selectedOrgId);
      setRoleNameInput("");
      setIsRenameRoleOpen(false);
      invalidatePermissionsCache();
      toast.success("Role renamed");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to rename role"));
    } finally {
      setIsRoleSubmitting(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedOrgId || !selectedRole) return;

    setIsRoleSubmitting(true);
    try {
      await deleteOrgRole(selectedOrgId, selectedRole.id);
      setIsDeleteRoleOpen(false);
      await fetchRoles(selectedOrgId);
      invalidatePermissionsCache();
      toast.success("Role deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete role"));
    } finally {
      setIsRoleSubmitting(false);
    }
  };

  const openCreateRole = () => {
    setRoleNameInput("");
    setIsCreateRoleOpen(true);
  };

  const openRenameRole = () => {
    if (!selectedRole) return;
    setRoleNameInput(selectedRole.name);
    setIsRenameRoleOpen(true);
  };

  const syncLabel =
    syncState === "saving"
      ? "Syncing changes..."
      : syncState === "error"
        ? "Sync failed"
        : syncState === "saved"
          ? `Synced${lastSyncedAt ? ` at ${formatSyncTime(lastSyncedAt)}` : ""}`
          : "Ready";

  return (
    <PageShell className="overflow-hidden">
      <div className="space-y-4">
        <PageHeader
          title="Organization Role & Access"
          subtitle="Select organization, role, and page in one screen. Permission changes sync to the backend automatically."
        />

        <Card className="shadow-card">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/5 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Organization</p>
                <p className="text-xs text-muted-foreground">Choose the organization first to load its roles and access rules.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId} disabled={organizationLoading || organizations.length === 0}>
                <SelectTrigger className="w-full min-w-[280px] sm:w-[320px]">
                  <SelectValue placeholder={organizationLoading ? "Loading organizations..." : "Select organization"} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name} {organization.code ? `(${organization.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {syncState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : syncState === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : syncState === "error" ? <RefreshCw className="h-3.5 w-3.5 text-rose-600" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                <span>{syncLabel}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:h-[calc(100vh-15.5rem)] xl:grid-cols-[280px_300px_minmax(0,1fr)]">
          <Card className="flex min-h-0 flex-col shadow-card">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">User Roles</CardTitle>
                <Button size="sm" onClick={openCreateRole} disabled={!selectedOrgId}>
                  <Plus className="mr-1 h-4 w-4" />
                  Create Role
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Roles for {selectedOrganization?.name || "the selected organization"}.</p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={openRenameRole} disabled={!selectedRole}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setIsDeleteRoleOpen(true)}
                  disabled={!selectedRole || selectedRole.isSystem}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>

              {!selectedOrgId ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Select an organization to load its roles.
                </div>
              ) : rolesLoading ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading roles...
                </div>
              ) : roles.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  No roles found for this organization.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto pr-1">
                  {roles.map((role) => {
                    const isCurrent = role.id === selectedRoleId;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRoleId(role.id)}
                        className={cn(
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          isCurrent ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 hover:bg-accent/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{role.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{role.key}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge variant={role.isActive ? "active" : "inactive"} showDot={false}>
                              {role.isActive ? "Active" : "Inactive"}
                            </StatusBadge>
                            {role.isSystem ? (
                              <StatusBadge variant="info" showDot={false}>
                                System
                              </StatusBadge>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col shadow-card">
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="text-base">Pages</CardTitle>
              <p className="text-sm text-muted-foreground">Choose one page and edit only that page's access.</p>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
              {!selectedRole ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Select a role to view its pages.
                </div>
              ) : permissionsLoading ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading page access...
                </div>
              ) : (
                <div className="space-y-4">
                  {NON_ROOT_PAGE_SECTIONS.map((section) => {
                    const pages = allowedPages.filter((page) => page.section === section);
                    return (
                      <div key={section} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{section}</p>
                        {pages.map((page) => {
                          const isCurrent = page.id === selectedPage?.id;
                          const granted = readPageActions(permissionMap, page).includes("READ");
                          return (
                            <button
                              key={page.id}
                              type="button"
                              onClick={() => setSelectedPageId(page.id)}
                              className={cn(
                                "w-full rounded-2xl border px-3 py-3 text-left transition",
                                isCurrent ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 hover:bg-accent/40",
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{page.title}</p>
                                  <p className="truncate text-xs text-muted-foreground">{page.permissionModuleKey}</p>
                                </div>
                                <StatusBadge variant={granted ? "active" : "inactive"} showDot={false}>
                                  {granted ? "View" : "Blocked"}
                                </StatusBadge>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col shadow-card">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">Page Access Configuration</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedPage ? `${selectedPage.title} access for ${selectedRole?.name || "the selected role"}.` : "Select a page to continue."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRole ? (
                    <StatusBadge variant="info" showDot={false}>
                      {selectedRole.name}
                    </StatusBadge>
                  ) : null}
                  {selectedPage ? (
                    <StatusBadge variant="active" showDot={false}>
                      {selectedPage.permissionModuleKey}
                    </StatusBadge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
              {!selectedRole ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Select an organization and role first.
                </div>
              ) : permissionsLoading ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading permissions...
                </div>
              ) : !selectedPage ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  Select a page from the middle panel.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.07] via-background to-background p-5">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">{selectedPage.title}</h3>
                      <p className="text-sm text-muted-foreground">{selectedPage.description}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{selectedPage.path}</span>
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{selectedPage.section}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {APP_PERMISSION_ACTIONS.map((action) => (
                      <div key={action} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{ACTION_META[action].label}</p>
                            <p className="text-xs text-muted-foreground">{ACTION_META[action].hint}</p>
                          </div>
                          <AppSwitch
                            size="sm"
                            checked={selectedPageActions.includes(action)}
                            onCheckedChange={(checked) => togglePageAction(selectedPage, action, checked === true)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedRole?.isSystem ? (
                    <div className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      {getSystemRolePolicyHint(selectedRole.key) || "System role policy is enforced for this role."}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
                    <p className="text-sm font-medium">Autosave</p>
                    <p className="text-xs text-muted-foreground">
                      Permission changes are saved automatically to the backend without reloading the page.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FormDialog
        open={isCreateRoleOpen}
        onOpenChange={setIsCreateRoleOpen}
        title="Create Role"
        description="Add a role for the selected organization. The role key is generated automatically."
        onSubmit={handleCreateRole}
        submitLabel={isRoleSubmitting ? "Creating..." : "Create Role"}
      >
        <InputField label="Role Name" value={roleNameInput} onChange={setRoleNameInput} placeholder="e.g. Maintenance Planner" required />
        <div className="space-y-2">
          <Label className="text-xs font-medium">Generated Role Key</Label>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {buildRoleKey(roleNameInput) || "Role key will be generated from the role name"}
          </div>
        </div>
      </FormDialog>

      <FormDialog
        open={isRenameRoleOpen}
        onOpenChange={setIsRenameRoleOpen}
        title="Rename Role"
        description="Update the display name for this role."
        onSubmit={handleRenameRole}
        submitLabel={isRoleSubmitting ? "Saving..." : "Save Role"}
      >
        <InputField label="Role Name" value={roleNameInput} onChange={setRoleNameInput} placeholder="e.g. Maintenance Planner" required />
        {selectedRole ? (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Role Key</Label>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{selectedRole.key}</div>
          </div>
        ) : null}
      </FormDialog>

      <DeleteConfirmDialog
        open={isDeleteRoleOpen}
        onOpenChange={setIsDeleteRoleOpen}
        title="Delete Role"
        itemName={selectedRole?.name}
        onConfirm={handleDeleteRole}
        isLoading={isRoleSubmitting}
      />
    </PageShell>
  );
}
