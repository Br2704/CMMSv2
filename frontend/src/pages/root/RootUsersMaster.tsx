import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Edit, Eye, Factory, ImageIcon, Plus, Search, Shield, Trash2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { listOrgRoles, type OrgRole } from "@/api/orgRoleAccess";
import { listOrganizations, type Organization } from "@/api/organizations";
import { listPlants, type Plant } from "@/api/plants";
import { ensureAccessToken } from "@/api/http";
import { createRootUser, deleteRootUser, listOrgAdmins, listRootUsers, type RootOrgUser, updateRootUser } from "@/api/rootUsers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialog } from "@/components/shared/FormDialog";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { InputField, SelectField } from "@/components/shared/FormField";
import { ProfileImageField } from "@/components/shared/ProfileImageField";
import { ViewDialog, DetailRow, DetailSection } from "@/components/shared/ViewDialog";
import { ResponsiveTable } from "@/components/shared/ResponsiveTable";
import { MobileCard, MobileCardHeader, MobileCardRow } from "@/components/shared/MobileCard";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Toolbar } from "@/components/layout/Toolbar";
import { DataTableShell } from "@/components/layout/DataTableShell";
import { FormGrid } from "@/components/layout/FormGrid";
import { EmptyState } from "@/components/app-shell/EmptyState";
import { TableSkeleton } from "@/components/app-shell/TableSkeleton";
import { initializeAuthState, isRootAdmin, useAuthStore } from "@/store/auth.store";
import { useBrandingStore } from "@/store/branding.store";

type RootRole = string;
type UserFormMode = "organization-user" | "root-admin";

interface RootUserForm {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  profileImageUrl: string;
  userCode: string;
  roleKey: RootRole;
  organizationId: string;
  plantId: string;
  isActive: boolean;
}

const emptyUserForm: RootUserForm = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  profileImageUrl: "",
  userCode: "",
  roleKey: "SUPERADMIN",
  organizationId: "",
  plantId: "",
  isActive: true,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function normalizeRoleKey(role: string) {
  return role.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatRoleLabel(role: string, fallbackName?: string | null) {
  if (fallbackName?.trim()) {
    return fallbackName.trim();
  }
  const normalized = normalizeRoleKey(role);
  if (normalized === "ROOT_ADMIN") return "Root Admin";
  if (normalized === "SUPERADMIN") return "Superadmin";
  return normalized
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function getRoleBadgeVariant(role: string) {
  const normalized = normalizeRoleKey(role);
  if (normalized === "ROOT_ADMIN") return "warning" as const;
  if (normalized === "SUPERADMIN") return "primary" as const;
  if (normalized === "ADMIN") return "info" as const;
  return "default" as const;
}

function roleRequiresPlant(role: string) {
  const normalized = normalizeRoleKey(role);
  return normalized !== "ROOT_ADMIN" && normalized !== "SUPERADMIN";
}

function sortOrganizations(items: Organization[]) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "");
    const rightTime = Date.parse(right.createdAt || "");
    return rightTime - leftTime;
  });
}

function sortUsers(items: RootOrgUser[]) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "");
    const rightTime = Date.parse(right.createdAt || "");
    return rightTime - leftTime;
  });
}

function matchesOrganizationSearch(organization: Organization, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    organization.name,
    organization.code,
    organization.legalName,
    organization.contactEmail,
    organization.primaryContactEmail,
    organization.website,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function matchesUserSearch(user: RootOrgUser, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    user.fullName,
    user.email,
    user.userCode,
    user.organizationName,
    user.phone,
    formatRoleLabel(user.roleKey),
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function buildRootOrganizationFallback(
  user: ReturnType<typeof useAuthStore.getState>["user"],
  brandingOrganizationId: string | null,
  brandingOrganizationName: string | null,
  brandingLogoUrl: string | null,
): Organization | null {
  const organizationId = user?.organizationId ?? brandingOrganizationId ?? null;
  const organizationName = brandingOrganizationName?.trim() || null;
  if (!organizationId || !organizationName) {
    return null;
  }

  return {
    id: organizationId,
    name: organizationName,
    code: null,
    legalName: organizationName,
    industry: null,
    registrationNumber: null,
    taxId: null,
    website: null,
    contactEmail: user?.email ?? null,
    contactPhone: user?.phone ?? null,
    primaryContactName: user?.fullName ?? null,
    primaryContactEmail: user?.email ?? null,
    primaryContactPhone: user?.phone ?? null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    country: null,
    postalCode: null,
    notes: null,
    logoUrl: brandingLogoUrl,
    faviconUrl: null,
    brandColor: null,
    billingCycle: null,
    subscriptionStatus: "ACTIVE",
    hasFreeTrial: false,
    trialStartDate: null,
    trialEndDate: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    reminderEnabled: true,
    reminderLeadDays: 60,
    lastReminderSentAt: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plantsCount: 0,
    usersCount: 0,
    adminsCount: 0,
    superadminsCount: 0,
  };
}

export default function RootUsersMaster() {
  const { user } = useAuthStore();
  const brandingOrganizationId = useBrandingStore((state) => state.organizationId);
  const brandingOrganizationName = useBrandingStore((state) => state.organizationName);
  const brandingLogoUrl = useBrandingStore((state) => state.logoUrl);
  const refreshBranding = useBrandingStore((state) => state.fetchBranding);
  const isRootUser = isRootAdmin(user);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgSearch, setOrgSearch] = useState("");
  const [orgLoading, setOrgLoading] = useState(true);
  const [rootAdminsSearch, setRootAdminsSearch] = useState("");
  const [rootAdminsLoading, setRootAdminsLoading] = useState(true);
  const [rootAdmins, setRootAdmins] = useState<RootOrgUser[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<RootOrgUser[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [orgRolesByOrganization, setOrgRolesByOrganization] = useState<Record<string, OrgRole[]>>({});

  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<RootOrgUser | null>(null);
  const [userForm, setUserForm] = useState<RootUserForm>(emptyUserForm);
  const [userFormMode, setUserFormMode] = useState<UserFormMode>("organization-user");
  const [savingUser, setSavingUser] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<RootOrgUser | null>(null);
  const [isUserViewOpen, setIsUserViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState<RootOrgUser | null>(null);
  const fallbackOrganization = useMemo(
    () => buildRootOrganizationFallback(user, brandingOrganizationId, brandingOrganizationName, brandingLogoUrl),
    [brandingLogoUrl, brandingOrganizationId, brandingOrganizationName, user],
  );

  const displayOrganizations = useMemo(() => {
    if (!fallbackOrganization) {
      return organizations;
    }
    if (organizations.some((organization) => organization.id === fallbackOrganization.id)) {
      return organizations;
    }
    return sortOrganizations([fallbackOrganization, ...organizations]);
  }, [fallbackOrganization, organizations]);

  const filteredOrganizations = useMemo(
    () => displayOrganizations.filter((organization) => matchesOrganizationSearch(organization, orgSearch)),
    [displayOrganizations, orgSearch],
  );
  const filteredRootAdmins = useMemo(
    () => rootAdmins.filter((rootAdmin) => matchesUserSearch(rootAdmin, rootAdminsSearch)),
    [rootAdmins, rootAdminsSearch],
  );
  const platformOrganization = useMemo(() => {
    if (user?.organizationId) {
      return displayOrganizations.find((organization) => organization.id === user.organizationId) ?? fallbackOrganization;
    }
    return fallbackOrganization ?? displayOrganizations[0] ?? null;
  }, [displayOrganizations, fallbackOrganization, user?.organizationId]);
  const isRootAdminRoleForm = normalizeRoleKey(userForm.roleKey || "") === "ROOT_ADMIN";

  const governanceSummary = useMemo(() => {
    const totalOrganizations = displayOrganizations.length;
    const totalRootAdmins = rootAdmins.length;
    const totalSuperadmins = displayOrganizations.reduce((sum, organization) => sum + (organization.superadminsCount ?? 0), 0);
    const totalAdmins = displayOrganizations.reduce((sum, organization) => sum + (organization.adminsCount ?? 0), 0);
    const totalPlants = displayOrganizations.reduce((sum, organization) => sum + (organization.plantsCount ?? 0), 0);
    return { totalOrganizations, totalRootAdmins, totalSuperadmins, totalAdmins, totalPlants };
  }, [displayOrganizations, rootAdmins.length]);

  const fetchOrganizations = useCallback(async () => {
    setOrgLoading(true);
    try {
      const hasAccessToken = await ensureAccessToken();
      if (!hasAccessToken) {
        setOrganizations(fallbackOrganization ? [fallbackOrganization] : []);
        return;
      }

      const response = await listOrganizations({
        page: 1,
        limit: 200,
        includeInactive: false,
      });
      if (response.data.length > 0 || !isRootUser) {
        setOrganizations(sortOrganizations(response.data));
        return;
      }
      setOrganizations(fallbackOrganization ? [fallbackOrganization] : []);
    } catch (error: unknown) {
      if (fallbackOrganization && [400, 401].includes(getErrorStatus(error) ?? 0)) {
        setOrganizations([fallbackOrganization]);
        return;
      }
      toast.error(getErrorMessage(error, "Failed to load organizations"));
    } finally {
      setOrgLoading(false);
    }
  }, [fallbackOrganization, isRootUser]);

  const fetchRootAdmins = useCallback(async () => {
    setRootAdminsLoading(true);
    try {
      const response = await listRootUsers({
        roleKey: "ROOT_ADMIN",
        page: 1,
        limit: 200,
        includeInactive: true,
      });
      setRootAdmins(sortUsers(response.data));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load platform root admins"));
    } finally {
      setRootAdminsLoading(false);
    }
  }, []);

  const fetchOrganizationUsers = useCallback(async (organizationId: string, search?: string) => {
    setUsersLoading(true);
    try {
      const response = await listOrgAdmins({
        organizationId,
        page: 1,
        limit: 200,
        search: search || undefined,
      });
      setUsers(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load organization users"));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchPlants = useCallback(async () => {
    try {
      const response = await listPlants({ page: 1, limit: 500, includeInactive: false });
      setPlants(response.data);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load plants"));
    }
  }, []);

  const fetchOrgRoles = useCallback(async (organizationId: string) => {
    try {
      const response = await listOrgRoles(organizationId);
      setOrgRolesByOrganization((current) => ({
        ...current,
        [organizationId]: response.data.filter((role) => role.isActive),
      }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load organization roles"));
    }
  }, []);

  useEffect(() => {
    void fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    void fetchRootAdmins();
  }, [fetchRootAdmins]);

  useEffect(() => {
    void fetchPlants();
  }, [fetchPlants]);

  useEffect(() => {
    if (!userForm.organizationId) return;
    if (orgRolesByOrganization[userForm.organizationId]) return;
    void fetchOrgRoles(userForm.organizationId);
  }, [fetchOrgRoles, orgRolesByOrganization, userForm.organizationId]);

  useEffect(() => {
    if (!usersDialogOpen || !selectedOrganization) return;
    void fetchOrganizationUsers(selectedOrganization.id, usersSearch);
  }, [fetchOrganizationUsers, usersDialogOpen, selectedOrganization, usersSearch]);

  const organizationOptions = useMemo(
    () =>
      displayOrganizations.map((organization) => ({
        value: organization.id,
        label: `${organization.name}${organization.code ? ` (${organization.code})` : ""}`,
      })),
    [displayOrganizations],
  );

  const organizationNameById = useMemo(
    () => new Map(displayOrganizations.map((organization) => [organization.id, organization.name])),
    [displayOrganizations],
  );

  const plantOptions = useMemo(
    () =>
      plants
        .filter((plant) => plant.organizationId === userForm.organizationId)
        .map((plant) => ({
        value: plant.id,
        label: `${plant.plantCode} - ${plant.plantName}`,
      })),
    [plants, userForm.organizationId],
  );

  const activeOrgRoles = useMemo(
    () => (userForm.organizationId ? orgRolesByOrganization[userForm.organizationId] ?? [] : []),
    [orgRolesByOrganization, userForm.organizationId],
  );

  const roleOptions = useMemo(() => {
    const baseOptions = userFormMode === "root-admin"
      ? [{ value: "ROOT_ADMIN", label: "Root Admin" }]
      : activeOrgRoles.map((role) => ({
        value: role.key,
        label: formatRoleLabel(role.key, role.name),
      }));
    const options = [...baseOptions];
    if (userForm.roleKey && !options.some((option) => option.value === userForm.roleKey)) {
      options.push({
        value: userForm.roleKey,
        label: formatRoleLabel(userForm.roleKey),
      });
    }
    return options;
  }, [activeOrgRoles, userForm.roleKey, userFormMode]);

  useEffect(() => {
    if (!isUserFormOpen) return;
    if (!userForm.roleKey) return;
    if (roleOptions.some((option) => option.value === userForm.roleKey)) return;
    const nextRole = roleOptions[0]?.value ?? "";
    setUserForm((current) => ({ ...current, roleKey: nextRole, plantId: "" }));
  }, [isUserFormOpen, roleOptions, userForm.roleKey]);

  const openOrganizationUsers = (organization: Organization) => {
    setSelectedOrganization(organization);
    setUsersSearch("");
    setUsersDialogOpen(true);
    void fetchOrgRoles(organization.id);
  };

  const openCreateUser = () => {
    setUserFormMode("organization-user");
    setEditingUser(null);
    const selectedOrganizationId = selectedOrganization?.id || platformOrganization?.id || "";
    const orgRoles = selectedOrganizationId ? orgRolesByOrganization[selectedOrganizationId] ?? [] : [];
    setUserForm({
      ...emptyUserForm,
      organizationId: selectedOrganizationId,
      roleKey: orgRoles[0]?.key || "SUPERADMIN",
    });
    if (selectedOrganizationId) {
      void fetchOrgRoles(selectedOrganizationId);
    }
    setIsUserFormOpen(true);
  };

  const openCreateRootAdmin = () => {
    const defaultOrganizationId = selectedOrganization?.id || platformOrganization?.id || displayOrganizations[0]?.id || user?.organizationId || "";
    setUserFormMode("root-admin");
    setEditingUser(null);
    setUserForm({
      ...emptyUserForm,
      organizationId: defaultOrganizationId,
      roleKey: "ROOT_ADMIN",
      plantId: "",
    });
    setIsUserFormOpen(true);
  };

  const openEditUser = (user: RootOrgUser) => {
    const derivedOrganizationId = user.organizationId || selectedOrganization?.id || platformOrganization?.id || "";
    setUserFormMode(normalizeRoleKey(user.roleKey) === "ROOT_ADMIN" ? "root-admin" : "organization-user");
    setEditingUser(user);
    setUserForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      phone: user.phone || "",
      profileImageUrl: user.profileImageUrl || "",
      userCode: user.userCode || "",
      roleKey: user.roleKey,
      organizationId: derivedOrganizationId,
      plantId: user.plantId || "",
      isActive: user.isActive,
    });
    if (derivedOrganizationId) {
      void fetchOrgRoles(derivedOrganizationId);
    }
    setIsUserFormOpen(true);
  };

  const openViewUser = (user: RootOrgUser) => {
    setViewUser(user);
    setIsUserViewOpen(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.fullName.trim() || !userForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!editingUser && !userForm.password.trim()) {
      toast.error("Password is required");
      return;
    }
    const selectedPlant = roleRequiresPlant(userForm.roleKey)
      ? plants.find((plant) => plant.id === userForm.plantId)
      : null;
    const resolvedOrganizationId =
      userForm.organizationId ||
      selectedPlant?.organizationId ||
      editingUser?.organizationId ||
      selectedOrganization?.id ||
      "";

    if (!resolvedOrganizationId) {
      toast.error("Organization is required");
      return;
    }

    if (roleRequiresPlant(userForm.roleKey) && (!selectedPlant || selectedPlant.organizationId !== resolvedOrganizationId)) {
      toast.error("Plant is required for the selected role");
      return;
    }

    setSavingUser(true);
    try {
      const payload = {
        fullName: userForm.fullName.trim(),
        email: userForm.email.trim(),
        phone: userForm.phone.trim() || null,
        profileImageUrl: userForm.profileImageUrl.trim() || null,
        userCode: userForm.userCode.trim() || null,
        roleKey: userForm.roleKey,
        organizationId: resolvedOrganizationId,
        plantId: roleRequiresPlant(userForm.roleKey) ? selectedPlant?.id || null : null,
        isActive: userForm.isActive,
        ...(userForm.password.trim() ? { password: userForm.password.trim() } : {}),
      };

      let savedUser: RootOrgUser;

      if (editingUser) {
        const response = await updateRootUser(editingUser.id, payload);
        savedUser = response.data;
        toast.success("User updated");
      } else {
        const response = await createRootUser({
          ...payload,
          password: userForm.password.trim(),
        });
        savedUser = response.data;
        toast.success("User created");
      }

      setUsers((current) => {
        if (!selectedOrganization) {
          return current;
        }

        const belongsToSelectedOrganization = savedUser.organizationId === selectedOrganization.id;
        const nextUsers = current.filter((item) => item.id !== savedUser.id);
        if (!belongsToSelectedOrganization) {
          return nextUsers;
        }
        return [savedUser, ...nextUsers];
      });
      setRootAdmins((current) => {
        const nextUsers = current.filter((item) => item.id !== savedUser.id);
        if (normalizeRoleKey(savedUser.roleKey) !== "ROOT_ADMIN") {
          return nextUsers;
        }
        return sortUsers([savedUser, ...nextUsers]);
      });

      setViewUser((current) => (current?.id === savedUser.id ? savedUser : current));
      setIsUserFormOpen(false);
      const updatedCurrentSessionUser = savedUser.id === user?.authId;
      if (updatedCurrentSessionUser) {
        await initializeAuthState();
        await refreshBranding(true);
      }
      await fetchRootAdmins();
      if (selectedOrganization) {
        await fetchOrganizationUsers(selectedOrganization.id, usersSearch);
      }
      await fetchOrganizations();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save user"));
    } finally {
      setSavingUser(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setSavingUser(true);
    try {
      await deleteRootUser(userToDelete.id);
      toast.success("User deleted permanently");
      setIsDeleteOpen(false);
      setUserToDelete(null);
      await fetchRootAdmins();
      if (selectedOrganization) {
        await fetchOrganizationUsers(selectedOrganization.id, usersSearch);
      }
      await fetchOrganizations();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete user"));
    } finally {
      setSavingUser(false);
    }
  };

  const userColumns = [
    {
      key: "name",
      header: "Name",
      render: (item: RootOrgUser) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            {item.profileImageUrl ? <AvatarImage src={item.profileImageUrl} alt={item.fullName} className="object-cover" /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {item.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{item.fullName}</span>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (item: RootOrgUser) => <span className="text-muted-foreground">{item.email}</span>, hideOnMobile: true },
    {
      key: "role",
      header: "Role",
      render: (item: RootOrgUser) => (
        <StatusBadge variant={getRoleBadgeVariant(item.roleKey)} showDot={false}>
          {formatRoleLabel(item.roleKey)}
        </StatusBadge>
      ),
    },
    { key: "plant", header: "Plant", render: (item: RootOrgUser) => item.plantName || "-", hideOnMobile: true },
    {
      key: "status",
      header: "Status",
      render: (item: RootOrgUser) => (
        <StatusBadge variant={item.isActive ? "active" : "inactive"}>
          {item.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (item: RootOrgUser) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openViewUser(item)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openEditUser(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => {
              setUserToDelete(item);
              setIsDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Organizations - Users"
        subtitle="Manage platform root admins and organization-scoped users"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={openCreateRootAdmin} className="gap-2 w-full sm:w-auto">
              <Shield className="h-4 w-4" />
              Add Root Admin
            </Button>
            <Button onClick={openCreateUser} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Organizations</p>
              <p className="text-xl font-semibold">{governanceSummary.totalOrganizations}</p>
            </div>
            <Building2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Root Admins</p>
              <p className="text-xl font-semibold">{governanceSummary.totalRootAdmins}</p>
            </div>
            <Shield className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Superadmins</p>
              <p className="text-xl font-semibold">{governanceSummary.totalSuperadmins}</p>
            </div>
            <Users2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Admins</p>
              <p className="text-xl font-semibold">{governanceSummary.totalAdmins}</p>
            </div>
            <Users2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Plants</p>
              <p className="text-xl font-semibold">{governanceSummary.totalPlants}</p>
            </div>
            <Factory className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Platform Root Admins ({filteredRootAdmins.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search root admins..."
                  value={rootAdminsSearch}
                  onChange={(event) => setRootAdminsSearch(event.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            }
          />
        }
      >
        {rootAdminsLoading ? (
          <TableSkeleton />
        ) : filteredRootAdmins.length === 0 ? (
          <EmptyState
            title="No platform root admins found"
            description="Create a root admin and assign them to an active organization."
          />
        ) : (
          <ResponsiveTable
            data={filteredRootAdmins}
            columns={userColumns}
            keyExtractor={(item) => item.id}
            mobileCard={(item) => (
              <MobileCard
                onView={() => openViewUser(item)}
                onEdit={() => openEditUser(item)}
                onDelete={() => {
                  setUserToDelete(item);
                  setIsDeleteOpen(true);
                }}
              >
                <MobileCardHeader
                  title={item.fullName}
                  subtitle={item.email}
                  badge={
                    <StatusBadge variant={item.isActive ? "active" : "inactive"}>
                      {item.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  }
                />
                <MobileCardRow
                  label="Role"
                  value={
                    <StatusBadge variant={getRoleBadgeVariant(item.roleKey)} showDot={false}>
                      {formatRoleLabel(item.roleKey)}
                    </StatusBadge>
                  }
                />
                <MobileCardRow label="Organization" value={item.organizationName || organizationNameById.get(item.organizationId) || "-"} />
                <MobileCardRow label="Plant" value="Platform" />
              </MobileCard>
            )}
          />
        )}
      </DataTableShell>

      <DataTableShell
        title={
          <span className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organizations ({filteredOrganizations.length})
          </span>
        }
        toolbar={
          <Toolbar
            right={
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search organizations..."
                  value={orgSearch}
                  onChange={(event) => setOrgSearch(event.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            }
          />
        }
      >
        {orgLoading ? (
          <TableSkeleton />
        ) : filteredOrganizations.length === 0 ? (
          <EmptyState title="No organizations found" description="Create an organization first to manage users." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrganizations.map((organization) => (
              <Card key={organization.id} className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <div className="h-12 w-12 rounded-lg border bg-muted/40 p-2 flex items-center justify-center overflow-hidden">
                      {organization.logoUrl ? (
                        <img src={organization.logoUrl} alt={organization.name} className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{organization.name}</p>
                      <p className="text-xs text-muted-foreground">{organization.code || "-"}</p>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 p-2 text-center">
                      <p className="font-semibold">{organization.superadminsCount ?? 0}</p>
                      <p className="text-muted-foreground">Superadmins</p>
                    </div>
                    <div className="rounded-md border border-border/60 p-2 text-center">
                      <p className="font-semibold">{organization.adminsCount ?? 0}</p>
                      <p className="text-muted-foreground">Admins</p>
                    </div>
                    <div className="rounded-md border border-border/60 p-2 text-center">
                      <p className="font-semibold">{organization.plantsCount ?? 0}</p>
                      <p className="text-muted-foreground">Plants</p>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => openOrganizationUsers(organization)}>
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DataTableShell>

      <ViewDialog
        open={usersDialogOpen}
        onOpenChange={setUsersDialogOpen}
        title={selectedOrganization?.name || "Organization Users"}
        subtitle="Manage users and assigned roles for this organization"
        contentClassName="sm:max-w-[980px]"
      >
        {selectedOrganization && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
              <div className="h-12 w-12 rounded-lg border bg-muted/40 p-2 flex items-center justify-center overflow-hidden">
                {selectedOrganization.logoUrl ? (
                  <img src={selectedOrganization.logoUrl} alt={selectedOrganization.name} className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-semibold">{selectedOrganization.name}</p>
                <p className="text-xs text-muted-foreground">{selectedOrganization.code || "-"}</p>
              </div>
            </div>

            <Toolbar
              right={
                <>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={usersSearch}
                      onChange={(event) => setUsersSearch(event.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                </>
              }
            />

            {usersLoading ? (
              <TableSkeleton />
            ) : users.length === 0 ? (
              <EmptyState title="No managed users" description="Create users with the roles configured for this organization." />
            ) : (
              <ResponsiveTable
                data={users}
                columns={userColumns}
                keyExtractor={(item) => item.id}
                mobileCard={(item) => (
                  <MobileCard
                    onView={() => openViewUser(item)}
                    onEdit={() => openEditUser(item)}
                    onDelete={() => {
                      setUserToDelete(item);
                      setIsDeleteOpen(true);
                    }}
                  >
                    <MobileCardHeader
                      title={item.fullName}
                      subtitle={item.email}
                      badge={
                        <StatusBadge variant={item.isActive ? "active" : "inactive"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
                      }
                    />
                    <MobileCardRow
                      label="Role"
                      value={
                        <StatusBadge variant={getRoleBadgeVariant(item.roleKey)} showDot={false}>
                          {formatRoleLabel(item.roleKey)}
                        </StatusBadge>
                      }
                    />
                    <MobileCardRow label="Organization" value={item.organizationName || "-"} />
                    {roleRequiresPlant(item.roleKey) ? <MobileCardRow label="Plant" value={item.plantName || "-"} /> : null}
                  </MobileCard>
                )}
              />
            )}
          </div>
        )}
      </ViewDialog>

      <ViewDialog
        open={isUserViewOpen}
        onOpenChange={setIsUserViewOpen}
        title={viewUser?.fullName || "User Details"}
        subtitle={normalizeRoleKey(viewUser?.roleKey || "") === "ROOT_ADMIN" ? "Platform Root Admin" : viewUser?.userCode || viewUser?.email}
      >
        {viewUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b pb-4">
              <Avatar className="h-16 w-16">
                {viewUser.profileImageUrl ? <AvatarImage src={viewUser.profileImageUrl} alt={viewUser.fullName} className="object-cover" /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {viewUser.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{viewUser.fullName}</p>
                <p className="text-muted-foreground">{viewUser.email}</p>
              </div>
            </div>
            <DetailSection title="User Information">
              <DetailRow label="Full Name" value={viewUser.fullName} />
              <DetailRow label="Email" value={viewUser.email} />
              <DetailRow label="Phone" value={viewUser.phone || "-"} />
              <DetailRow label="User Code" value={viewUser.userCode || "-"} />
            </DetailSection>
            <DetailSection title="Role & Scope">
              <DetailRow
                label="Role"
                value={
                  <StatusBadge variant={getRoleBadgeVariant(viewUser.roleKey)} showDot={false}>
                    {formatRoleLabel(viewUser.roleKey)}
                  </StatusBadge>
                }
              />
              <DetailRow label="Scope" value={normalizeRoleKey(viewUser.roleKey) === "ROOT_ADMIN" ? "Platform" : "Organization"} />
              <DetailRow label="Organization" value={viewUser.organizationName || organizationNameById.get(viewUser.organizationId) || selectedOrganization?.name || "-"} />
              {roleRequiresPlant(viewUser.roleKey) ? <DetailRow label="Plant" value={viewUser.plantName || "-"} /> : null}
              <DetailRow
                label="Status"
                value={
                  <StatusBadge variant={viewUser.isActive ? "active" : "inactive"}>
                    {viewUser.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                }
              />
              <DetailRow label="Created" value={new Date(viewUser.createdAt).toLocaleDateString()} />
            </DetailSection>
          </div>
        )}
      </ViewDialog>

      <FormDialog
        open={isUserFormOpen}
        onOpenChange={setIsUserFormOpen}
        title={
          userFormMode === "root-admin"
            ? editingUser
              ? "Edit Root Admin"
              : "Create Root Admin"
            : editingUser
            ? "Edit User"
            : "Create User"
        }
        description={
          userFormMode === "root-admin"
            ? "Create or update a root admin and assign the organization they manage."
            : editingUser
            ? "Update user role and organization scope"
            : "Create a user from the selected organization role catalog"
        }
        onSubmit={handleSaveUser}
        submitLabel={savingUser ? "Saving..." : editingUser ? "Update" : "Create"}
        size="lg"
      >
        <FormGrid>
          <div className="sm:col-span-2">
            <ProfileImageField
              value={userForm.profileImageUrl}
              onChange={(value) => setUserForm((prev) => ({ ...prev, profileImageUrl: value }))}
              fallbackText={userForm.fullName || userForm.userCode || "User"}
              name={userForm.fullName || "User"}
            />
          </div>
          <InputField
            label="Full Name"
            value={userForm.fullName}
            onChange={(value) => setUserForm((prev) => ({ ...prev, fullName: value }))}
            required
          />
          <InputField
            label="Email"
            type="email"
            value={userForm.email}
            onChange={(value) => setUserForm((prev) => ({ ...prev, email: value }))}
            required
          />
          <InputField
            label="Password"
            type="password"
            value={userForm.password}
            onChange={(value) => setUserForm((prev) => ({ ...prev, password: value }))}
            placeholder={editingUser ? "Leave blank to keep current password" : "Minimum 8 characters"}
            required={!editingUser}
          />
          <InputField
            label="Phone"
            value={userForm.phone}
            onChange={(value) => setUserForm((prev) => ({ ...prev, phone: value }))}
          />
          <InputField
            label="User Code"
            value={userForm.userCode}
            onChange={(value) => setUserForm((prev) => ({ ...prev, userCode: value }))}
            placeholder="Auto generated if blank"
          />
          <SelectField
            label="Role"
            value={userForm.roleKey}
            onChange={(value) =>
              setUserForm((prev) => ({
                ...prev,
                roleKey: value,
                plantId: "",
              }))
            }
            options={roleOptions}
            required
            disabled={userFormMode === "root-admin"}
          />
          <SelectField
            label="Organization"
            value={userForm.organizationId}
            onChange={(value) => {
              setUserForm((prev) => ({ ...prev, organizationId: value, plantId: "" }));
              void fetchOrgRoles(value);
            }}
            options={organizationOptions}
            placeholder="Select organization"
            required
            hint={
              isRootAdminRoleForm
                ? "Root admins can be assigned to any active organization."
                : roleRequiresPlant(userForm.roleKey)
                ? "Select the organization first, then choose a plant inside it."
                : "Organization selection controls the live role list for this user."
            }
          />
          {roleRequiresPlant(userForm.roleKey) ? (
            <SelectField
              label="Plant"
              value={userForm.plantId}
              onChange={(value) => setUserForm((prev) => ({ ...prev, plantId: value }))}
              options={plantOptions}
              placeholder={userForm.organizationId ? "Select plant" : "Select organization first"}
              disabled={!userForm.organizationId}
              required
              hint="Scoped roles must be assigned to a plant inside the selected organization."
            />
          ) : null}
          <SelectField
            label="Status"
            value={userForm.isActive ? "Active" : "Inactive"}
            onChange={(value) => setUserForm((prev) => ({ ...prev, isActive: value === "Active" }))}
            options={[
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
        </FormGrid>
      </FormDialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={normalizeRoleKey(userToDelete?.roleKey || "") === "ROOT_ADMIN" ? "Delete Root Admin" : "Delete User"}
        description="This permanently removes the selected user from the database for Root Admin."
        itemName={userToDelete?.fullName}
        onConfirm={confirmDeleteUser}
        isLoading={savingUser}
      />
    </PageShell>
  );
}
